import test from 'node:test'
import assert from 'node:assert/strict'
import { createSlots } from './slots.ts'

test('one address gets at most its share; others and freed slots stay usable', () => {
  const s = createSlots(2)
  assert.equal(s.take('10.0.0.9'), true)
  assert.equal(s.take('10.0.0.9'), true)
  assert.equal(s.take('10.0.0.9'), false)
  assert.equal(s.take('10.0.0.2'), true)
  s.give('10.0.0.9')
  assert.equal(s.take('10.0.0.9'), true)
})

test('giving back more than was taken never goes below zero', () => {
  const s = createSlots(1)
  s.give('10.0.0.9')
  assert.equal(s.take('10.0.0.9'), true)
  assert.equal(s.take('10.0.0.9'), false)
})
