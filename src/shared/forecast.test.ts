import test from 'node:test'
import assert from 'node:assert/strict'
import { backtest, backtestCutoffs, bandScale, forecastCandles, probabilityAbove, Q, QUANTILES, scaleBands } from './forecast.ts'

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

test('bandScale widens ranges that were too narrow and narrows ranges that were too wide', () => {
  // Each step: median 100, 80 % range 90..110 (half-width 10). Real closes deviate by 0, 5, …, 45.
  const f = Array.from({ length: 10 }, () => QUANTILES.map((l) => 100 + (l - 0.5) * 25))
  const tooNarrow = [0, ...Array.from({ length: 10 }, (_, i) => 100 + 5 * i)]
  const wide = bandScale(tooNarrow, [1], [f], 10)
  assert.ok(wide > 1, `factor ${wide}`)
  // The scaled 80 % range then holds at least 80 % of those closes.
  const scaled = scaleBands(f, wide)
  const inside = tooNarrow.slice(1).filter((c, i) => c >= scaled[i][Q.p10] && c <= scaled[i][Q.p90]).length
  assert.ok(inside >= 8, `inside ${inside}`)
  // Closes that never leave a tenth of the range: the ranges shrink.
  assert.ok(bandScale([0, ...Array(10).fill(101)], [1], [f], 10) < 1)
  assert.equal(bandScale([100], [], [], 10), 1)
})

test('scaleBands stretches in percent, keeps the median and order, and never goes below zero', () => {
  const [s] = scaleBands([step], 2)
  assert.equal(s[Q.median], step[Q.median])
  assert.ok(Math.abs(Math.log(s[Q.p90] / s[Q.median]) - 2 * Math.log(step[Q.p90] / step[Q.median])) < 1e-12)
  assert.ok(s.every((v, i) => i === 0 || v >= s[i - 1]))
  // A wide range stretched a lot stays positive.
  const [w] = scaleBands([QUANTILES.map((l) => 100 * 4 ** (l - 0.5))], 3)
  assert.ok(w.every((v) => v > 0), `min ${Math.min(...w)}`)
})

test('forecastCandles chain the median closes and put the wick lengths around the body', () => {
  const candles = forecastCandles(100, [102, 101], [1, 0.5], [0.5, -0.2])
  assert.deepEqual(candles[0], { open: 100, close: 102, high: 103, low: 99.5 })
  // Falling candle: the upper wick sits on the open; a negative wick forecast counts as none.
  assert.deepEqual(candles[1], { open: 102, close: 101, high: 102.5, low: 101 })
})
