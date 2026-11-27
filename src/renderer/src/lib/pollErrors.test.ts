import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pollErrors } from './pollErrors.ts'

test('one poll group failing stays visible while another keeps answering fine', () => {
  const e = pollErrors()
  e.start(1)
  e.start(2)
  // Alpaca (60 s) refuses the key, Yahoo (5 s) keeps working.
  assert.equal(e.report(2, 'Alpaca: key refused'), 'Alpaca: key refused')
  assert.equal(e.report(1, null), 'Alpaca: key refused')
  assert.equal(e.report(1, null), 'Alpaca: key refused')
  assert.equal(e.report(2, null), null)
})

test('the first poll of all stocks counts until every group has answered once', () => {
  const e = pollErrors()
  assert.equal(e.report(0, 'Alpaca: key refused'), 'Alpaca: key refused')
  e.start(1)
  e.start(2)
  // The fast group alone must not clear it: the slow one holds the failing stocks.
  assert.equal(e.report(1, null), 'Alpaca: key refused')
  assert.equal(e.report(2, null), null)
})

test('a late answer of the first poll after all groups answered does not come back', () => {
  const e = pollErrors()
  e.start(1)
  assert.equal(e.report(1, null), null)
  assert.equal(e.report(0, 'old error'), null)
})
