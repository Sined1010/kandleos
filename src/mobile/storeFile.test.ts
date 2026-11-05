import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readStore, writeAtomic, type Files } from './storeFile.ts'
import { createCandleCache } from './candleCache.ts'

/** Files in memory; `crashAfterWrite` makes the next rename fail as if the app was killed right then. */
function memFiles() {
  const disk = new Map<string, string>()
  let crash = false
  const f: Files & { disk: Map<string, string>; crashNextRename(): void } = {
    disk,
    crashNextRename: () => void (crash = true),
    read: async (p) => disk.get(p) ?? null,
    write: async (p, s) => void disk.set(p, s),
    rename: async (a, b) => {
      if (crash) {
        crash = false
        throw new Error('killed')
      }
      const s = disk.get(a)
      if (s === undefined) throw new Error('missing ' + a)
      disk.delete(a)
      disk.set(b, s)
    },
    remove: async (p) => void disk.delete(p)
  }
  return f
}

test('writeAtomic called twice in a row ends with the second value', async () => {
  const f = memFiles()
  await Promise.all([writeAtomic(f, '{"v":1}'), writeAtomic(f, '{"v":2}')])
  assert.equal(await readStore(f), '{"v":2}')
})

test('a write killed before its rename leaves the previous store readable', async () => {
  const f = memFiles()
  await writeAtomic(f, '{"v":1}')
  f.crashNextRename()
  await writeAtomic(f, '{"v":2}').catch(() => {})
  assert.equal(await readStore(f), '{"v":1}')
})

test('readStore falls back to a valid temp file when the store file is gone', async () => {
  const f = memFiles()
  f.disk.set('store.json.tmp', '{"v":3}')
  assert.equal(await readStore(f), '{"v":3}')
})

test('readStore ignores a broken temp file', async () => {
  const f = memFiles()
  f.disk.set('store.json.tmp', '{"v":')
  assert.equal(await readStore(f), null)
})

const bars = (n: number) => Array.from({ length: n }, (_, i) => ({ time: i, open: 1, high: 1, low: 1, close: 1, volume: 0 }))

test('candle cache keeps 20 charts and drops the oldest', async () => {
  const f = memFiles()
  const c = createCandleCache(f)
  await c.load()
  for (let i = 0; i < 21; i++) await c.put(`S${i}`, '1D', { candles: bars(3), currency: 'USD' })
  assert.equal(c.get('S0', '1D'), null)
  assert.equal(c.get('S20', '1D')?.candles.length, 3)
})

test('candle cache stores only the newest 2000 bars', async () => {
  const c = createCandleCache(memFiles())
  await c.load()
  await c.put('BTCUSDT', '1h', { candles: bars(3000), currency: 'USDT' })
  const got = c.get('BTCUSDT', '1h')!.candles
  assert.equal(got.length, 2000)
  assert.equal(got[0].time, 1000)
})

test('candle cache gives back what it stored after a restart', async () => {
  const f = memFiles()
  const a = createCandleCache(f)
  await a.load()
  await a.put('AAPL', '1D', { candles: bars(5), currency: 'USD', timezone: 'America/New_York', provider: 'yahoo' })
  const b = createCandleCache(f)
  await b.load()
  assert.deepEqual(b.get('AAPL', '1D'), { candles: bars(5), currency: 'USD', timezone: 'America/New_York', provider: 'yahoo' })
})

test('an empty or broken store file falls back to a valid temp file', async () => {
  const f = memFiles()
  f.disk.set('store.json', '')
  f.disk.set('store.json.tmp', '{"v":4}')
  assert.equal(await readStore(f), '{"v":4}')
})
