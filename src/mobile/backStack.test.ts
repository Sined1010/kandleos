import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleBack, pushBack } from './backStack.ts'

test('back closes the newest layer first, then reports nothing left', () => {
  const closed: string[] = []
  pushBack('sheet', () => closed.push('sheet'))
  pushBack('draw', () => closed.push('draw'))
  pushBack('menu', () => closed.push('menu'))
  assert.equal(handleBack(), true)
  assert.equal(handleBack(), true)
  assert.equal(handleBack(), true)
  assert.deepEqual(closed, ['menu', 'draw', 'sheet'])
  assert.equal(handleBack(), false)
})

test('a layer removed on its own is skipped by back', () => {
  const closed: string[] = []
  pushBack('sheet', () => closed.push('sheet'))
  const drop = pushBack('menu', () => closed.push('menu'))
  drop()
  assert.equal(handleBack(), true)
  assert.deepEqual(closed, ['sheet'])
  assert.equal(handleBack(), false)
})

test('pushing the same id again moves it to the top instead of doubling it', () => {
  const closed: string[] = []
  pushBack('sheet', () => closed.push('sheet'))
  pushBack('menu', () => closed.push('menu'))
  pushBack('sheet', () => closed.push('sheet2'))
  handleBack()
  handleBack()
  assert.deepEqual(closed, ['sheet2', 'menu'])
  assert.equal(handleBack(), false)
})
