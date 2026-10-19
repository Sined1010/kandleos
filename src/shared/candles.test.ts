import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregate, futureTimes, logicalToTime, mergeTick, timeToLogical } from './candles.ts'

const utc = (d: number, h = 0, m = 0) => Date.UTC(2026, 9, d, h, m) / 1000 // October 2026; the 16th is a Friday

test('futureTimes keeps crypto continuous', () => {
  const hours = Array.from({ length: 200 }, (_, i) => utc(1) + i * 3600)
  assert.deepEqual(futureTimes(hours, 3600, 3), [1, 2, 3].map((k) => hours.at(-1)! + k * 3600))
})

test('futureTimes skips weekends for daily stock bars', () => {
  const days = [5, 6, 7, 8, 9, 12, 13, 14, 15, 16].map((d) => utc(d, 13, 30)) // Mon-Fri only
  assert.deepEqual(futureTimes(days, 86400, 2), [utc(19, 13, 30), utc(20, 13, 30)]) // Fri -> Mon, Tue
})

test('futureTimes skips nights and weekends for intraday stock bars', () => {
  const session = [13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5] // 13:30 ... 19:30 UTC hourly bars
  const bars = [12, 13, 14, 15, 16].flatMap((d) => session.map((h) => utc(d, Math.floor(h), (h % 1) * 60)))
  assert.deepEqual(futureTimes(bars, 3600, 2), [utc(19, 13, 30), utc(19, 14, 30)]) // Fri 19:30 -> Mon 13:30
})

test('futureTimes continues a live bar stamped with the current time on the session grid', () => {
  const session = [13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5]
  const bars = [12, 13, 14, 15, 16].flatMap((d) => session.map((h) => utc(d, Math.floor(h), (h % 1) * 60)))
  bars.splice(-3, 3, utc(16, 17, 48)) // Yahoo: the bar in progress carries "now", the rest of Friday is missing
  assert.deepEqual(futureTimes(bars, 3600, 3), [utc(16, 18, 30), utc(16, 19, 30), utc(19, 13, 30)])
})

test('futureTimes keeps even spacing for gap-free history, even after an off-grid last bar', () => {
  const bars = [utc(12, 13, 30), utc(12, 14, 30), utc(12, 14, 47)]
  assert.deepEqual(futureTimes(bars, 3600, 2), [utc(12, 15, 47), utc(12, 16, 47)])
})

test('timeToLogical / logicalToTime round-trip inside, between and beyond bars', () => {
  const times = [100, 160, 400, 460] // gap between 160 and 400
  assert.equal(timeToLogical(times, 160, 60), 1)
  assert.equal(timeToLogical(times, 280, 60), 1.5)
  assert.equal(timeToLogical(times, 580, 60), 5)
  assert.equal(timeToLogical(times, 40, 60), -1)
  for (const t of [40, 100, 130, 280, 460, 580]) assert.equal(logicalToTime(times, timeToLogical(times, t, 60), 60), t)
})

const c = (time: number, o: number, h: number, l: number, cl: number, v = 1) => ({
  time,
  open: o,
  high: h,
  low: l,
  close: cl,
  volume: v
})

test('aggregate groups hourly bars into 4h buckets', () => {
  const out = aggregate([c(0, 1, 2, 0.5, 1.5), c(3600, 1.5, 3, 1, 2), c(14400, 2, 2.5, 1.8, 2.2)], 14400)
  assert.deepEqual(out, [c(0, 1, 3, 0.5, 2, 2), c(14400, 2, 2.5, 1.8, 2.2)])
})

test('mergeTick updates the open bar and opens the next one on the grid', () => {
  const last = c(1000, 10, 11, 9, 10)
  assert.deepEqual(mergeTick(last, 12, 1030, 60), c(1000, 10, 12, 9, 12))
  assert.deepEqual(mergeTick(last, 8, 1200, 60), c(1180, 8, 8, 8, 8, 0))
})
