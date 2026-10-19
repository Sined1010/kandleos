import test from 'node:test'
import assert from 'node:assert/strict'
import { atr, bollinger, ema, macd, rsi, sma, stochastic, supertrend, vwap } from './indicators.ts'

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)
const bar = (time: number, high: number, low: number, c: number, volume = 1) => ({
  time,
  open: c,
  high,
  low,
  close: c,
  volume
})

test('sma skips leading NaN', () => {
  assert.deepEqual(sma([NaN, 2, 4, 6], 2), [NaN, NaN, 3, 5])
})

test('atr seeds with the mean true range, then smooths (Wilder)', () => {
  const c = [bar(0, 10, 8, 9), bar(1, 11, 9, 10), bar(2, 14, 10, 13)]
  const a = atr(c, 2)
  close(a[1], (2 + 2) / 2)
  close(a[2], (2 * 1 + 4) / 2) // TR = max(4, |14-10|, |10-10|) = 4
})

test('stochastic is 100 at the top of the range and 0 at the bottom', () => {
  const rising = Array.from({ length: 10 }, (_, i) => bar(i, i + 1, i, i + 1))
  assert.equal(stochastic(rising, 3, 1, 1).k[9], 100)
  const falling = Array.from({ length: 10 }, (_, i) => bar(i, 20 - i, 19 - i, 19 - i))
  assert.equal(stochastic(falling, 3, 1, 1).k[9], 0)
})

test('vwap weights by volume and restarts each UTC day', () => {
  const v = vwap([bar(0, 12, 6, 9, 1), bar(60, 15, 9, 12, 3), bar(86400, 30, 30, 30, 5)])
  close(v[1], (9 * 1 + 12 * 3) / 4)
  close(v[2], 30)
})

test('supertrend follows the trend side', () => {
  const up = Array.from({ length: 30 }, (_, i) => bar(i, 100 + i + 1, 100 + i - 1, 100 + i))
  const s = supertrend(up, 5, 2)
  assert.ok(s.value[29] < up[29].close && s.rising[29])
  const down = Array.from({ length: 30 }, (_, i) => bar(i, 200 - i + 1, 200 - i - 1, 200 - i))
  const t = supertrend(down, 5, 2)
  assert.ok(t.value[29] > down[29].close && !t.rising[29])
})

test('sma', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [NaN, NaN, 2, 3, 4])
})

test('ema seeds with sma and skips leading NaN', () => {
  const out = ema([NaN, 1, 2, 3, 4], 2)
  assert.ok(Number.isNaN(out[1]))
  close(out[2], 1.5)
  close(out[3], 3 * (2 / 3) + 1.5 / 3)
})

test('bollinger on a flat series has zero width', () => {
  const { mid, upper, lower } = bollinger([5, 5, 5, 5], 2, 2)
  assert.deepEqual([mid[3], upper[3], lower[3]], [5, 5, 5])
})

test('rsi is 100 for a rising series and 0 for a falling one', () => {
  assert.equal(rsi([1, 2, 3, 4, 5], 3)[4], 100)
  assert.equal(rsi([5, 4, 3, 2, 1], 3)[4], 0)
})

test('macd histogram is line minus signal', () => {
  const v = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5)
  const m = macd(v, 12, 26, 9)
  close(m.hist[59], m.line[59] - m.signal[59])
  assert.ok(Number.isNaN(m.signal[24]))
})
