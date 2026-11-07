import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTabAction } from './tabCycle.ts'

test('one tab: tapping opens a new one', () => assert.deepEqual(nextTabAction(['a'], 'a'), { kind: 'add' }))

test('two tabs: tapping goes to the other', () => {
  assert.deepEqual(nextTabAction(['a', 'b'], 'a'), { kind: 'select', id: 'b' })
  assert.deepEqual(nextTabAction(['a', 'b'], 'b'), { kind: 'select', id: 'a' })
})

test('three tabs: after the last comes the first', () => assert.deepEqual(nextTabAction(['a', 'b', 'c'], 'c'), { kind: 'select', id: 'a' }))

test('unknown active tab: goes to the first', () => assert.deepEqual(nextTabAction(['a', 'b'], 'x'), { kind: 'select', id: 'a' }))
