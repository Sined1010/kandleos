import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventNear, isEventBadge, PATTERN_HIT } from './patternHit.ts'

test('a pattern hit sits above lines and volume but below event badges', () => {
  // 'top' beats every built-in series hit (SMA, volume …); without itemType 'marker' it counts as a range hit, which
  // a marker (event badge, zOrder 'top') always beats in lightweight-charts' isBetterHit.
  assert.equal(PATTERN_HIT.zOrder, 'top')
  assert.equal('itemType' in PATTERN_HIT, false)
})

test('a tap within a finger of a bar with an event belongs to the event', () => {
  const x = (t: number) => t * 10
  assert.equal(eventNear([5, 9], x, 62, 16), true)
  assert.equal(eventNear([5, 9], x, 70, 16), false)
  assert.equal(eventNear([], x, 50, 16), false)
})

test('event badge ids are bar times or the temporary badge, nothing else', () => {
  assert.equal(isEventBadge('1784851200'), true)
  assert.equal(isEventBadge('tmp'), true)
  assert.equal(isEventBadge('pat:1784851200'), false)
  assert.equal(isEventBadge(undefined), false)
  assert.equal(isEventBadge(1784851200), false)
})
