import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createArchive } from './archiveFile.ts'
import { settleEntry, type ArchiveEntry } from '../shared/archive.ts'
import { QUANTILES } from '../shared/forecast.ts'

const DAY = 86400
const MON = Date.UTC(2026, 10, 2, 14, 30) / 1000
const NOW = MON + 60 * DAY

function entry(k: number, over: Partial<ArchiveEntry> = {}): ArchiveEntry {
  const base = MON + k * 10 * DAY
  const times = Array.from({ length: 8 }, (_, i) => base + (i + 1) * DAY)
  return {
    id: 'e' + k,
    symbol: 'AAPL',
    timeframe: '1D',
    provider: 'yahoo',
    extended: false,
    timeZone: 'America/New_York',
    createdAt: base,
    baseTime: base,
    base: 100,
    times,
    steps: times.map(() => QUANTILES.map((l) => 100 * (1 + (l - 0.5) * 0.4))),
    factor: null,
    auto: false,
    appVersion: '0.4.0',
    ...over
  }
}
const settlementOf = (e: ArchiveEntry) => {
  const s = settleEntry(e, e.times.map((time) => ({ time, open: 100, high: 100, low: 100, close: 100, volume: 1 })), NOW)
  assert.ok(typeof s === 'object')
  return s
}
const dir = () => mkdtemp(join(tmpdir(), 'kandleos-archive-'))

test('add stores one forecast per candle and due lists only finished ones', async () => {
  const a = createArchive(await dir())
  assert.equal(await a.add(entry(0)), true)
  assert.equal(await a.add({ ...entry(0), id: 'again', baseTime: entry(0).baseTime + 60 }), false)
  assert.equal(await a.add({ ...entry(1), symbol: '..' }), false)
  assert.deepEqual((await a.due(undefined, MON)).map((e) => e.id), [])
  assert.deepEqual((await a.due(undefined, NOW)).map((e) => e.id), ['e0'])
  assert.deepEqual((await a.due('MSFT', NOW)).map((e) => e.id), [])
})

test('settle updates the summary and survives a new instance', async () => {
  const d = await dir()
  const a = createArchive(d)
  await a.add(entry(0))
  await a.add(entry(1))
  await a.settle('e0', settlementOf(entry(0)))
  await a.settle('e1', 'unsettleable')
  const b = createArchive(d)
  assert.deepEqual(await b.due(undefined, NOW), [])
  const rows = Object.values(await b.summary())
  assert.equal(rows.length, 1)
  assert.equal(rows[0].settled, 1)
})

test('a half written last line is skipped and adding still works', async () => {
  const d = await dir()
  await writeFile(join(d, 'archive.jsonl'), JSON.stringify({ entry: entry(0) }) + '\n{"entry":{"id"', 'utf8')
  const a = createArchive(d)
  assert.deepEqual((await a.due(undefined, NOW)).map((e) => e.id), ['e0'])
  assert.equal(await a.add(entry(1)), true)
  assert.deepEqual((await createArchive(d).due(undefined, NOW)).map((e) => e.id), ['e0', 'e1'])
})

test('past the raw limit the oldest settled forecasts go and the summary keeps them', async () => {
  const d = await dir()
  const a = createArchive(d, 5000)
  for (let k = 0; k < 5; k++) await a.add(entry(k))
  for (let k = 0; k < 5; k++) await a.settle('e' + k, settlementOf(entry(k)))
  const text = await readFile(join(d, 'archive.jsonl'), 'utf8')
  assert.ok(text.length <= 5000, `size ${text.length}`)
  assert.ok(!text.includes('"e0"'))
  assert.equal(Object.values(await createArchive(d, 5000).summary())[0].settled, 5)
})

test('a summary that cannot be read (not just missing) is never overwritten with recomputed totals', async () => {
  const d = await dir()
  const a = createArchive(d)
  await a.add(entry(0))
  // A folder where the file should be: reading fails with something other than "not found", like a locked file.
  await mkdir(join(d, 'summary.json'))
  const b = createArchive(d)
  await assert.rejects(b.summary())
  await assert.rejects(b.settle('e0', settlementOf(entry(0))))
})

test('export, clear and import bring the archive back', async () => {
  const a = createArchive(await dir())
  await a.add(entry(0))
  await a.settle('e0', settlementOf(entry(0)))
  await a.add(entry(1))
  const saved = await a.exportData()
  await a.clear()
  assert.deepEqual(await a.summary(), {})
  await a.importData({ archive: saved.archive + '\nnot json', summary: saved.summary })
  assert.equal(Object.values(await a.summary())[0].settled, 1)
  assert.deepEqual((await a.due(undefined, NOW)).map((e) => e.id), ['e1'])
  // A broken summary is recomputed from the lines.
  await a.importData({ archive: saved.archive, summary: { x: 1 } })
  assert.equal(Object.values(await a.summary())[0].settled, 1)
})
