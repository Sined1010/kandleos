import test from 'node:test'
import assert from 'node:assert/strict'
import { bollinger, ema, macd, rsi, sma } from './indicators.ts'

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)

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
