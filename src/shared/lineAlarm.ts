// Alarms on drawn lines: where a line lies at time t. The chart draws lines straight in candles, with nights and
// weekends pushed together, so a line runs on in regular trading time and stays flat while the market is closed.
// The app turns each alarmed line into a table of points ([time, price], straight in between); the PC/phone check
// and the Android background check (AlarmCheck.java) only read that table, so all three agree.
import { timeZoneForSymbol } from './calendar.ts'
import { openSessions } from './market.ts'
import { FIB_EXT_LEVELS, fibExtPrice } from '../renderer/src/lib/geometry.ts'
import type { Drawing, Point } from '../renderer/src/store/useStore.ts'

export type Knot = [number, number]
/** How far ahead a table reaches without an end set (seconds). */
export const LINE_HORIZON = 365 * 86_400
/** Retracement levels as the chart draws them (DrawingOverlay). */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]

/** The lines of a drawing that can carry an alarm; empty for tools without a line to touch. */
export function lineParts(d: Drawing): string[] {
  switch (d.type) {
    case 'trend':
    case 'hline':
      return ['main']
    // Drawn to the left a ray runs into the past and never meets a future price.
    case 'ray':
      return d.points.length > 1 && d.points[1].time > d.points[0].time ? ['main'] : []
    case 'channel':
      return ['top', 'mid', 'bottom']
    case 'rect':
      return ['top', 'bottom']
    case 'fib':
      return FIB_LEVELS.map(String)
    case 'fibext':
      return FIB_EXT_LEVELS.map(String)
    default:
      return []
  }
}

/** A line at a fixed price, or through two points. */
export type LineGeom = { flat: number } | { t1: number; p1: number; t2: number; p2: number }

/** Regular trading seconds from `a` to `b` (negative when `b` is earlier); clock time when the hours are unknown. */
function tradingSeconds(symbol: string, a: number, b: number): number {
  if (a === b) return 0
  const [lo, hi] = a < b ? [a, b] : [b, a]
  // shortcut: unknown exchange hours (indices, exchanges missing in market.ts) run in clock time; add the zone there.
  const sessions = openSessions(symbol, timeZoneForSymbol(symbol), lo, hi)
  const sum = sessions ? sessions.reduce((s, [x, y]) => s + y - x, 0) : hi - lo
  return a < b ? sum : -sum
}

/** Trading time between the two points; 0 = both in the same closed stretch, so the line runs in clock time. */
const spanOf = (symbol: string, g: { t1: number; t2: number }) => tradingSeconds(symbol, g.t1, g.t2)

/** Price of a two-point line at `t` (`span`: spanOf, when the caller has it already). */
function priceOn(symbol: string, g: { t1: number; p1: number; t2: number; p2: number }, t: number, span = spanOf(symbol, g)): number {
  if (g.t1 === g.t2) return g.p2
  const along = span === 0 ? t - g.t1 : tradingSeconds(symbol, g.t1, t)
  return g.p1 + ((g.p2 - g.p1) * along) / (span === 0 ? g.t2 - g.t1 : span)
}

const through = (a: Point, b: Point) => ({ t1: a.time, p1: a.price, t2: b.time, p2: b.price })

/** One line of a drawing; null when the drawing has no such line. */
export function lineGeom(d: Drawing, part: string, symbol: string): LineGeom | null {
  if (!lineParts(d).includes(part)) return null
  switch (d.type) {
    case 'hline':
      return { flat: d.price }
    case 'trend':
      return through(d.p1, d.p2)
    case 'ray':
      return through(d.points[0], d.points[1])
    case 'rect': {
      const [a, b] = [d.points[0].price, d.points[1].price]
      return { flat: part === 'top' ? Math.max(a, b) : Math.min(a, b) }
    }
    case 'fib':
      return { flat: d.p2.price + (d.p1.price - d.p2.price) * Number(part) }
    case 'fibext':
      return { flat: fibExtPrice(d.points[0].price, d.points[1].price, d.points[2].price, Number(part)) }
    case 'channel': {
      const base = through(d.points[0], d.points[1])
      // The third click sets the parallel line; measured in trading time like the line itself.
      const off = d.points[2].price - priceOn(symbol, base, d.points[2].time)
      const shift = (by: number) => ({ ...base, p1: base.p1 + by, p2: base.p2 + by })
      if (part === 'mid') return shift(off / 2)
      return (part === 'top') === off > 0 ? shift(off) : base
    }
    default:
      return null
  }
}

/** The drawing's lines as text: equal for the same shape, whatever its colour, text, text size or alarm end. */
export function shapeKey(d: Drawing): string {
  const { color: _c, alarmUntil: _u, text: _t, size: _s, ...geo } = d as Drawing & { text?: string; size?: number }
  return JSON.stringify(geo)
}

/** Whether an edit moved the drawing's lines (not just its colour, text, text size or alarm end). */
export const lineMoved = (a: Drawing, b: Drawing): boolean => shapeKey(a) !== shapeKey(b)

/** Arming a line again: an alarm end that has already passed is dropped (no end), one still ahead stays. */
export function endAhead(d: Drawing, now: number): Drawing {
  if (d.alarmUntil === undefined || d.alarmUntil > now) return d
  const { alarmUntil: _, ...rest } = d
  return rest as Drawing
}

/** Where a line lies at `t`. */
export const lineAt = (g: LineGeom, symbol: string, t: number): number => ('flat' in g ? g.flat : priceOn(symbol, g, t))

/** Table of points from `from` to `to`: start, every session edge in between, end. */
export function lineKnots(g: LineGeom, symbol: string, from: number, to: number): Knot[] {
  if (to <= from) return []
  if ('flat' in g) return [[from, g.flat], [to, g.flat]]
  if (g.t1 === g.t2) return [[from, g.p2], [to, g.p2]]
  const span = spanOf(symbol, g)
  const start = priceOn(symbol, g, from, span)
  const sessions = span === 0 ? null : openSessions(symbol, timeZoneForSymbol(symbol), from, to)
  if (!sessions) return [[from, start], [to, priceOn(symbol, g, to, span)]]
  const perSecond = (g.p2 - g.p1) / span
  const knots: Knot[] = [[from, start]]
  let price = start
  const add = (t: number) => {
    if (knots[knots.length - 1][0] !== t) knots.push([t, price])
  }
  for (const [a, b] of sessions) {
    add(a)
    price += perSecond * (b - a)
    add(b)
  }
  add(to)
  return knots
}

/** Price of the table at `t`, straight between points; null outside the table. */
export function linePrice(knots: Knot[], t: number): number | null {
  if (!knots.length || t < knots[0][0] || t > knots[knots.length - 1][0]) return null
  if (knots.length === 1) return knots[0][1]
  // The first point at or after t (binary search: the chart asks for every pixel of a long table).
  let lo = 1
  let hi = knots.length - 1
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (knots[m][0] < t) lo = m + 1
    else hi = m
  }
  const [ta, pa] = knots[lo - 1]
  const [tb, pb] = knots[lo]
  return tb === ta ? pb : pa + ((pb - pa) * (t - ta)) / (tb - ta)
}
