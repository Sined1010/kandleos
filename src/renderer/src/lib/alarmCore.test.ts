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

// Long box on ETH: entry 100, target 110, stop 95; both alarms armed at 10.
function boxSetup(bars: { time: number; high: number; low: number }[], entryAt?: number, wait = false) {
  const line = (part: string) => ({ key: 't:ETHUSDT', drawing: 'b', part })
  const box = { entry: 100, wait, ...(entryAt !== undefined && { entryAt }) }
  let alarms: Alarm[] = [
    { id: 'target', symbol: 'ETHUSDT', op: 'above', price: 110, createdAt: 10, line: line('target'), box },
    { id: 'stop', symbol: 'ETHUSDT', op: 'below', price: 95, createdAt: 10, line: line('stop'), box }
  ]
  const told: { id: string; note?: string; entryAt?: number }[] = []
  let loads = 0
  const w = createAlarmWatch({
    alarms: () => alarms,
    update: (fn) => void (alarms = fn(alarms)),
    checkable: () => true,
    loadBars: async () => {
      loads++
      return { candles: bars, stale: false }
    },
    notify: async (a, note) => void told.push({ id: a.id, note, entryAt: a.box?.entryAt }),
    collect: async () => {},
    knotsFor: (a) => ({ knots: [[0, a.price], [100_000, a.price]] })
  })
  return { w, told, alarms: () => alarms, loads: () => loads, set: (fn: (l: Alarm[]) => Alarm[]) => void (alarms = fn(alarms)) }
}
const byId = (list: Alarm[], id: string) => list.find((a) => a.id === id)!

test('box: target and stop in the same bar → only the stop fires, with the same-bar note; the target is switched off', async () => {
  const { w, told, alarms, loads } = boxSetup([{ time: 20, high: 111, low: 94 }], 10)
  await w.catchUp()
  assert.deepEqual(told.map((x) => [x.id, x.note]), [['stop', 'same-bar']])
  assert.equal(byId(alarms(), 'stop').triggeredAt, 20)
  assert.equal(byId(alarms(), 'target').cancelledAt, 20)
  assert.equal(loads(), 1)
})

test('box: the target first → the target fires and the stop is switched off', async () => {
  const { w, told, alarms } = boxSetup([{ time: 20, high: 111, low: 99 }, { time: 30, high: 100, low: 94 }], 10)
  await w.catchUp()
  assert.deepEqual(told.map((x) => [x.id, x.note]), [['target', undefined]])
  assert.equal(byId(alarms(), 'stop').cancelledAt, 20)
  await w.catchUp()
  assert.equal(told.length, 1)
})

test('box: the target without the entry ever touched carries the no-entry note', async () => {
  const { w, told } = boxSetup([{ time: 20, high: 111, low: 101 }])
  await w.catchUp()
  assert.deepEqual(told.map((x) => [x.id, x.note]), [['target', 'no-entry']])
})

test('box: the entry seen in a bar without a hit is remembered', async () => {
  const { w, told, alarms } = boxSetup([{ time: 20, high: 101, low: 99 }])
  await w.catchUp()
  assert.deepEqual(told, [])
  assert.equal(byId(alarms(), 'target').box?.entryAt, 20)
  assert.equal(byId(alarms(), 'stop').box?.entryAt, 20)
  assert.equal(byId(alarms(), 'target').checkedUntil, 20)
})

test('box: a live price does not fire a waiting pair before the entry; with the entry known it fires as before', async () => {
  const a = boxSetup([], undefined, true)
  await a.w.onPrice('ETHUSDT', 112, 50)
  assert.deepEqual(a.told, [])
  const b = boxSetup([], 10)
  await b.w.onPrice('ETHUSDT', 112, 50)
  assert.deepEqual(b.told.map((x) => x.id), ['target'])
  assert.equal(byId(b.alarms(), 'stop').cancelledAt, 50)
})

test('box: a bar after the alarm end does not fire; the pair runs out instead', async () => {
  let alarms: Alarm[] = boxSetup([]).alarms()
  const told: string[] = []
  const w = createAlarmWatch({
    alarms: () => alarms,
    update: (fn) => void (alarms = fn(alarms)),
    checkable: () => true,
    loadBars: async () => ({ candles: [{ time: 60, high: 112, low: 101 }], stale: false }),
    notify: async (a) => void told.push(a.id),
    collect: async () => {},
    knotsFor: (a) => ({ knots: [[0, a.price], [50, a.price]], until: 50 })
  })
  await w.catchUp()
  assert.deepEqual(told, [])
  assert.equal(byId(alarms, 'target').expiredAt, 50)
  assert.equal(byId(alarms, 'stop').expiredAt, 50)
})

test('box: a live price long after the last check leaves the decision to the bars', async () => {
  // Checked up to 10; the first quote after a long sleep must not decide the pair before the missed bars are seen.
  const { w, told } = boxSetup([], 10)
  await w.onPrice('ETHUSDT', 112, 10 + 3600)
  assert.deepEqual(told, [])
})

test('box: live prices crossing the entry mark it touched, so the hit carries no note', async () => {
  const { w, told, alarms } = boxSetup([])
  await w.onPrice('ETHUSDT', 101, 20)
  await w.onPrice('ETHUSDT', 99.5, 25) // crossed 100
  assert.equal(byId(alarms(), 'target').box?.entryAt, 25)
  await w.onPrice('ETHUSDT', 112, 30)
  assert.deepEqual(told.map((x) => [x.id, x.note]), [['target', undefined]])
})

test('box: a pair that counts at once fires from a live price without the entry, with the no-entry note', async () => {
  const { w, told } = boxSetup([])
  await w.onPrice('ETHUSDT', 105, 20)
  await w.onPrice('ETHUSDT', 112, 30)
  assert.deepEqual(told.map((x) => [x.id, x.note]), [['target', 'no-entry']])
})

test('box: the entry seen by the other side counts for the winner too (sides armed at different times)', async () => {
  const { w, told, alarms, set } = boxSetup([{ time: 20, high: 111, low: 101 }])
  set((list) => list.map((a) => (a.id === 'stop' ? { ...a, box: { ...a.box!, entryAt: 5 } } : a)))
  await w.catchUp()
  assert.deepEqual(told.map((x) => [x.id, x.note]), [['target', undefined]])
  assert.equal(byId(alarms(), 'target').box?.entryAt, 5)
})

test('box: a waiting breakout read twice over the entry bar does not fire its near stop', async () => {
  // Long breakout: entry 100, stop 95 lies between the arming price 90 and the entry.
  const { w, told, alarms, set } = boxSetup([{ time: 20, high: 100.5, low: 94 }], undefined, true)
  set((list) => list.map((a) => (a.id === 'stop' ? { ...a, box: { ...a.box!, near: true } } : a)))
  await w.catchUp()
  await w.catchUp()
  assert.deepEqual(told, [])
  assert.equal(byId(alarms(), 'stop').box?.entryAt, 20)
})

test('box: a live hit counts the entry the other side has seen', async () => {
  const { w, told, set } = boxSetup([])
  set((list) => list.map((a) => (a.id === 'stop' ? { ...a, box: { ...a.box!, entryAt: 5 } } : a)))
  await w.onPrice('ETHUSDT', 112, 30)
  assert.deepEqual(told.map((x) => [x.id, x.note, x.entryAt]), [['target', undefined, 5]])
})

test('box: without a price source the gap rule does not lock live prices out', async () => {
  let alarms: Alarm[] = boxSetup([], 10).alarms()
  const told: string[] = []
  const w = createAlarmWatch({
    alarms: () => alarms,
    update: (fn) => void (alarms = fn(alarms)),
    checkable: () => false,
    loadBars: async () => ({ candles: [], stale: false }),
    notify: async (a) => void told.push(a.id),
    collect: async () => {},
    knotsFor: (a) => ({ knots: [[0, a.price], [100_000, a.price]] })
  })
  await w.onPrice('ETHUSDT', 112, 10 + 3600)
  assert.deepEqual(told, ['target'])
})

test('box: a price from before the box was armed does not count as crossing its entry', async () => {
  // ETH was at 120 (an earlier alarm), then the box was drawn at 85, waiting for its entry at 100.
  const { w, told, alarms, set } = boxSetup([], undefined, true)
  set((list) => list.map((a) => ({ ...a, createdAt: 100 })))
  await w.onPrice('ETHUSDT', 120, 50)
  await w.onPrice('ETHUSDT', 85, 110)
  assert.equal(byId(alarms(), 'stop').box?.entryAt, undefined)
  assert.deepEqual(told, [])
})

test('box: an entry first touched after the deciding hit keeps the no-entry note', async () => {
  // The bar at 300 reaches the target; the entry 100 is touched only in the next 5-minute bar, after the trade was decided.
  const { w, told, alarms } = boxSetup([{ time: 300, high: 111, low: 104 }, { time: 600, high: 104, low: 99 }])
  await w.catchUp()
  assert.deepEqual(told.map((x) => [x.id, x.note, x.entryAt]), [['target', 'no-entry', undefined]])
  assert.equal(byId(alarms(), 'target').box?.entryAt, undefined)
})

test('catch-up asks for the bars from where the last check stopped, so a long pause leaves no gap', async () => {
  let asked: number | undefined
  let alarms: Alarm[] = [{ id: 'a', symbol: 'ETHUSDT', op: 'above', price: 100, createdAt: 10, checkedUntil: 5000 }]
  const w = createAlarmWatch({
    alarms: () => alarms,
    update: (fn) => void (alarms = fn(alarms)),
    checkable: () => true,
    loadBars: async (_s, from) => {
      asked = from
      return { candles: [], stale: false }
    },
    notify: async () => {},
    collect: async () => {}
  })
  await w.catchUp()
  assert.equal(asked, 5000)
})

test('box catch-up starts at the side checked least far', async () => {
  const b = boxSetup([])
  let asked: number | undefined
  b.set((list) => list.map((a) => ({ ...a, checkedUntil: a.id === 'stop' ? 300 : 700 })))
  const w = createAlarmWatch({
    alarms: b.alarms,
    update: (fn) => b.set(fn),
    checkable: () => true,
    loadBars: async (_s, from) => {
      asked = from
      return { candles: [], stale: false }
    },
    notify: async () => {},
    collect: async () => {},
    knotsFor: (a) => ({ knots: [[0, a.price], [100_000, a.price]] })
  })
  await w.catchUp()
  assert.equal(asked, 300)
})

test('box: an entry a live price saw inside the hit bar counts (bar 300 holds 305)', async () => {
  const { w, told } = boxSetup([{ time: 300, high: 111, low: 104 }], 305)
  await w.catchUp()
  assert.deepEqual(told.map((x) => [x.id, x.note]), [['target', undefined]])
})

test('box: without a hit both sides keep the earlier entry either of them saw, as the Android check does', async () => {
  const { w, alarms, set } = boxSetup([{ time: 30, high: 101, low: 99 }])
  set((list) => list.map((a) => (a.id === 'stop' ? { ...a, box: { ...a.box!, entryAt: 15 } } : a)))
  await w.catchUp()
  assert.equal(byId(alarms(), 'target').box?.entryAt, 15)
})

function manySetup(createdAt: number[], load: (symbol: string, from: number) => Promise<{ candles: { time: number; high: number; low: number }[] }>) {
  let alarms: Alarm[] = createdAt.map((c, i) => ({ id: 'm' + i, symbol: 'AAPL', op: 'above' as const, price: 200 + i, createdAt: c }))
  const loads: number[] = []
  const w = createAlarmWatch({
    alarms: () => alarms,
    update: (fn) => void (alarms = fn(alarms)),
    checkable: () => true,
    loadBars: (symbol, from) => (loads.push(from), load(symbol, from)),
    notify: async () => {},
    collect: async () => {}
  })
  return { w, loads, alarms: () => alarms }
}
const quiet = async () => ({ candles: [{ time: 20, high: 150, low: 140 }, { time: 30, high: 151, low: 141 }] })

test('catch-up loads the bars of a symbol once for all its alarms with the same start', async () => {
  const { w, loads } = manySetup([10, 10, 10], quiet)
  await w.catchUp()
  assert.deepEqual(loads, [10])
})

test('alarms on one symbol armed at different times share the load from the next run on', async () => {
  const { w, loads } = manySetup([10, 15], quiet)
  await w.catchUp()
  assert.deepEqual(loads, [10, 15])
  await w.catchUp()
  assert.deepEqual(loads, [10, 15, 30])
})

test('a failed load is not asked again for the other alarms of that symbol in the same run', async () => {
  const { w, loads, alarms } = manySetup([10, 10], async () => {
    throw new Error('HTTP 429')
  })
  await w.catchUp()
  assert.deepEqual(loads, [10])
  assert.ok(alarms().every((a) => a.checkedUntil === undefined))
})
