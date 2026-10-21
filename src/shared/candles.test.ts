import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregate, aggregateMonths, logicalToTime, mergeTick, timeToLogical } from './candles.ts'

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

const at = (y: number, m: number, d = 1, h = 0) => Date.UTC(y, m - 1, d, h) / 1000

test('aggregateMonths groups monthly bars into calendar quarters and years', () => {
  const months = [c(at(2025, 11), 1, 2, 1, 2), c(at(2025, 12), 2, 3, 2, 3), c(at(2026, 1), 3, 5, 2, 4), c(at(2026, 2), 4, 4, 1, 1)]
  assert.deepEqual(aggregateMonths(months, 3), [c(at(2025, 10), 1, 3, 1, 3, 2), c(at(2026, 1), 3, 5, 1, 1, 2)])
  assert.deepEqual(aggregateMonths(months, 12), [c(at(2025, 1), 1, 3, 1, 3, 2), c(at(2026, 1), 3, 5, 1, 1, 2)])
})

test('aggregateMonths reads Yahoo bars in the exchange zone (Berlin midnight is 22:00 UTC the day before)', () => {
  const months = [c(at(2026, 3, 31, 22), 1, 2, 1, 2), c(at(2026, 4, 30, 22), 2, 3, 2, 3), c(at(2026, 6, 30, 22), 3, 4, 3, 4)]
  // April and May form Q2 (stamped at midnight Berlin on April 1st), July opens Q3.
  assert.deepEqual(aggregateMonths(months, 3, 'Europe/Berlin'), [
    c(at(2026, 3, 31, 22), 1, 3, 1, 3, 2),
    c(at(2026, 6, 30, 22), 3, 4, 3, 4)
  ])
})

test('mergeTick keeps month-based bars open until the calendar period ends', () => {
  const october = c(at(2026, 10), 10, 11, 9, 10)
  // October 31st is more than 30 days after the 1st but still the same month.
  assert.deepEqual(mergeTick(october, 12, at(2026, 10, 31, 15), 2592000, 1), c(at(2026, 10), 10, 12, 9, 12))
  assert.deepEqual(mergeTick(october, 8, at(2026, 11, 2, 15), 2592000, 1), c(at(2026, 11), 8, 8, 8, 8, 0))
  // A quarter opened in October runs through December.
  assert.equal(mergeTick(october, 8, at(2026, 12, 20), 7776000, 3).time, at(2026, 10))
  assert.equal(mergeTick(october, 8, at(2027, 1, 4), 7776000, 3).time, at(2027, 1))
})
