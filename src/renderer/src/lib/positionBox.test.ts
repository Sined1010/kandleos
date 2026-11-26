import test from 'node:test'
import assert from 'node:assert/strict'
import { boxNumbers, boxState, dragBox, newBox, type BoxDrawing } from './positionBox.ts'
import type { Alarm } from '../../../shared/alarms.ts'
import type { Candle } from '../../../shared/types.ts'

const close = (a: number, b: number, eps = 0.005) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`)
const box = (type: 'long' | 'short', entry: number, target: number, stop: number): BoxDrawing => ({
  id: 'b',
  type,
  points: [
    { time: 100, price: entry },
    { time: 100, price: target },
    { time: 100, price: stop },
    { time: 200, price: entry }
  ]
})
// Bars with a constant range of 2 and no gaps: ATR = 2.
const bars = (n: number): Candle[] =>
  Array.from({ length: n }, (_, i) => ({ time: i * 60, open: 100, high: 101, low: 99, close: 100, volume: 1 }))

test('boxNumbers: distances, amounts and reward to risk of a long', () => {
  const n = boxNumbers(box('long', 53, 56, 51))
  close(n.targetPct, 5.66)
  close(n.stopPct, -3.77)
  close(n.targetAbs, 3)
  close(n.stopAbs, -2)
  close(n.ratio, 1.5)
})

test('boxNumbers: a short counts the move down as the gain', () => {
  const n = boxNumbers(box('short', 53, 50, 55))
  close(n.targetPct, 5.66)
  close(n.stopPct, -3.77)
  close(n.targetAbs, 3)
  close(n.stopAbs, -2)
  close(n.ratio, 1.5)
})

test('newBox: stop 1 ATR, target 1.5 ATR, right edge and alarm end at rightTime', () => {
  const d = newBox('long', 'x', { time: 60, price: 100 }, bars(30), 9000)
  assert.equal(d.type, 'long')
  close(d.points[2].price, 98)
  close(d.points[1].price, 103)
  assert.equal(d.points[0].time, 60)
  assert.equal(d.points[3].time, 9000)
  assert.equal(d.alarmUntil, 9000)
  const s = newBox('short', 'y', { time: 60, price: 100 }, bars(30), 9000)
  close(s.points[2].price, 102)
  close(s.points[1].price, 97)
})

test('newBox: too few bars for an ATR falls back to stop 2 %, target 3 %', () => {
  const d = newBox('long', 'x', { time: 60, price: 100 }, bars(10), 9000)
  close(d.points[2].price, 98)
  close(d.points[1].price, 103)
  const s = newBox('short', 'x', { time: 60, price: 100 }, bars(10), 9000)
  close(s.points[2].price, 102)
  close(s.points[1].price, 97)
})

const same = (t: number) => t

test('dragBox: the target stays above the entry of a long', () => {
  const d = dragBox(box('long', 53, 56, 51), 1, { time: 150, price: 50 }, same, -6)
  assert.ok(d.points[1].price > 53)
  close(d.points[2].price, 51)
  assert.equal(d.points[1].time, 100)
})

test('dragBox: the stop stays below the entry of a long, above it for a short', () => {
  assert.ok(dragBox(box('long', 53, 56, 51), 2, { time: 150, price: 60 }, same, 9).points[2].price < 53)
  assert.ok(dragBox(box('short', 53, 50, 55), 2, { time: 150, price: 40 }, same, -15).points[2].price > 53)
})

test('dragBox: the right edge moves only in time, never left of the left edge, and sets the alarm end', () => {
  const d = dragBox(box('long', 53, 56, 51), 3, { time: 300, price: 99 }, same, 46)
  assert.equal(d.points[3].time, 300)
  assert.equal(d.points[3].price, 53)
  assert.equal(d.alarmUntil, 300)
  assert.ok(dragBox(box('long', 53, 56, 51), 3, { time: 50, price: 53 }, same, 0).points[3].time > 100)
})

test('dragBox: the entry handle moves the whole box', () => {
  const d = dragBox(box('long', 53, 56, 51), 0, { time: 0, price: 0 }, (t) => t + 10, 1)
  assert.deepEqual(
    d.points.map((p) => [p.time, p.price]),
    [
      [110, 54],
      [110, 57],
      [110, 52],
      [210, 54]
    ]
  )
})

const pairAlarm = (part: string, over: Partial<Alarm> = {}): Alarm => ({
  id: part,
  symbol: 'AAPL',
  op: 'above',
  price: 56,
  createdAt: 1,
  line: { key: 't:AAPL', drawing: 'b', part },
  box: { entry: 53, wait: false },
  ...over
})

test('boxState: from the alarms first, then from the right edge', () => {
  const d = box('long', 53, 56, 51) // right edge at 200
  assert.equal(boxState([pairAlarm('target'), pairAlarm('stop')], d, 150), 'running')
  assert.equal(boxState([pairAlarm('target', { triggeredAt: 120 }), pairAlarm('stop', { cancelledAt: 120 })], d, 150), 'target')
  assert.equal(boxState([pairAlarm('target', { cancelledAt: 120 }), pairAlarm('stop', { triggeredAt: 120 })], d, 150), 'stop')
  assert.equal(boxState([pairAlarm('target', { expiredAt: 200 }), pairAlarm('stop', { expiredAt: 200 })], d, 250), 'expired')
  assert.equal(boxState([], d, 250), 'expired')
  assert.equal(boxState([], d, 150), 'idle')
  // Only the entry alarm: the pair is off, so the edge decides.
  assert.equal(boxState([pairAlarm('entry', { box: undefined })], d, 150), 'idle')
})

test('dragBox: moving the whole box moves its alarm end with the right edge; no end stays none', () => {
  const d = dragBox({ ...box('long', 53, 56, 51), alarmUntil: 200 }, 0, { time: 0, price: 0 }, (t) => t + 10, 1)
  assert.equal(d.alarmUntil, 210)
  assert.equal(dragBox(box('long', 53, 56, 51), 0, { time: 0, price: 0 }, (t) => t + 10, 1).alarmUntil, undefined)
})
