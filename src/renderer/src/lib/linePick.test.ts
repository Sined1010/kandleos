import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nearestPoint, nearestId, pillLeft } from './linePick.ts'

/** A drawing whose line the finger reaches once the stroke is at least `from` px wide. */
const at = (id: string, from: number) => ({ id, hit: (width: number) => width >= from })

test('the nearest drawing wins, not the first one', () => {
  assert.equal(nearestId([at('A', 20), at('B', 8)], 22), 'B')
})

test('nothing within reach gives null', () => {
  assert.equal(nearestId([at('A', 60)], 22), null)
})

test('reach is inclusive', () => {
  assert.equal(nearestId([at('A', 44)], 22), 'A')
})

test('nearestPoint: the closest clock within reach, else null', () => {
  const clocks = [{ key: 'a', x: 100, y: 100 }, { key: 'b', x: 110, y: 100 }]
  assert.equal(nearestPoint(clocks, 108, 100, 22), 'b')
  assert.equal(nearestPoint(clocks, 200, 100, 22), null)
})

test('pillLeft: the pill goes left of the clock when it would run past the edge', () => {
  assert.equal(pillLeft(100, 90, 400), false)
  assert.equal(pillLeft(320, 90, 400), true)
})

test('a drawing out of reach is asked only once', () => {
  let calls = 0
  const far = { id: 'F', hit: (width: number) => (calls++, width >= 100) }
  assert.equal(nearestId([far, at('A', 8)], 22), 'A')
  assert.equal(calls, 1)
})
