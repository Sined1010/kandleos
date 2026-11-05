import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hit, mergeTriggered, newAlarm, type Alarm } from './alarms.ts'

test('newAlarm picks above or below from where the price is now', () => {
  assert.equal((newAlarm('AAPL', 230, 227) as Alarm).op, 'above')
  assert.equal((newAlarm('AAPL', 220, 227) as Alarm).op, 'below')
  assert.equal(newAlarm('AAPL', 227, 227), 'at-price')
})

const alarm = (over: Partial<Alarm> = {}): Alarm => ({ id: 'a', symbol: 'AAPL', op: 'above', price: 230, createdAt: 100, ...over })

test('hit finds the first bar that reached the price, at the alarm price', () => {
  const bars = [
    { time: 200, high: 229, low: 225 },
    { time: 300, high: 231, low: 226 },
    { time: 400, high: 235, low: 230 }
  ]
  assert.deepEqual(hit(alarm(), bars), { time: 300, price: 230 })
  assert.deepEqual(hit(alarm({ op: 'below', price: 225.5 }), bars), { time: 200, price: 225.5 })
})

test('bars before the last check (or before creation) do not count', () => {
  const bars = [{ time: 150, high: 240, low: 220 }]
  assert.equal(hit(alarm({ checkedUntil: 160 }), bars), null)
  assert.equal(hit(alarm({ createdAt: 160 }), bars), null)
})

test('an alarm that already went off does not fire again', () => {
  assert.equal(hit(alarm({ triggeredAt: 300, triggeredPrice: 230 }), [{ time: 400, high: 250, low: 240 }]), null)
})

test('mergeTriggered keeps the earliest trigger and is safe to apply twice', () => {
  const local = [alarm({ id: 'a' }), alarm({ id: 'b', triggeredAt: 500, triggeredPrice: 230 })]
  const native = [
    { id: 'a', triggeredAt: 300, triggeredPrice: 230, checkedUntil: 600 },
    { id: 'b', triggeredAt: 700, triggeredPrice: 231, checkedUntil: 700 }
  ]
  const once = mergeTriggered(local, native)
  assert.deepEqual(mergeTriggered(once, native), once)
  assert.equal(once[0].triggeredAt, 300)
  assert.equal(once[0].checkedUntil, 600)
  assert.equal(once[1].triggeredAt, 500)
  assert.equal(once[1].checkedUntil, 700)
})

test('a trigger from before the alarm was armed again is ignored', () => {
  const rearmed = alarm({ id: 'a', checkedUntil: 900 })
  const merged = mergeTriggered([rearmed], [{ id: 'a', triggeredAt: 500, triggeredPrice: 230, checkedUntil: 500 }])
  assert.equal(merged[0].triggeredAt, undefined)
  assert.equal(merged[0].checkedUntil, 900)
})
