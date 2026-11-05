import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sheetHeights, snapTo } from './sheetSnap.ts'

const vp = 800 // low 96, half 400, full 720 (see sheetHeights)

test('a slow release snaps to the nearest position', () => {
  assert.equal(snapTo(sheetHeights(vp).half + 20, 0, vp), 'half')
  assert.equal(snapTo(sheetHeights(vp).full - 30, 0, vp), 'full')
})

test('a quick flick up from low goes to half, from half to full', () => {
  assert.equal(snapTo(sheetHeights(vp).low + 10, 0.8, vp), 'half')
  assert.equal(snapTo(sheetHeights(vp).half + 10, 0.8, vp), 'full')
})

test('a quick flick down goes one position lower', () => {
  assert.equal(snapTo(sheetHeights(vp).half - 10, -0.8, vp), 'low')
  assert.equal(snapTo(sheetHeights(vp).full - 10, -0.8, vp), 'half')
})

test('height zero snaps to low', () => {
  assert.equal(snapTo(0, 0, vp), 'low')
})
