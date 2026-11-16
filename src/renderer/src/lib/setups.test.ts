import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_INDICATORS } from './indicatorDefaults.ts'
import { SETUPS, setupOn, setupPatch, setupsOf } from './setups.ts'

test('a setup is on only when all members are on, and the patch touches only `on`', () => {
  const ind = DEFAULT_INDICATORS
  const s = SETUPS[0]
  assert.deepEqual(s.members, ['bb', 'squeeze', 'supertrend', 'adx', 'atr'])
  assert.equal(setupOn(ind, s), false)
  const on = { ...ind, ...setupPatch(ind, s, true) }
  assert.equal(setupOn(on, s), true)
  assert.equal(on.bb.period, ind.bb.period)
  assert.equal(on.squeeze.kcMult, ind.squeeze.kcMult)
  assert.equal(on.sma.on, ind.sma.on)
  assert.equal(setupOn({ ...on, adx: { ...on.adx, on: false } }, s), false)
  const off = { ...on, ...setupPatch(on, s, false) }
  assert.ok(s.members.every((m) => !off[m].on))
  assert.deepEqual(setupsOf('adx').map((x) => x.id), ['breakout'])
  assert.deepEqual(setupsOf('sma'), [])
})
