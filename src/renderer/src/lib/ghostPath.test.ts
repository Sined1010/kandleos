import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ghostPath } from './ghostPath.ts'

test('the ghost candles start at the last close and join up, each a valid candle', () => {
  const path = ghostPath(64)
  assert.equal(path.length, 64)
  assert.equal(path[0].open, 0)
  path.forEach((c, i) => {
    if (i) assert.equal(c.open, path[i - 1].close)
    assert.ok(c.hi >= c.top && c.top - c.body >= c.lo - 1e-12 && c.body >= 0)
    // The pull back towards the start keeps them near the last price (a few average candles at most).
    assert.ok(Math.abs(c.close) < 4, `candle ${i} drifted to ${c.close}`)
  })
})

test('the same path on every call', () => {
  assert.deepEqual(ghostPath(10), ghostPath(10))
})
