import test from 'node:test'
import assert from 'node:assert/strict'
import { FIB_LEVELS, endAhead, lineAt, lineGeom, lineKnots, lineMoved, lineParts, linePrice, type LineGeom } from './lineAlarm.ts'
import { aggregate, timeToLogical } from './candles.ts'
import { timeZoneForSymbol } from './calendar.ts'
import { openSessions, sessionOpen } from './market.ts'
import { TF_SECONDS } from './types.ts'
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

// Line alarms armed on 1h/2h/4h: the chart draws a line straight in bars, and a US 4h day has a 4 h and a 2.5 h bar.
// The oracle is the chart's own mapping (timeToLogical) over the bars the app builds (aggregate, as stocks.ts finish).
const chartAxis = (symbol: string, seconds: number, from: number, to: number): number[] => {
  const zone = timeZoneForSymbol(symbol)!
  const fives = (openSessions(symbol, zone, from, to) ?? []).flatMap(([a, b]) =>
    Array.from({ length: (b - a) / 300 }, (_, i) => ({ time: a + i * 300, open: 1, high: 1, low: 1, close: 1, volume: 0 }))
  )
  return aggregate(fives, seconds, (sessionOpen(zone) ?? 0) % seconds, zone).map((c) => c.time)
}

for (const tf of ['1h', '2h', '4h'] as const) {
  test(`${tf}: the alarm line lies where the chart draws it, across a DST change, Thanksgiving and the half day`, () => {
    const s = TF_SECONDS[tf]
    // 2026-10-26 to 2026-12-05: summer time ends 1 Nov, Thanksgiving 26 Nov, early close 27 Nov.
    const axis = chartAxis('AAPL', s, utc(10, 26), utc(12, 5))
    const i = axis.findIndex((t) => t >= utc(10, 28))
    const g: LineGeom = { t1: axis[i], p1: 100, t2: axis[i + 3], p2: 103 }
    const L = (t: number) => timeToLogical(axis, t, s)
    const chart = (t: number) => g.p1 + ((g.p2 - g.p1) * (L(t) - L(g.t1))) / (L(g.t2) - L(g.t1))
    const knots = lineKnots(g, 'AAPL', utc(10, 29), utc(12, 4), tf)
    for (let k = 1; k < axis.length - 1; k++) {
      if (axis[k] < utc(10, 29) || axis[k + 1] > utc(12, 4)) continue
      close(linePrice(knots, axis[k]), chart(axis[k])) // bar start
      const mid = (axis[k] + axis[k + 1]) / 2 // inside the bar, or overnight / over the weekend
      close(linePrice(knots, mid), chart(mid))
    }
  })
}

test('4h: the price at a time does not depend on where the table starts', () => {
  const axis = chartAxis('AAPL', 14_400, utc(11, 2), utc(11, 21))
  const g: LineGeom = { t1: axis[0], p1: 100, t2: axis[5], p2: 110 }
  const a = lineKnots(g, 'AAPL', utc(11, 3), utc(11, 20), '4h')
  const b = lineKnots(g, 'AAPL', utc(11, 10, 17, 7), utc(11, 25), '4h')
  for (const t of [utc(11, 10, 18), utc(11, 12, 3), utc(11, 16, 15), utc(11, 19, 20, 30)]) close(linePrice(a, t), linePrice(b, t)!)
})

test('1h: a point only where the line bends, about two a trading day', () => {
  const axis = chartAxis('AAPL', 3600, utc(11, 2), utc(11, 30))
  const g: LineGeom = { t1: axis[0], p1: 100, t2: axis[3], p2: 101 }
  const knots = lineKnots(g, 'AAPL', utc(11, 2), utc(11, 30), '1h')
  // 19 trading days in that window (Thanksgiving off); start and end on top.
  assert.ok(knots.length <= 2 * 19 + 2, `${knots.length} points`)
})

test('4h: the lines of a channel run parallel in bars, as the chart draws them', () => {
  const axis = chartAxis('AAPL', 14_400, utc(11, 2), utc(11, 21))
  const ch = { id: 'c', type: 'channel', points: [p(axis[0], 100), p(axis[4], 104), p(axis[7], 95)] } as Drawing
  const L = (t: number) => timeToLogical(axis, t, 14_400)
  const base = (t: number) => 100 + (4 * (L(t) - L(axis[0]))) / (L(axis[4]) - L(axis[0]))
  const off = 95 - base(axis[7])
  for (const t of [axis[7], axis[9], (axis[9] + axis[10]) / 2, axis[14]]) {
    close(lineAt(lineGeom(ch, 'bottom', 'AAPL', '4h')!, 'AAPL', t, '4h'), base(t) + off)
    close(lineAt(lineGeom(ch, 'top', 'AAPL', '4h')!, 'AAPL', t, '4h'), base(t))
    close(lineAt(lineGeom(ch, 'mid', 'AAPL', '4h')!, 'AAPL', t, '4h'), base(t) + off / 2)
  }
})

test('the bar grid only for shares on 1h/2h/4h: other timeframes, crypto and currencies keep the table they had', () => {
  const share: LineGeom = { t1: utc(11, 20, 15), p1: 100, t2: utc(11, 20, 20), p2: 105 }
  const crypto: LineGeom = { t1: utc(11, 20), p1: 100, t2: utc(11, 21), p2: 105 }
  const range = [utc(11, 20, 15), utc(12, 4)] as const
  for (const tf of ['1m', '5m', '30m', '1D', '1W', undefined] as const)
    assert.deepEqual(lineKnots(share, 'AAPL', ...range, tf), lineKnots(share, 'AAPL', ...range))
  assert.deepEqual(lineKnots(crypto, 'BTCUSDT', ...range, '4h'), lineKnots(crypto, 'BTCUSDT', ...range))
  assert.deepEqual(lineKnots(share, 'EURUSD=X', ...range, '4h'), lineKnots(share, 'EURUSD=X', ...range))
  assert.deepEqual(lineKnots(share, 'ES=F', ...range, '4h'), lineKnots(share, 'ES=F', ...range))
  // German floor trading (8-22 h) has no 9:00 grid; a plain name ending in a floor code (…HA) is still a US share.
  assert.deepEqual(lineKnots(share, 'SAP.HA', ...range, '4h'), lineKnots(share, 'SAP.HA', ...range))
  assert.notDeepEqual(lineKnots(share, 'ALPHA', ...range, '4h'), lineKnots(share, 'ALPHA', ...range))
})

test('1h/2h/4h: both anchors in the same pre-market stretch keep clock time, not a fraction of one bar', () => {
  // Tuesday 2026-11-17 05:00 and 06:00 New York (pre-market, off the regular-hours grid)
  const g: LineGeom = { t1: utc(11, 17, 10), p1: 100, t2: utc(11, 17, 11), p2: 101 }
  const range = [utc(11, 17, 10), utc(11, 21)] as const
  for (const tf of ['1h', '2h', '4h'] as const) assert.deepEqual(lineKnots(g, 'AAPL', ...range, tf), lineKnots(g, 'AAPL', ...range))
})
