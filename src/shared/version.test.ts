import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isNewer, VERSION_RE } from './version.ts'

test('isNewer compares each part as a number', () => {
  assert.equal(isNewer('0.4.1', '0.4.0'), true)
  assert.equal(isNewer('0.10.0', '0.9.9'), true)
  assert.equal(isNewer('1.0.0', '0.12.3'), true)
  assert.equal(isNewer('0.4.0', '0.4.0'), false)
  assert.equal(isNewer('0.3.9', '0.4.0'), false)
})

test('package.json versionCode matches version (Android, F-Droid update check)', () => {
  const { version, versionCode } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  const [major, minor, patch] = version.split('.').map(Number)
  assert.equal(versionCode, major * 10000 + minor * 100 + patch)
})

test('VERSION_RE takes only plain release numbers', () => {
  assert.ok(VERSION_RE.test('0.4.0'))
  assert.ok(!VERSION_RE.test('v0.4.0'))
  assert.ok(!VERSION_RE.test('0.4.0-beta'))
  assert.ok(!VERSION_RE.test('<img>'))
})
