import test from 'node:test'
import assert from 'node:assert/strict'
import { channelOffset, fanPrice, fibExtPrice, isTrough, measureLabel, rayEnd, sinePrice } from './geometry.ts'

test('fibExtPrice projects multiples of the move A → B from the pullback C', () => {
  // Move 100 → 120, pullback to 110: 100 % target 130, 161.8 % target 142.36.
  assert.equal(fibExtPrice(100, 120, 110, 0), 110)
  assert.equal(fibExtPrice(100, 120, 110, 1), 130)
  assert.ok(Math.abs(fibExtPrice(100, 120, 110, 1.618) - 142.36) < 1e-9)
  // Downward move: targets below the pullback.
  assert.equal(fibExtPrice(120, 100, 110, 1), 90)
})

test('fanPrice gives back a share of the move at its end', () => {
  assert.equal(fanPrice(100, 200, 0), 200)
  assert.equal(fanPrice(100, 200, 0.5), 150)
  assert.equal(fanPrice(200, 100, 0.5), 150)
})

test('sinePrice passes both clicks and repeats every two half periods', () => {
  const at = (l: number) => sinePrice(10, 100, 20, 140, l)
  assert.equal(at(10), 100)
  assert.equal(at(20), 140)
  assert.ok(Math.abs(at(30) - 100) < 1e-9)
  assert.ok(Math.abs(at(15) - 120) < 1e-9) // midway between trough and peak
  assert.equal(sinePrice(10, 100, 10, 140, 50), 100) // no period yet
})

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
