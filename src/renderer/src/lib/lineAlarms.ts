// Line alarms against the drawings in the store: the table each check reads (shared/lineAlarm.ts), and where an
// alarmed line lies now. PC and phone; runs without the window.
import type { Alarm } from '../../../shared/alarms.ts'
import { t } from '../../../shared/i18n.ts'
import { LINE_HORIZON, lineGeom, lineKnots, lineParts, linePrice, shapeKey, type Knot } from '../../../shared/lineAlarm.ts'
import type { Timeframe } from '../../../shared/types.ts'
import type { Drawing } from '../store/useStore.ts'

export type LineTable = { knots: Knot[]; until?: number }

/** The drawing a line alarm hangs on, if this device has it. */
export const drawingOf = (a: Alarm, drawings: Record<string, Drawing[]>): Drawing | undefined =>
  a.line && Object.hasOwn(drawings, a.line.key) ? drawings[a.line.key].find((d) => d.id === a.line!.drawing) : undefined

const DAY = 86_400
// Tables by the line's shape and window, not by drawing object: a sync rebuilds every drawing from text, and the same
// line must keep its table. A share's table walks the trading calendar back to the line's points, which is too slow
// for every frame or quote. The oldest entries go first once there are many.
const tables = new Map<string, Knot[] | null>()
const MAX_TABLES = 200

/**
 * The table of one line of a drawing from `from` to `to`, counted in bars of `tf` where those differ in length
 * (lineKnots); computed once per shape and window; null without the line.
 */
export function lineTable(d: Drawing, part: string, symbol: string, from: number, to: number, tf?: Timeframe): Knot[] | null {
  const key = `${shapeKey(d)}|${part}|${symbol}|${from}|${to}|${tf ?? ''}`
  const hit = tables.get(key)
  if (hit !== undefined) return hit
  const g = lineGeom(d, part, symbol, tf)
  const knots = g ? lineKnots(g, symbol, from, to, tf) : null
  if (tables.size >= MAX_TABLES) tables.delete(tables.keys().next().value!)
  tables.set(key, knots)
  return knots
}

/**
 * The table a check reads: from the (re)arm to the drawing's alarm end,
 * at most a year ahead (counted from the start of today, so the table stays the same all day). 'missing' when the
 * drawing or its line is not here (deleted, or a sync still on its way).
 */
export function knotsFor(a: Alarm, drawings: Record<string, Drawing[]>, now: number): LineTable | 'missing' {
  const d = drawingOf(a, drawings)
  if (!d || !a.line || !lineParts(d).includes(a.line.part)) return 'missing'
  // From the (re)arm on: hit() and the Android check skip bars before checkedUntil themselves, and the table (and its
  // cache) stays the same from one check to the next.
  const from = a.createdAt
  const until = d.alarmUntil
  const to = Math.min(until ?? Infinity, Math.floor(now / DAY) * DAY + LINE_HORIZON)
  const knots = lineTable(d, a.line.part, a.symbol, from, to, a.line.tf)
  return knots ? { knots, ...(until !== undefined && { until }) } : 'missing'
}

const side = (part: string) => (part === 'top' ? t('oben') : part === 'mid' ? t('Mitte') : t('unten'))
const pct = (part: string) => `${+(Number(part) * 100).toFixed(1)} %`

/** Which line it is, for the alarm list and the notification: "Trend line", "Channel top", "Fib 61.8 %". */
export function lineLabel(a: Alarm, drawings: Record<string, Drawing[]>): string {
  const d = drawingOf(a, drawings)
  const part = a.line?.part ?? ''
  switch (d?.type) {
    case 'trend':
      return t('Trendlinie')
    case 'ray':
      return t('Strahl')
    case 'hline':
      return t('Waagrechte Linie')
    case 'channel':
      return t('Kanal {side}', { side: side(part) })
    case 'rect':
      return t('Rechteck {side}', { side: side(part) })
    case 'fib':
      return t('Fib {level}', { level: pct(part) })
    case 'fibext':
      return t('Fib-Erweiterung {level}', { level: pct(part) })
    default:
      return t('Linie')
  }
}

/** Where the clock sits on the line: its price at `now`; null without a table, outside it, or past the alarm's end. */
export const clockAt = (knots: Knot[] | null, now: number, until?: number): number | null =>
  !knots || (until !== undefined && until < now) ? null : linePrice(knots, now)

/** Where the alarm's line lies at `now`; null without its drawing. */
export function lineNow(a: Alarm, drawings: Record<string, Drawing[]>, now: number): number | null {
  const d = drawingOf(a, drawings)
  if (!d || !a.line) return null
  // Read from a cached table over today and tomorrow instead of walking the calendar on every call.
  const day = Math.floor(now / DAY) * DAY
  const knots = lineTable(d, a.line.part, a.symbol, day, day + 2 * DAY, a.line.tf)
  return knots && linePrice(knots, now)
}
