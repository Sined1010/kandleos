import test from 'node:test'
import assert from 'node:assert/strict'
import type { Alarm } from '../../../shared/alarms.ts'
import type { Knot } from '../../../shared/lineAlarm.ts'
import { createAlarmWatch } from './alarmCore.ts'

function setup(bars: { time: number; high: number; low: number }[] = []) {
  let alarms: Alarm[] = [{ id: 'a', symbol: 'ETHUSDT', op: 'above', price: 100, createdAt: 10 }]
  const told: string[] = []
  const w = createAlarmWatch({
    alarms: () => alarms,
    update: (fn) => void (alarms = fn(alarms)),
    checkable: () => true,
    loadBars: async () => ({ candles: bars, stale: false }),
    notify: async (a) => void told.push(a.id),
    collect: async () => {}
  })
  return { w, told, alarms: () => alarms }
}

test('a live price over the alarm reports once and marks it reached', async () => {
  const { w, told, alarms } = setup()
  await Promise.all([w.onPrice('ETHUSDT', 101, 50), w.onPrice('ETHUSDT', 102, 51)])
  assert.deepEqual(told, ['a'])
  assert.equal(alarms()[0].triggeredAt, 50)
})

test('a price below an "above" alarm reports nothing', async () => {
  const { w, told } = setup()
  await w.onPrice('ETHUSDT', 99, 50)
  assert.deepEqual(told, [])
})

test('catch-up finds a spike in the bars once; a second run with the same bars stays quiet', async () => {
  const { w, told, alarms } = setup([{ time: 20, high: 105, low: 90 }])
  await w.catchUp()
  await w.catchUp()
  assert.deepEqual(told, ['a'])
  assert.equal(alarms()[0].triggeredPrice, 100)
})

test('catch-up without a hit remembers how far it checked', async () => {
  const { w, told, alarms } = setup([{ time: 20, high: 95, low: 90 }, { time: 30, high: 96, low: 91 }])
  await w.catchUp()
  assert.deepEqual(told, [])
  assert.equal(alarms()[0].checkedUntil, 30)
})

function lineSetup(bars: { time: number; high: number; low: number }[], table: { knots: Knot[]; until?: number } | 'missing') {
  let alarms: Alarm[] = [{ id: 'l', symbol: 'ETHUSDT', op: 'above', price: 100, createdAt: 10, line: { key: 't:ETHUSDT', drawing: 'd', part: 'main' } }]
  const told: string[] = []
  const w = createAlarmWatch({
    alarms: () => alarms,
    update: (fn) => void (alarms = fn(alarms)),
    checkable: () => true,
    loadBars: async () => ({ candles: bars, stale: false }),
    notify: async (a) => void told.push(a.id),
    collect: async () => {},
    knotsFor: () => table
  })
  return { w, told, alarms: () => alarms }
}
// 100 at 10, 110 at 110
const RISING: Knot[] = [[10, 100], [110, 110]]

test('line alarm: a bar touching the line reports once, at the line price there', async () => {
  const { w, told, alarms } = lineSetup([{ time: 60, high: 105.5, low: 101 }], { knots: RISING })
  await w.catchUp()
  assert.deepEqual(told, ['l'])
  assert.equal(alarms()[0].triggeredPrice, 105)
})

test('line alarm: a live price is compared with the line at that moment', async () => {
  const { w, told } = lineSetup([], { knots: RISING })
  await w.onPrice('ETHUSDT', 104, 60) // line at 105
  assert.deepEqual(told, [])
  await w.onPrice('ETHUSDT', 106, 60)
  assert.deepEqual(told, ['l'])
})

test('line alarm whose drawing is missing: no report, nothing recorded', async () => {
  const { w, told, alarms } = lineSetup([{ time: 60, high: 200, low: 50 }], 'missing')
  await w.catchUp()
  await w.onPrice('ETHUSDT', 200, 60)
  assert.deepEqual(told, [])
  assert.equal(alarms()[0].checkedUntil, undefined)
  assert.equal(alarms()[0].triggeredAt, undefined)
})

test('line alarm past its end without a touch runs out quietly', async () => {
  const { w, told, alarms } = lineSetup([{ time: 60, high: 101, low: 100 }, { time: 130, high: 101, low: 100 }], { knots: [[10, 120], [100, 120]], until: 100 })
  await w.catchUp()
  assert.deepEqual(told, [])
  assert.equal(alarms()[0].expiredAt, 100)
})

test('line alarm at the end of a table without an end set does not run out', async () => {
  const { w, alarms } = lineSetup([{ time: 130, high: 101, low: 100 }], { knots: [[10, 120], [100, 120]] })
  await w.catchUp()
  assert.equal(alarms()[0].expiredAt, undefined)
})
