import test from 'node:test'
import assert from 'node:assert/strict'
import { FIB_LEVELS, endAhead, lineGeom, lineKnots, lineMoved, lineParts, linePrice, type LineGeom } from './lineAlarm.ts'
import { fibExtPrice } from '../renderer/src/lib/geometry.ts'
import type { Drawing } from '../renderer/src/store/useStore.ts'

const utc = (m: number, d: number, h = 0, min = 0) => Date.UTC(2026, m - 1, d, h, min) / 1000
const at = (g: LineGeom, symbol: string, from: number, to: number, t: number) => linePrice(lineKnots(g, symbol, from, to), t)
const close = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} != ${b}`)

test('crypto: a line runs on in clock time', () => {
  const g: LineGeom = { t1: 0, p1: 100, t2: 86_400, p2: 110 }
  close(at(g, 'BTCUSDT', 0, 172_800, 129_600), 115)
})

test('a share: the line rises only while the market is open and stays flat over the weekend (EST = UTC-5)', () => {
  // Friday 2026-11-20 10:00 and 15:00 New York: +1 per trading hour
  const g: LineGeom = { t1: utc(11, 20, 15), p1: 100, t2: utc(11, 20, 20), p2: 105 }
  const from = utc(11, 20, 15)
  const to = utc(11, 23, 22)
  close(at(g, 'AAPL', from, to, utc(11, 20, 21)), 106) // Friday close
  close(at(g, 'AAPL', from, to, utc(11, 21, 12)), 106) // Saturday
  close(at(g, 'AAPL', from, to, utc(11, 23, 14, 30)), 106) // Monday open
  close(at(g, 'AAPL', from, to, utc(11, 23, 15, 30)), 107) // Monday 10:30
})

test('a share: Thanksgiving adds nothing, the short day after only 3.5 hours', () => {
  // Wednesday 2026-11-25 10:00 and 15:00 New York
  const g: LineGeom = { t1: utc(11, 25, 15), p1: 100, t2: utc(11, 25, 20), p2: 105 }
  const from = utc(11, 25, 15)
  const to = utc(11, 28, 0)
  close(at(g, 'AAPL', from, to, utc(11, 26, 17)), 106)
  close(at(g, 'AAPL', from, to, utc(11, 27, 18)), 109.5)
})

test('a table starting later than the anchors still continues the same line', () => {
  const g: LineGeom = { t1: utc(11, 20, 15), p1: 100, t2: utc(11, 20, 20), p2: 105 }
  close(at(g, 'AAPL', utc(11, 23, 12), utc(11, 24, 0), utc(11, 23, 15, 30)), 107)
})

test('both anchors in the same closed stretch: clock time; at the same time: flat at the second price', () => {
  // Saturday 2026-11-21 10:00 and 14:00 New York
  const g: LineGeom = { t1: utc(11, 21, 15), p1: 100, t2: utc(11, 21, 19), p2: 104 }
  close(at(g, 'AAPL', utc(11, 21, 15), utc(11, 22, 0), utc(11, 21, 17)), 102)
  close(at({ t1: 50, p1: 1, t2: 50, p2: 7 }, 'AAPL', 0, 100, 80), 7)
})

test('flat lines need two points; outside the table there is no price', () => {
  const k = lineKnots({ flat: 230 }, 'AAPL', 100, 200)
  assert.deepEqual(k, [[100, 230], [200, 230]])
  assert.equal(linePrice(k, 99), null)
  assert.equal(linePrice(k, 201), null)
  assert.deepEqual(lineKnots({ flat: 1 }, 'AAPL', 200, 100), [])
})

const p = (time: number, price: number) => ({ time, price })

test('lineGeom: Fibonacci levels as the chart draws them, extension, rectangle edges', () => {
  const fib = { id: 'f', type: 'fib', p1: p(0, 100), p2: p(10, 200) } as Drawing
  assert.deepEqual(lineGeom(fib, '0.618', 'BTCUSDT'), { flat: 200 + (100 - 200) * 0.618 })
  assert.equal(lineGeom(fib, '0.5555', 'BTCUSDT'), null)
  const ext = { id: 'e', type: 'fibext', points: [p(0, 100), p(10, 150), p(20, 120)] } as Drawing
  assert.deepEqual(lineGeom(ext, '1.618', 'BTCUSDT'), { flat: fibExtPrice(100, 150, 120, 1.618) })
  const rect = { id: 'r', type: 'rect', points: [p(0, 90), p(10, 120)] } as Drawing
  assert.deepEqual(lineGeom(rect, 'top', 'BTCUSDT'), { flat: 120 })
  assert.deepEqual(lineGeom(rect, 'bottom', 'BTCUSDT'), { flat: 90 })
  assert.deepEqual(lineGeom({ id: 'h', type: 'hline', price: 7 } as Drawing, 'main', 'BTCUSDT'), { flat: 7 })
})

test('lineGeom: channel top, middle and bottom stay parallel', () => {
  const ch = { id: 'c', type: 'channel', points: [p(0, 100), p(3600, 110), p(0, 90)] } as Drawing
  for (const t of [0, 1800, 7200]) {
    const top = at(lineGeom(ch, 'top', 'BTCUSDT')!, 'BTCUSDT', 0, 7200, t)!
    const mid = at(lineGeom(ch, 'mid', 'BTCUSDT')!, 'BTCUSDT', 0, 7200, t)!
    const bottom = at(lineGeom(ch, 'bottom', 'BTCUSDT')!, 'BTCUSDT', 0, 7200, t)!
    close(top - bottom, 10)
    close(mid, (top + bottom) / 2)
  }
  close(at(lineGeom(ch, 'top', 'BTCUSDT')!, 'BTCUSDT', 0, 7200, 7200), 120)
})

test('lineParts: which tools offer which lines', () => {
  assert.deepEqual(lineParts({ id: 't', type: 'trend', p1: p(0, 1), p2: p(1, 2) } as Drawing), ['main'])
  assert.deepEqual(lineParts({ id: 'c', type: 'channel', points: [] } as unknown as Drawing), ['top', 'mid', 'bottom'])
  assert.deepEqual(lineParts({ id: 'f', type: 'fib', p1: p(0, 1), p2: p(1, 2) } as Drawing), FIB_LEVELS.map(String))
  // A ray runs on past its second point; drawn to the left it never reaches the future.
  assert.deepEqual(lineParts({ id: 'r', type: 'ray', points: [p(0, 1), p(60, 2)] } as Drawing), ['main'])
  assert.deepEqual(lineParts({ id: 'r', type: 'ray', points: [p(60, 1), p(0, 2)] } as Drawing), [])
  for (const type of ['elliott', 'avwap', 'text', 'vline', 'fibfan'])
    assert.deepEqual(lineParts({ id: 'x', type, points: [] } as unknown as Drawing), [])
})

test('lineMoved: points count, colour, text, size and the alarm end do not', () => {
  const a = { id: 't', type: 'trend', p1: p(0, 1), p2: p(1, 2) } as Drawing
  assert.equal(lineMoved(a, { ...a, color: '#fff', alarmUntil: 5 }), false)
  assert.equal(lineMoved(a, { ...a, p2: p(1, 3) } as Drawing), true)
  const txt = { id: 'x', type: 'text', points: [p(0, 1)], text: 'a' } as Drawing
  assert.equal(lineMoved(txt, { ...txt, text: 'b', size: 20 } as Drawing), false)
})

test('endAhead: arming again drops an alarm end that has passed, keeps one still ahead', () => {
  const d = { id: 'h', type: 'hline', price: 1, alarmUntil: 500 } as Drawing
  assert.equal(endAhead(d, 400), d)
  assert.equal(endAhead(d, 500).alarmUntil, undefined)
  assert.equal(endAhead({ id: 'h', type: 'hline', price: 1 } as Drawing, 900).alarmUntil, undefined)
})
