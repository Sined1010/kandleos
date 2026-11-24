import test from 'node:test'
import assert from 'node:assert/strict'
import { checkDrawing } from './drawings.ts'

test('checkDrawing accepts an avwap with one point and rejects one without', () => {
  assert.ok(checkDrawing({ id: 'a', type: 'avwap', points: [{ time: 1, price: 2 }] }))
  assert.equal(checkDrawing({ id: 'a', type: 'avwap', points: [] }), null)
})

test('checkDrawing: the alarm end is a finite number when present', () => {
  const d = { id: 'a', type: 'hline', price: 2 }
  assert.ok(checkDrawing(d))
  assert.ok(checkDrawing({ ...d, alarmUntil: 100 }))
  assert.equal(checkDrawing({ ...d, alarmUntil: 'x' }), null)
  assert.equal(checkDrawing({ ...d, alarmUntil: NaN }), null)
})
