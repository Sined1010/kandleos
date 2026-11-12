import test from 'node:test'
import assert from 'node:assert/strict'
import { backtest, bandScale, checkCutoffs, forecastCandles, groupBatches, historyNeeded, probabilityAbove, Q, QUANTILES, scaleBands, trend } from './forecast.ts'

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

test('trend calls 40 to 60 % flat and only clearer chances a direction', () => {
  assert.deepEqual([0.39, 0.4, 0.5, 0.6, 0.61].map(trend), ['down', 'flat', 'flat', 'flat', 'up'])
})

test('checkCutoffs steps back one horizon at a time while 512 bars of history are left', () => {
  const c = checkCutoffs(2600, 64, 30)
  assert.equal(c.length, 30)
  assert.equal(c[0], 2536)
  assert.equal(c[29], 680)
  const page = checkCutoffs(1000, 64, 30)
  assert.equal(page.length, 7)
  assert.equal(page[6], 552)
  assert.deepEqual(checkCutoffs(400, 64, 30), [])
  // One bar more than 30 × 64 + 512: the newest bar starts no backtest.
  assert.equal(historyNeeded(64, 30), 2433)
  assert.equal(checkCutoffs(historyNeeded(64, 30) - 1, 64, 30).length, 30)
})

test('groupBatches packs whole groups into batches of at most 16 series', () => {
  // Close, two wicks as one group, then 30 backtests each on its own.
  const groups = [0, 1, 1, ...Array.from({ length: 30 }, (_, k) => 2 + k)]
  const b = groupBatches(groups)
  assert.ok(b.every((x) => x.length <= 16))
  assert.deepEqual(b.flat(), groups.map((_, i) => i))
  assert.ok(b.some((x) => x.includes(1) && x.includes(2))) // the wick group stays together
  assert.throws(() => groupBatches(Array(17).fill(0)))
})

test('backtest measures deviation, range hits and direction against the real closes', () => {
  // Real closes rise 100 -> 103 after the cutoff. Each forecast step spreads linearly around 101:
  // 80 % range 99..103, 50 % range 99.75..102.25.
  const closes = [100, 100, 101, 102, 103]
  const f = [1, 2, 3].map(() => QUANTILES.map((l) => 101 + (l - 0.5) * 5))
  const r = backtest(closes, [2], [f], 3)
  assert.equal(r.runs, 1)
  assert.ok(Math.abs(r.error - (0 / 101 + 1 / 102 + 2 / 103) / 3) < 1e-12)
  // "Unchanged" forecasts the cutoff close 100 for every step.
  assert.ok(Math.abs(r.naiveError - (1 / 101 + 2 / 102 + 3 / 103) / 3) < 1e-12)
  assert.equal(r.inside80, 1)
  assert.equal(r.inside50, 2 / 3) // 103 lies outside the 50 % range
  assert.equal(r.direction, 1) // both the forecast and the real close end above the 100 at the cutoff
})

// Closes that wobble around 100 and per backtest a forecast with median 100 and an 80 % range of 98..102.
const wobble = Array.from({ length: 200 }, (_, i) => 100 + 6 * Math.sin(i))
const narrow = (steps: number) => Array.from({ length: steps }, () => QUANTILES.map((l) => 100 + (l - 0.5) * 5))
const cutoffsOf = (runs: number, steps: number) => Array.from({ length: runs }, (_, k) => 190 - (k + 1) * steps)

test('backtest adds the 90 % range and three chance groups that hold every run', () => {
  const closes = Array.from({ length: 40 }, (_, i) => 100 + i)
  const exact = (c: number) => Array.from({ length: 5 }, (_, i) => QUANTILES.map((l) => closes[c + i] * (1 + (l - 0.5) * 0.4)))
  const r = backtest(closes, [30, 20, 10], [exact(30), exact(20), exact(10)], 5)
  assert.equal(r.inside50, 1)
  assert.equal(r.inside80, 1)
  assert.equal(r.inside90, 1)
  assert.equal(r.chance.length, 3)
  assert.equal(r.chance.reduce((s, g) => s + g.cases, 0), 3)
})

test('backtest checks the calibration on the newer half with a factor from the older half', () => {
  const r = backtest(wobble, cutoffsOf(12, 5), Array.from({ length: 12 }, () => narrow(5)), 5)
  assert.ok(r.calibration, 'calibration checked')
  assert.ok(r.calibration.factor > 1, `factor ${r.calibration.factor}`)
  assert.ok(r.calibration.calibrated > r.calibration.raw, JSON.stringify(r.calibration))
  assert.equal(backtest(wobble, cutoffsOf(9, 5), Array.from({ length: 9 }, () => narrow(5)), 5).calibration, null)
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
