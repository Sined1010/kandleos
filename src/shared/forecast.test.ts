import test from 'node:test'
import assert from 'node:assert/strict'
import { backtest, backtestCutoffs, probabilityAbove, QUANTILES } from './forecast.ts'

// A step whose quantile values equal 100 + 100 × level: 101 at 1 %, 150 at the median, 199 at 99 %.
const step = QUANTILES.map((l) => 100 + 100 * l)

test('probabilityAbove reads the chance of a higher close off the quantiles', () => {
  assert.equal(probabilityAbove(step, 150), 0.5)
  assert.ok(Math.abs(probabilityAbove(step, 175) - 0.25) < 1e-9) // between the 70 % and 80 % levels
  // Outside the outermost quantiles the answer is capped at 99 % / 1 %.
  assert.ok(Math.abs(probabilityAbove(step, 50) - 0.99) < 1e-9)
  assert.ok(Math.abs(probabilityAbove(step, 500) - 0.01) < 1e-9)
  // Slightly crossing quantiles are tolerated.
  const crossed = [...step]
  ;[crossed[9], crossed[10]] = [crossed[10], crossed[9]]
  assert.equal(probabilityAbove(crossed, 150), 0.5)
})

test('backtestCutoffs steps back one horizon at a time while enough history is left', () => {
  assert.deepEqual(backtestCutoffs(1000, 64), [936, 872, 808])
  assert.deepEqual(backtestCutoffs(42, 5), [37, 32])
  assert.deepEqual(backtestCutoffs(35, 8), [])
})

test('backtest measures deviation, range hits and direction against the real closes', () => {
  // Real closes rise 100 -> 103 after the cutoff. Each forecast step spreads linearly around 101:
  // 80 % range 99..103, 50 % range 99.75..102.25.
  const closes = [100, 100, 101, 102, 103]
  const f = [1, 2, 3].map(() => QUANTILES.map((l) => 101 + (l - 0.5) * 5))
  const r = backtest(closes, [2], [f], 3)
  assert.equal(r.runs, 1)
  assert.ok(Math.abs(r.error - (0 / 101 + 1 / 102 + 2 / 103) / 3) < 1e-12)
  assert.equal(r.inside80, 1)
  assert.equal(r.inside50, 2 / 3) // 103 lies outside the 50 % range
  assert.equal(r.direction, 1) // both the forecast and the real close end above the 100 at the cutoff
})
