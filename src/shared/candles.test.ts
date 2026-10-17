import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregate, logicalToTime, mergeTick, timeToLogical } from './candles.ts'

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
