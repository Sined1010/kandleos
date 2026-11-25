import test from 'node:test'
import assert from 'node:assert/strict'
import type { Alarm } from '../../../shared/alarms.ts'
import type { Drawing } from '../store/useStore.ts'
import { knotsFor, lineLabel, lineNow } from './lineAlarms.ts'
import { linePrice } from '../../../shared/lineAlarm.ts'

const hline = (over: Partial<Drawing> = {}) => ({ id: 'd', type: 'hline', price: 50, ...over }) as Drawing
const alarm = (over: Partial<Alarm> = {}): Alarm => ({
  id: 'a', symbol: 'BTCUSDT', op: 'above', price: 50, createdAt: 500, line: { key: 't:BTCUSDT', drawing: 'd', part: 'main' }, ...over
})

test('knotsFor: the table starts where the alarm was (re)armed; how far it was checked does not move it', () => {
  const t = knotsFor(alarm({ checkedUntil: 300 }), { 't:BTCUSDT': [hline()] }, 1000)
  assert.notEqual(t, 'missing')
  if (t !== 'missing') assert.equal(t.knots[0][0], 500)
  const later = knotsFor(alarm({ checkedUntil: 700 }), { 't:BTCUSDT': [hline()] }, 1000)
  // hit() skips bars before checkedUntil itself, so the table (and its cache) stays the same between checks.
  if (later !== 'missing' && t !== 'missing') assert.equal(later.knots, t.knots)
})

test('knotsFor: ends at the drawing\'s alarm end, else a year ahead', () => {
  const t = knotsFor(alarm(), { 't:BTCUSDT': [hline({ alarmUntil: 900 })] }, 1000)
  assert.deepEqual(t, { knots: [[500, 50], [900, 50]], until: 900 })
  const open = knotsFor(alarm(), { 't:BTCUSDT': [hline()] }, 1000)
  // A year from the start of today, so the table stays the same all day.
  if (open !== 'missing') assert.equal(open.knots.at(-1)![0], 365 * 86_400)
})

test('knotsFor / lineNow: a deleted drawing or unknown line is missing', () => {
  assert.equal(knotsFor(alarm(), {}, 1000), 'missing')
  assert.equal(knotsFor(alarm({ line: { key: 't:BTCUSDT', drawing: 'd', part: 'top' } }), { 't:BTCUSDT': [hline()] }, 1000), 'missing')
  assert.equal(lineNow(alarm(), {}, 1000), null)
  assert.equal(lineNow(alarm(), { 't:BTCUSDT': [hline()] }, 1000), 50)
})

test('lineLabel names the line: tool, channel side, Fibonacci level in percent', () => {
  const fib = { id: 'f', type: 'fib', p1: { time: 0, price: 1 }, p2: { time: 1, price: 2 } } as Drawing
  const ch = { id: 'c', type: 'channel', points: [] } as unknown as Drawing
  const on = (d: Drawing, part: string) => lineLabel(alarm({ line: { key: 'k', drawing: d.id, part } }), { k: [d] })
  assert.match(on(fib, '0.618'), /61\.8 %/)
  assert.notEqual(on(ch, 'top'), on(ch, 'bottom'))
  assert.notEqual(on(hline(), 'main'), on(ch, 'top'))
  assert.ok(lineLabel(alarm(), {}).length > 0)
})

test('knotsFor reuses the table while the drawing and the time window stay the same', () => {
  const d = hline()
  const a = knotsFor(alarm(), { 't:BTCUSDT': [d] }, 1000)
  const b = knotsFor(alarm(), { 't:BTCUSDT': [d] }, 1030)
  assert.ok(a !== 'missing' && b !== 'missing' && a.knots === b.knots)
  // A moved drawing is a new object: a new table.
  const c = knotsFor(alarm(), { 't:BTCUSDT': [{ ...d, price: 51 } as Drawing] }, 1030)
  assert.ok(c !== 'missing' && c.knots[0][1] === 51)
})

test('knotsFor: a sync rebuilds the drawings as new objects; the same line keeps its table', () => {
  const a = knotsFor(alarm(), { 't:BTCUSDT': [hline({ price: 52 })] }, 1000)
  const b = knotsFor(alarm(), { 't:BTCUSDT': [JSON.parse(JSON.stringify(hline({ price: 52 })))] }, 1000)
  assert.ok(a !== 'missing' && b !== 'missing' && a.knots === b.knots)
})

test('drawingOf: a list key that is an object property name finds nothing instead of crashing', () => {
  assert.equal(knotsFor(alarm({ line: { key: '__proto__', drawing: 'd', part: 'main' } }), {}, 1000), 'missing')
  assert.equal(lineNow(alarm({ line: { key: 'constructor', drawing: 'd', part: 'main' } }), {}, 1000), null)
})

test('knotsFor and lineNow count in the bars of the timeframe the alarm was armed on', () => {
  // AAPL trend line between two 4h bars (Wed 2026-11-18 9:30 and 13:30 New York, EST = UTC-5).
  const t1 = Date.UTC(2026, 10, 18, 14, 30) / 1000
  const t2 = Date.UTC(2026, 10, 18, 18, 30) / 1000
  const trend = { id: 'd', type: 'trend', p1: { time: t1, price: 100 }, p2: { time: t2, price: 101 } } as Drawing
  const lists = { 't:AAPL': [trend] }
  const on = (tf?: '4h') => alarm({ symbol: 'AAPL', createdAt: t1, line: { key: 't:AAPL', drawing: 'd', part: 'main', ...(tf && { tf }) } })
  // Thursday 9:30 is two 4h bars on: 102 on the chart; in trading time (6.5 h a day) it was 101.625.
  const thu = Date.UTC(2026, 10, 19, 14, 30) / 1000
  const four = knotsFor(on('4h'), lists, t2)
  assert.ok(four !== 'missing' && Math.abs(linePrice(four.knots, thu)! - 102) < 1e-9)
  assert.ok(Math.abs(lineNow(on('4h'), lists, thu)! - 102) < 1e-9)
  assert.ok(Math.abs(lineNow(on(), lists, thu)! - 101.625) < 1e-9)
})
