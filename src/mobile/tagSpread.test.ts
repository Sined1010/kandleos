import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spread } from './tagSpread.ts'

test('tags far apart stay where they are', () => {
  assert.deepEqual(spread([10, 100]), [10, 100])
})

test('tags at the same price are stacked one below the other', () => {
  assert.deepEqual(spread([300, 300]), [300, 317])
  assert.deepEqual(spread([300, 305, 310]), [300, 317, 334])
})
