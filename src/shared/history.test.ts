import test from 'node:test'
import assert from 'node:assert/strict'
import { firstWhole, mayLoadOlder, prependOlder, sectionWindow } from './history.ts'
import type { Candle } from './types.ts'

const c = (time: number): Candle => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 0 })
const times = (a: Candle[]) => a.map((x) => x.time)

test('prependOlder keeps only bars older than the first, drops duplicates, sorts', () => {
  assert.deepEqual(times(prependOlder([c(300), c(400)], [c(300), c(100), c(200), c(200), c(400)])), [100, 200, 300, 400])
})

test('prependOlder cuts the oldest bars at the limit', () => {
  assert.deepEqual(times(prependOlder([c(300), c(400)], [c(100), c(200)], 3)), [200, 300, 400])
})

test('prependOlder replaces the oldest bar with the section copy, which is whole', () => {
  const partial = { ...c(300), volume: 5 }
  const whole = { ...c(300), volume: 9 }
  const merged = prependOlder([partial, c(400)], [c(200), whole])
  assert.deepEqual(times(merged), [200, 300, 400])
  assert.equal(merged[1].volume, 9)
})

test('prependOlder with nothing new returns the same bars', () => {
  assert.deepEqual(times(prependOlder([c(300)], [c(300), c(500)])), [300])
})

test('firstWhole rounds up to the bucket grid, with offset', () => {
  assert.equal(firstWhole(14_400, 14_400), 14_400)
  assert.equal(firstWhole(14_401, 14_400), 28_800)
  assert.equal(firstWhole(3_000, 3_600, 1_800), 5_400)
})

test('sectionWindow ends at before, starts days earlier', () => {
  assert.deepEqual(sectionWindow(5, 1_000_000, 2_000_000), [1_000_000 - 5 * 86400, 1_000_000])
  assert.deepEqual(sectionWindow(5, undefined, 2_000_000), [2_000_000 - 5 * 86400, 2_000_000])
  assert.deepEqual(sectionWindow(0, 1_000_000, 2_000_000), [0, 1_000_000])
})

test('sectionWindow respects a cap with one day of margin and reports the end', () => {
  const now = 100 * 86400
  assert.deepEqual(sectionWindow(30, now - 50 * 86400, now, 60), [now - 59 * 86400, now - 50 * 86400])
  assert.equal(sectionWindow(30, now - 59 * 86400, now, 60), null)
})

test('mayLoadOlder waits after a failed section instead of asking again at once', () => {
  const ok = { ready: true, busy: false, done: false, retryAt: 0 }
  assert.equal(mayLoadOlder(ok, 1000), true)
  assert.equal(mayLoadOlder({ ...ok, retryAt: 5000 }, 1000), false)
  assert.equal(mayLoadOlder({ ...ok, retryAt: 5000 }, 5000), true)
  assert.equal(mayLoadOlder({ ...ok, busy: true }, 1000), false)
  assert.equal(mayLoadOlder({ ...ok, done: true }, 1000), false)
  assert.equal(mayLoadOlder({ ...ok, ready: false }, 1000), false)
})
