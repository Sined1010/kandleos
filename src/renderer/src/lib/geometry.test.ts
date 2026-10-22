import test from 'node:test'
import assert from 'node:assert/strict'
import { channelOffset, isTrough, measureLabel, rayEnd } from './geometry.ts'

test('rayEnd continues the line to the plot edge in its direction', () => {
  assert.deepEqual(rayEnd(0, 100, 10, 90, 100), [100, 0])
  assert.deepEqual(rayEnd(50, 10, 40, 20, 100), [0, 60])
})

test('isTrough puts labels of lows below and of highs above', () => {
  const ys = [200, 100, 150, 50, 120, 20] // screen y: bigger = lower price; 0-1-2-3-4-5 impulse
  assert.deepEqual(ys.map((_, i) => isTrough(ys, i)), [true, false, true, false, true, false])
})

test('channelOffset measures the third point against the line at its own bar', () => {
  assert.equal(channelOffset(0, 100, 10, 200, 5, 170), 20) // line is at 150 on bar 5
  assert.equal(channelOffset(3, 100, 3, 200, 9, 90), -10) // degenerate line: offset from the first point
})

test('measureLabel shows signed change, percent and bars', () => {
  const fmt = (p: number) => p.toFixed(2)
  assert.equal(measureLabel(100, 110, 12.4, fmt), '+10.00 (+10.00 %) · 12 candles')
  assert.equal(measureLabel(200, 150, -5, fmt), '−50.00 (−25.00 %) · 5 candles')
})
