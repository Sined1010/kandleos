import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AIM_OFFSET, aimAt } from './touchAim.ts'

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
