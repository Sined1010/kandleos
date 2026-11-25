import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alarmClock, armedFor, checkAlarm, checkedAfter, dropAlarmsOf, dropAlarmsOfTab, hit, isArmed, mergeTriggered, newAlarm, newLineAlarm, restartLine, type Alarm } from './alarms.ts'
import type { Knot } from './lineAlarm.ts'

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

test('checkedAfter never goes back before the alarm was set', () => {
  // Set on Saturday (500); the newest bar is Friday's last one (300), which reached the price.
  const a = alarm({ createdAt: 500 })
  const bars = [{ time: 300, high: 231, low: 226 }]
  assert.equal(checkedAfter(a, 300), 500)
  assert.equal(hit({ ...a, checkedUntil: checkedAfter(a, 300) }, bars), null)
  assert.equal(checkedAfter(alarm({ checkedUntil: 600 }), 900), 900)
})

test('alarm times follow the exchange (quote time), not a device clock that is off by an hour', () => {
  const quoteTime = 10_000
  const pcClockBehind = quoteTime - 3600
  assert.equal(alarmClock(quoteTime, pcClockBehind), quoteTime)
  assert.equal(alarmClock(undefined, pcClockBehind), pcClockBehind)
  // Created with the exchange time, a spike from before the alarm existed does not fire it.
  const a = newAlarm('ETHUSDT', 110, 100, alarmClock(quoteTime, pcClockBehind)) as Alarm
  assert.equal(hit(a, [{ time: quoteTime - 600, high: 120, low: 90 }]), null)
  assert.ok(hit(a, [{ time: quoteTime + 300, high: 120, low: 90 }]))
})

const LINE = { key: 't1:AAPL', drawing: 'd1', part: 'main' }
const lineAlarm = (over: Partial<Alarm> = {}): Alarm => ({ ...alarm({ price: 210, createdAt: 100 }), line: LINE, ...over })
// Rises 1 per 100 s: 210 at 100, 220 at 1100.
const rising: Knot[] = [[100, 210], [1100, 220]]

test('a line alarm fires on the first bar that touches the line where it is then, at that price', () => {
  const bars = [
    { time: 200, high: 210.5, low: 209 }, // line at 211
    { time: 500, high: 214.2, low: 212 }, // line at 214
    { time: 600, high: 230, low: 220 }
  ]
  assert.deepEqual(hit(lineAlarm(), bars, rising), { time: 500, price: 214 })
  assert.deepEqual(hit(lineAlarm({ op: 'below' }), [{ time: 300, high: 216, low: 211.9 }], rising), { time: 300, price: 212 })
})

test('a line alarm without a table or outside it never fires', () => {
  const bars = [{ time: 500, high: 300, low: 100 }]
  assert.equal(hit(lineAlarm(), bars), null)
  assert.equal(hit(lineAlarm(), [{ time: 2000, high: 300, low: 100 }], rising), null)
  assert.equal(hit(lineAlarm({ createdAt: 600 }), bars, rising), null)
})

test('newLineAlarm: direction from the price now against the line now', () => {
  assert.equal((newLineAlarm('AAPL', LINE, 210, 205, 100) as Alarm).op, 'above')
  assert.equal((newLineAlarm('AAPL', LINE, 210, 215, 100) as Alarm).op, 'below')
  assert.equal(newLineAlarm('AAPL', LINE, 210, 210, 100), 'at-price')
  assert.deepEqual((newLineAlarm('AAPL', LINE, 210, 205, 100) as Alarm).line, LINE)
})

test('restartLine: a moved line starts watching anew, so dragging it across the price does not fire', () => {
  const a = lineAlarm({ op: 'above', checkedUntil: 400 })
  const moved = restartLine(a, 900, 215, 212)
  assert.equal(moved.op, 'below')
  assert.equal(moved.createdAt, 900)
  assert.equal(moved.checkedUntil, undefined)
  assert.equal(moved.price, 212)
  assert.equal(restartLine(a, 900, 212, 212).op, 'above')
  const fired = lineAlarm({ triggeredAt: 300, triggeredPrice: 213 })
  assert.equal(restartLine(fired, 900, 215, 212), fired)
  const expired = lineAlarm({ expiredAt: 300 })
  assert.equal(restartLine(expired, 900, 215, 212), expired)
})

test('isArmed: neither touched nor expired', () => {
  assert.ok(isArmed(lineAlarm()))
  assert.ok(!isArmed(lineAlarm({ triggeredAt: 1 })))
  assert.ok(!isArmed(lineAlarm({ expiredAt: 1 })))
})

test('checkAlarm drops a broken line instead of treating it as a fixed price', () => {
  assert.deepEqual(checkAlarm(alarm()), alarm())
  assert.deepEqual(checkAlarm(lineAlarm()), lineAlarm())
  assert.equal(checkAlarm({ ...alarm(), line: { key: 1 } }), null)
  assert.equal(checkAlarm({ ...alarm(), line: { key: 'k', drawing: '', part: 'main' } }), null)
  assert.equal(checkAlarm({ ...alarm(), expiredAt: 'x' }), null)
  assert.equal(checkAlarm({ ...alarm(), op: 'sideways' }), null)
})

test('dropAlarmsOf / dropAlarmsOfTab remove only line alarms of those drawings or that tab', () => {
  const list = [
    alarm({ id: 'fixed' }),
    lineAlarm({ id: 'a' }),
    lineAlarm({ id: 'b', line: { ...LINE, drawing: 'd2' } }),
    lineAlarm({ id: 'c', line: { ...LINE, key: 't10:AAPL' } })
  ]
  assert.deepEqual(dropAlarmsOf(list, 't1:AAPL', ['d1']).map((a) => a.id), ['fixed', 'b', 'c'])
  assert.deepEqual(dropAlarmsOf(list, 't1:AAPL').map((a) => a.id), ['fixed', 'c'])
  assert.deepEqual(dropAlarmsOfTab(list, 't1').map((a) => a.id), ['fixed', 'c'])
})

test('armedFor: a symbol shows the bell only while one of its alarms still waits', () => {
  assert.equal(armedFor([lineAlarm({ expiredAt: 5 }), alarm({ triggeredAt: 5 })], 'AAPL'), false)
  assert.equal(armedFor([lineAlarm({ expiredAt: 5 }), alarm()], 'AAPL'), true)
  assert.equal(armedFor([alarm()], 'MSFT'), false)
})

test('checkAlarm: a line must name a drawing list of its own symbol ("<tab>:<symbol>")', () => {
  assert.equal(checkAlarm({ ...lineAlarm(), line: { ...LINE, key: '__proto__' } }), null)
  assert.equal(checkAlarm({ ...lineAlarm(), line: { ...LINE, key: 't1:MSFT' } }), null)
  assert.ok(checkAlarm(lineAlarm()))
})

test('checkAlarm: a line keeps the timeframe it was armed on; an unknown one is dropped', () => {
  const on4h = lineAlarm({ line: { ...lineAlarm().line!, tf: '4h' } })
  assert.deepEqual(checkAlarm(on4h), on4h)
  assert.equal(checkAlarm({ ...on4h, line: { ...on4h.line, tf: '3h' } }), null)
})
