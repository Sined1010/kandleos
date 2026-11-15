import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coveredTicks, spread } from './tagSpread.ts'

test('tags far apart stay where they are', () => {
  assert.deepEqual(spread([10, 100]), [10, 100])
})

test('tags at the same price are stacked one below the other', () => {
  assert.deepEqual(spread([300, 300]), [300, 317])
  assert.deepEqual(spread([300, 305, 310]), [300, 317, 334])
})

test('axis numbers a tag touches are covered, the others stay', () => {
  // Tag 17 px high, text 12 px: they touch while the centres are less than 8.5 + 6 px apart.
  assert.deepEqual(coveredTicks([100, 114, 115, 200], [100], 6), [100, 114])
  assert.deepEqual(coveredTicks([100, 200], [], 6), [])
  assert.deepEqual(coveredTicks([100, 200], [90, 195], 6), [100, 200])
})
