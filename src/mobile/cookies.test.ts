import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cookiePairs } from './cookies.ts'

test('cookiePairs splits a joined header and keeps a comma inside Expires', () => {
  assert.deepEqual(cookiePairs('A3=d=AQ; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/, B=2; Secure'), ['A3=d=AQ', 'B=2'])
})

test('cookiePairs takes an array of headers and ignores empty input', () => {
  assert.deepEqual(cookiePairs(['a=1; Path=/', 'b=2']), ['a=1', 'b=2'])
  assert.deepEqual(cookiePairs(undefined), [])
  assert.deepEqual(cookiePairs(''), [])
})
