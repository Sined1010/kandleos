import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AIM_OFFSET, aimAt, pinchRange } from './touchAim.ts'

const box = { width: 400, height: 600 }

test('the crosshair sits 64 px above the finger', () => {
  assert.equal(AIM_OFFSET.y, -64)
  assert.deepEqual(aimAt({ x: 100, y: 300 }, box), { x: 100, y: 236 })
})

test('near the top edge the crosshair stays inside the chart', () => {
  assert.deepEqual(aimAt({ x: 100, y: 20 }, box), { x: 100, y: 0 })
})

test('past the right edge the crosshair stops at the edge', () => {
  assert.deepEqual(aimAt({ x: 450, y: 300 }, box), { x: 400, y: 236 })
})

test('pinching keeps the bar under the fingers and changes how many bars show', () => {
  const start = { gap: 100, mid: 200, from: 0, to: 100 } // bar 50 under the midpoint of a 400 px chart
  assert.deepEqual(pinchRange(start, 100, 200, 400), { from: 0, to: 100 }) // fingers still
  assert.deepEqual(pinchRange(start, 200, 200, 400), { from: 25, to: 75 }) // apart: half the bars, bar 50 stays
  assert.deepEqual(pinchRange(start, 50, 200, 400), { from: -50, to: 150 }) // together: twice the bars
  assert.deepEqual(pinchRange(start, 100, 300, 400), { from: -25, to: 75 }) // both moved right: the chart follows
})
