import test from 'node:test'
import assert from 'node:assert/strict'
import { isNewer, VERSION_RE } from './version.ts'

test('isNewer compares each part as a number', () => {
  assert.equal(isNewer('0.4.1', '0.4.0'), true)
  assert.equal(isNewer('0.10.0', '0.9.9'), true)
  assert.equal(isNewer('1.0.0', '0.12.3'), true)
  assert.equal(isNewer('0.4.0', '0.4.0'), false)
  assert.equal(isNewer('0.3.9', '0.4.0'), false)
})

test('VERSION_RE takes only plain release numbers', () => {
  assert.ok(VERSION_RE.test('0.4.0'))
  assert.ok(!VERSION_RE.test('v0.4.0'))
  assert.ok(!VERSION_RE.test('0.4.0-beta'))
  assert.ok(!VERSION_RE.test('<img>'))
})
