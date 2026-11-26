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

const boxPts = (entry: number, target: number, stop: number) => [
  { time: 1, price: entry },
  { time: 1, price: target },
  { time: 1, price: stop },
  { time: 2, price: entry }
]

test('checkDrawing: a long box has four points with target above entry above stop', () => {
  assert.ok(checkDrawing({ id: 'a', type: 'long', points: boxPts(53, 56, 51) }))
  assert.equal(checkDrawing({ id: 'a', type: 'long', points: boxPts(53, 56, 51).slice(0, 3) }), null)
  assert.equal(checkDrawing({ id: 'a', type: 'long', points: boxPts(53, 51, 56) }), null)
})

test('checkDrawing: a short box has the target below the entry and the stop above', () => {
  assert.ok(checkDrawing({ id: 'a', type: 'short', points: boxPts(53, 50, 55) }))
  assert.equal(checkDrawing({ id: 'a', type: 'short', points: boxPts(53, 56, 51) }), null)
})
