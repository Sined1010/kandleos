import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionLine } from './sessionLine.ts'
import type { Quote } from '../../../shared/types.ts'

const regular: Quote = { price: 9.025, changePct: -1.74, time: 1 }
const post: Quote = { ...regular, ext: { phase: 'post', price: 9.46, changePct: 4.82, time: 2 } }

test('sessionLine picks the line for the session', () => {
  assert.equal(sessionLine(undefined, false), null)
  assert.equal(sessionLine(regular, false), null)
  assert.equal(sessionLine(regular, true), null)
  assert.deepEqual(sessionLine(post, false), { price: 9.46, kind: 'post' })
  assert.deepEqual(sessionLine({ ...post, ext: { ...post.ext!, phase: 'pre' } }, false), { price: 9.46, kind: 'pre' })
  // The chart already ends in the extended-hours price, so the regular close gets the line instead.
  assert.deepEqual(sessionLine(post, true), { price: 9.025, kind: 'close' })
})
