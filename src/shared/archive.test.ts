import test from 'node:test'
import assert from 'node:assert/strict'
import { addToSummary, closesAt, givenUp, parseEntry, roundSig, settleBefore, settleEntry, shouldArchive, slotOf, type ArchiveEntry, type SummaryRow } from './archive.ts'
import { QUANTILES } from './forecast.ts'
import type { Candle } from './types.ts'

const DAY = 86400
const NY = 'America/New_York'
// Mon 2 Nov 2026 14:30 UTC = 9:30 New York.
const MON = Date.UTC(2026, 10, 2, 14, 30) / 1000
// Quantiles spread ±10 % around a median.
const around = (m: number) => QUANTILES.map((l) => m * (1 + (l - 0.5) * 0.4))
const bar = (time: number, close: number): Candle => ({ time, open: close, high: close, low: close, close, volume: 1 })

function entry(over: Partial<ArchiveEntry> = {}): ArchiveEntry {
  const times = Array.from({ length: 8 }, (_, i) => MON + (i + 1) * DAY)
  return {
    id: 'a1',
    symbol: 'AAPL',
    timeframe: '1D',
    provider: 'yahoo',
    extended: false,
    timeZone: NY,
    createdAt: MON,
    baseTime: MON,
    base: 100,
    times,
    steps: times.map(() => around(100)),
    factor: null,
    auto: false,
    appVersion: '0.4.0',
    ...over
  }
}

test('slotOf puts times of one trading day together and keeps intraday bars apart', () => {
  // 23:30 UTC on Monday and 00:30 UTC on Tuesday are both Monday evening in New York.
  const late = Date.UTC(2026, 10, 2, 23, 30) / 1000
  assert.equal(slotOf(late, '1D', NY), slotOf(late + 3600, '1D', NY))
  assert.notEqual(slotOf(MON, '1D', NY), slotOf(MON + DAY, '1D', NY))
  assert.equal(slotOf(MON, '1h', NY), slotOf(MON + 600, '1h', NY))
  assert.notEqual(slotOf(MON, '1h', NY), slotOf(MON + 3600, '1h', NY))
  // A weekly bar stamped on Wednesday belongs to the week starting Monday.
  assert.equal(slotOf(MON + 2 * DAY, '1W', NY), slotOf(MON, '1W', NY))
})

test('shouldArchive keeps one forecast per candle and drops overlapping automatic ones', () => {
  const first = entry()
  assert.equal(shouldArchive(entry({ baseTime: MON + 3600 }), [first]), false) // same trading day
  assert.equal(shouldArchive(entry({ baseTime: MON + DAY }), [first]), true) // clicked on the next candle
  assert.equal(shouldArchive(entry({ baseTime: MON + DAY, auto: true }), [first]), false) // overlaps the first
  const after = first.times[first.times.length - 1]
  assert.equal(shouldArchive(entry({ baseTime: after, auto: true }), [first]), true)
  assert.equal(shouldArchive(first, []), true)
})

test('settleEntry scores against the real closes of the same trading days', () => {
  const e = entry()
  const now = MON + 20 * DAY
  // Yahoo stamps daily bars at the session open, not at the forecast's guessed time of day.
  const candles = e.times.map((t) => bar(t - 5 * 3600, 100))
  const s = settleEntry(e, candles, now)
  assert.ok(typeof s === 'object')
  assert.equal(s.steps, 8)
  assert.equal(s.hits.raw.in80, 1)
  assert.equal(s.err, 0)
  assert.equal(s.end, e.times[7])
})

test('settleEntry counts a holiday as missing and still settles', () => {
  const e = entry()
  const candles = e.times.filter((_, i) => i !== 3).map((t) => bar(t, 105))
  const s = settleEntry(e, candles, MON + 20 * DAY)
  assert.ok(typeof s === 'object')
  assert.equal(s.steps, 7)
  assert.equal(s.rose, true)
})

test('settleEntry waits for missing or unfinished bars and gives up after 30 days', () => {
  const e = entry()
  const few = e.times.slice(0, 5).map((t) => bar(t, 100)) // 3 of 8 missing
  const lastDone = e.times[7] + DAY
  assert.equal(settleEntry(e, few, lastDone + 2 * DAY), 'pending')
  assert.equal(settleEntry(e, few, lastDone + 31 * DAY), 'unsettleable')
  assert.equal(settleEntry(e, e.times.map((t) => bar(t, 100)), e.times[7]), 'pending') // last bar still running
})

test('givenUp drops a forecast whose source fails for more than 30 days after its last bar closed', () => {
  const e = entry()
  const closed = e.times[7] + DAY
  assert.equal(givenUp(e, closed + 29 * DAY), false)
  assert.equal(givenUp(e, closed + 31 * DAY), true)
})

test('settleBefore never asks for bars from the future', () => {
  const e = { ...entry(), timeframe: '3M' as const }
  const last = e.times[e.times.length - 1]
  // Settled as soon as the last 3-month bar has closed: two bars on would be half a year ahead.
  assert.equal(settleBefore(e, last + 91 * DAY + 0.5), last + 91 * DAY)
  assert.equal(settleBefore(entry(), last + 365 * DAY), last + 2 * DAY)
})

test('settleEntry also scores the ranges as shown when they were calibrated', () => {
  const e = entry({ factor: 3 })
  const s = settleEntry(e, e.times.map((t) => bar(t, 120)), MON + 20 * DAY)
  assert.ok(typeof s === 'object')
  assert.ok(s.hits.shown.in80 > s.hits.raw.in80, JSON.stringify(s.hits))
})

test('addToSummary counts independent forecasts only once their spans stop overlapping', () => {
  const rows: Record<string, SummaryRow> = {}
  const closes = (e: ArchiveEntry) => e.times.map((t) => bar(t, 100))
  for (const k of [0, 1, 2, 9]) {
    const e = entry({ id: 'e' + k, baseTime: MON + k * DAY, times: entry().times.map((t) => t + k * DAY) })
    const s = settleEntry(e, closes(e), MON + 40 * DAY)
    assert.ok(typeof s === 'object')
    addToSummary(rows, e, s)
  }
  const row = Object.values(rows)[0]
  assert.equal(row.settled, 4)
  assert.equal(row.independent, 2)
  assert.equal(row.chance.reduce((n, g) => n + g.cases, 0), 4)
})

test('roundSig keeps six significant digits', () => {
  assert.equal(roundSig(81234.56789), 81234.6)
  assert.equal(roundSig(0.000123456789), 0.000123457)
})

test('parseEntry rejects what main must not store', () => {
  assert.ok(parseEntry(entry()))
  assert.equal(parseEntry({ ...entry(), symbol: '..' }), null)
  assert.equal(parseEntry({ ...entry(), steps: entry().steps.map((s) => [...s, 1]) }), null)
  assert.equal(parseEntry({ ...entry(), base: NaN }), null)
  assert.equal(parseEntry({ ...entry(), timeZone: 'Not/AZone' }), null)
  assert.equal(parseEntry({ ...entry(), factor: 50 }), null)
  assert.equal(parseEntry(null), null)
})

test('closesAt ends month-based bars at the next calendar period, not after 30-day blocks', () => {
  const oct = Date.UTC(2026, 9, 1) / 1000 // Binance: October's bar at 00:00 UTC
  const months = (tf: ArchiveEntry['timeframe'], times: number[]) => closesAt({ timeframe: tf, timeZone: 'UTC', times })
  assert.equal(months('1M', [Date.UTC(2026, 8, 1) / 1000, oct]), Date.UTC(2026, 10, 1) / 1000) // 1 Nov, not 31 Oct
  assert.equal(months('12M', [Date.UTC(2025, 0, 1) / 1000, Date.UTC(2026, 0, 1) / 1000]), Date.UTC(2027, 0, 1) / 1000)
  assert.equal(closesAt(entry()), MON + 9 * DAY) // daily bars: one day after the last
})
