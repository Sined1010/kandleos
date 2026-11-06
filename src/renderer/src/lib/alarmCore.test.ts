import test from 'node:test'
import assert from 'node:assert/strict'
import type { Alarm } from '../../../shared/alarms.ts'
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
