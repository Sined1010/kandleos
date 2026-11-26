// Alarms on drawn lines: where a line lies at time t. The chart draws lines straight in candles, with nights and
// weekends pushed together, so a line runs on in regular trading time and stays flat while the market is closed.
// Shares on 1h/2h/4h have bars of unequal length (US 4h: 9:30-13:30 and 13:30-16:00): there a line alarm counts in
// the bars of the timeframe it was armed on, as the chart draws it.
// The app turns each alarmed line into a table of points ([time, price], straight in between); the PC/phone check
// and the Android background check (AlarmCheck.java) only read that table, so all three agree.
import { timeZoneForSymbol, utcOffset } from './calendar.ts'
import { timeToLogical } from './candles.ts'
import { openSessions, shareOpen } from './market.ts'
import { TF_SECONDS, type Timeframe } from './types.ts'
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
    case 'long':
    case 'short':
      return ['target', 'stop', 'entry']
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

/** Timeframes whose share bars differ in length within a day; shorter ones fill the session evenly. */
const BAR_GRID = new Set<Timeframe>(['1h', '2h', '4h'])
// Bars on either side of the window, so every time in it lies between two bars.
const GRID_PAD = 7 * 86_400

/**
 * Bar starts of a share on `seconds` from `from` to `to`, on the grid aggregate() builds them on (stocks.ts finish):
 * the exchange's clock from its session open. Regular hours only; null when the timeframe is not one of BAR_GRID or
 * the symbol has no such grid (crypto, currencies, futures, floor trading, unknown hours).
 */
function barStarts(symbol: string, tf: Timeframe | undefined, from: number, to: number): number[] | null {
  if (!tf || !BAR_GRID.has(tf)) return null
  const zone = timeZoneForSymbol(symbol)
  const open = shareOpen(symbol, zone)
  const sessions = open === undefined ? null : openSessions(symbol, zone, from, to)
  if (!sessions) return null
  // shortcut: extended-hours bars (Yahoo with pre/post market) are not on this grid; with them shown the chart counts
  // about twice the bars a day, so the alarm line rises more slowly than the drawn one. Add them if users need it.
  const seconds = TF_SECONDS[tf]
  const offset = open! % seconds
  const out: number[] = []
  for (const [a, b] of sessions) {
    const shift = utcOffset(a, zone!)
    for (let t = Math.floor((a + shift - offset) / seconds) * seconds + offset - shift; t < b; t += seconds)
      if (!out.length || t > out[out.length - 1]) out.push(t)
  }
  return out.length > 1 ? out : null
}

/** A two-point line counted in bars of `tf` (as the chart draws it), with the bars it was measured on; null without a grid. */
function barLine(g: { t1: number; p1: number; t2: number; p2: number }, symbol: string, tf: Timeframe | undefined, lo: number, hi: number) {
  // Both anchors in one closed stretch (pre-/post-market points): they share a gap between two bars, so clock time.
  if (g.t1 === g.t2 || spanOf(symbol, g) === 0) return null
  const bars = barStarts(symbol, tf, Math.min(g.t1, g.t2, lo) - GRID_PAD, Math.max(g.t1, g.t2, hi) + GRID_PAD)
  if (!bars) return null
  const at = (t: number) => timeToLogical(bars, t, TF_SECONDS[tf!])
  const l1 = at(g.t1)
  const per = (g.p2 - g.p1) / (at(g.t2) - l1)
  return { bars, price: (t: number) => g.p1 + per * (at(t) - l1) }
}

const through = (a: Point, b: Point) => ({ t1: a.time, p1: a.price, t2: b.time, p2: b.price })

/** One line of a drawing; null when the drawing has no such line. */
export function lineGeom(d: Drawing, part: string, symbol: string, tf?: Timeframe): LineGeom | null {
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
    case 'long':
    case 'short':
      return { flat: d.points[part === 'target' ? 1 : part === 'stop' ? 2 : 0].price }
    case 'channel': {
      const base = through(d.points[0], d.points[1])
      // The third click sets the parallel line; measured like the line itself (bars of tf, or trading time).
      const t3 = d.points[2].time
      const off = d.points[2].price - (barLine(base, symbol, tf, t3, t3)?.price(t3) ?? priceOn(symbol, base, t3))
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
  // A box's lines are flat: only its three prices count, so moving it in time or its right edge restarts nothing.
  if (d.type === 'long' || d.type === 'short') return JSON.stringify([d.id, d.type, d.points.slice(0, 3).map((p) => p.price)])
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
export const lineAt = (g: LineGeom, symbol: string, t: number, tf?: Timeframe): number =>
  'flat' in g ? g.flat : (barLine(g, symbol, tf, t, t)?.price(t) ?? priceOn(symbol, g, t))

/**
 * Table of points from `from` to `to`: start, every bend in between, end. A bend is a session edge, or on a bar grid
 * (`tf`) a bar whose gap to the next one differs from the gap before it (the last bar of a day, the first after a night).
 */
export function lineKnots(g: LineGeom, symbol: string, from: number, to: number, tf?: Timeframe): Knot[] {
  if (to <= from) return []
  if ('flat' in g) return [[from, g.flat], [to, g.flat]]
  if (g.t1 === g.t2) return [[from, g.p2], [to, g.p2]]
  const line = barLine(g, symbol, tf, from, to)
  if (line) {
    const { bars, price } = line
    const knots: Knot[] = [[from, price(from)]]
    for (let i = 1; i < bars.length - 1; i++)
      if (bars[i] > from && bars[i] < to && bars[i] - bars[i - 1] !== bars[i + 1] - bars[i]) knots.push([bars[i], price(bars[i])])
    knots.push([to, price(to)])
    return knots
  }
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
