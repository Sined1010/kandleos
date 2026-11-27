import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readOrMissing, readStore, writeAtomic, type Files } from './storeFile.ts'
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
  await Promise.all([writeAtomic(f, '{"state":{"v":1},"version":8}'), writeAtomic(f, '{"state":{"v":2},"version":8}')])
  assert.equal(await readStore(f), '{"state":{"v":2},"version":8}')
})

test('a write killed before its rename leaves the previous store readable', async () => {
  const f = memFiles()
  await writeAtomic(f, '{"state":{"v":1},"version":8}')
  f.crashNextRename()
  await writeAtomic(f, '{"state":{"v":2},"version":8}').catch(() => {})
  assert.equal(await readStore(f), '{"state":{"v":1},"version":8}')
})

test('readStore falls back to a valid temp file when the store file is gone', async () => {
  const f = memFiles()
  f.disk.set('store.json.tmp', '{"state":{"v":3},"version":8}')
  assert.equal(await readStore(f), '{"state":{"v":3},"version":8}')
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
  f.disk.set('store.json.tmp', '{"state":{"v":4},"version":8}')
  assert.equal(await readStore(f), '{"state":{"v":4},"version":8}')
})

test('an unreadable store is set aside before the app starts with defaults, so nothing overwrites it', async () => {
  const f = memFiles()
  f.disk.set('store.json', '{"state":{"drawi')
  assert.equal(await readStore(f, 1700000000000), null)
  assert.equal(f.disk.get('store.json'), undefined)
  assert.equal(f.disk.get('store.broken-1700000000000.json'), '{"state":{"drawi')
})

test('no store file yet: nothing to set aside', async () => {
  const f = memFiles()
  assert.equal(await readStore(f, 1), null)
  assert.equal(f.disk.size, 0)
})

test('readOrMissing gives null only for a file that is not there, not for one that cannot be read', async () => {
  const fail = async (): Promise<string> => {
    throw new Error('out of memory')
  }
  assert.equal(await readOrMissing(async () => 'x', async () => true), 'x')
  assert.equal(await readOrMissing(fail, async () => false), null)
  await assert.rejects(readOrMissing(fail, async () => true), /out of memory/)
})

test('readStore lets a read error through, so the app locks the store instead of saving defaults over it', async () => {
  const f = memFiles()
  f.read = async () => {
    throw new Error('I/O error')
  }
  await assert.rejects(readStore(f), /I\/O error/)
})

test('readStore reports a store it set aside, so the app can say why it starts empty', async () => {
  const f = memFiles()
  f.disk.set('store.json', '{"st')
  let told = 0
  await readStore(f, 1, () => told++)
  assert.equal(told, 1)
})

test('a store of the wrong shape is set aside too, so the phone can save again (it has no import to get out)', async () => {
  const f = memFiles()
  const bad = JSON.stringify({ state: { folders: 5 }, version: 8 })
  f.disk.set('store.json', bad)
  assert.equal(await readStore(f, 7), null)
  assert.equal(f.disk.get('store.broken-7.json'), bad)
})

test('a store from a newer version stays where it is (the app says to update and saves nothing)', async () => {
  const f = memFiles()
  const newer = JSON.stringify({ state: { folders: 5 }, version: 99 })
  f.disk.set('store.json', newer)
  assert.equal(await readStore(f, 7), newer)
})
