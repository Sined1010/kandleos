import test from 'node:test'
import assert from 'node:assert/strict'
import { magnetMode, snapPoint } from './magnet.ts'
import type { Candle } from '../../../shared/types.ts'

const candles: Candle[] = [
  { time: 0, open: 100, high: 110, low: 95, close: 105, volume: 1 },
  { time: 60, open: 105, high: 120, low: 100, close: 115, volume: 1 }
]
// 1 px per price unit, 0 at price 200.
const toY = (p: number) => 200 - p

test('snapPoint: within reach of the high it takes the high of the nearest bar', () => {
  // Pointer at logical 0.8 (nearest bar 1), price 125 = 5 px above its high 120.
  const s = snapPoint({ logical: 0.8, price: 125, y: toY(125) }, candles, toY, 8, 'price')
  assert.deepEqual(s, { logical: 1, price: 120, kind: 'high' })
})

test('snapPoint: out of reach the point stays exactly where it was put', () => {
  assert.deepEqual(snapPoint({ logical: 0.8, price: 132, y: toY(132) }, candles, toY, 8, 'price'), { logical: 0.8, price: 132 })
})

test('snapPoint: the nearest of open, high, low and close wins', () => {
  assert.equal(snapPoint({ logical: 0.2, price: 103.5, y: toY(103.5) }, candles, toY, 8, 'price').kind, 'close')
  assert.equal(snapPoint({ logical: 0.2, price: 96, y: toY(96) }, candles, toY, 8, 'price').kind, 'low')
})

test('snapPoint: time mode only rounds to the bar, off changes nothing, outside the bars nothing snaps', () => {
  assert.deepEqual(snapPoint({ logical: 0.8, price: 125, y: toY(125) }, candles, toY, 8, 'time'), { logical: 1, price: 125 })
  assert.deepEqual(snapPoint({ logical: 0.8, price: 125, y: toY(125) }, candles, toY, 8, 'off'), { logical: 0.8, price: 125 })
  assert.deepEqual(snapPoint({ logical: 7.2, price: 125, y: toY(125) }, candles, toY, 8, 'price'), { logical: 7.2, price: 125 })
})

test('magnetMode: text never, Ctrl or switched off frees it, time-only tools snap to the bar only', () => {
  assert.equal(magnetMode('text', true, false), 'off')
  assert.equal(magnetMode('trend', true, true), 'off')
  assert.equal(magnetMode('trend', false, false), 'off')
  assert.equal(magnetMode('vline', true, false), 'time')
  assert.equal(magnetMode('fibtime', true, false), 'time')
  assert.equal(magnetMode('avwap', true, false), 'time')
  assert.equal(magnetMode('long', true, false), 'price')
})
