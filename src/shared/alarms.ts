// Price alarms: "tell me when AAPL reaches 230", or when it touches a drawn line (lineAlarm.ts). The same rule runs
// in the app and in the Android background check (android/.../AlarmCheck.java), so keep both in step. Times are in
// seconds.
import { linePrice, type Knot } from './lineAlarm.ts'
import { TIMEFRAMES, type Timeframe } from './types.ts'

export interface Alarm {
  id: string
  symbol: string
  /** Fires when a bar's high reaches `price` (above) or its low falls to it (below). */
  op: 'above' | 'below'
  /** Fixed alarms: the price. Line alarms: where the line was when armed (the line itself decides). */
  price: number
  createdAt: number
  triggeredAt?: number
  triggeredPrice?: number
  /** Bars before this time are already checked. */
  checkedUntil?: number
  /**
   * A line alarm: drawing list key (`<tabId>:<symbol>`), drawing id, which of its lines (lineParts) and the timeframe it
   * was armed on (the line runs on in its bars; lineAlarm.ts).
   */
  line?: { key: string; drawing: string; part: string; tf?: Timeframe }
  /** The line's end passed without a touch. */
  expiredAt?: number
}

/** Still waiting: neither reached nor run out. */
export const isArmed = (a: Alarm): boolean => a.triggeredAt === undefined && a.expiredAt === undefined

/** Whether a symbol has an alarm still waiting (the bell in the watchlist). */
export const armedFor = (alarms: Alarm[], symbol: string): boolean => alarms.some((a) => a.symbol === symbol && isArmed(a))

/**
 * "Now" for alarms (seconds), on the exchange's clock: the latest quote's time when there is one. Alarm times are
 * compared with bar times, and a device clock may be off (the user's PC by about an hour).
 */
export const alarmClock = (quoteTime: number | undefined, wall = Math.floor(Date.now() / 1000)): number =>
  quoteTime !== undefined && Number.isFinite(quoteTime) && quoteTime > 0 ? Math.floor(quoteTime) : wall

/** The direction follows from where the price is now; at the current price there is nothing to wait for. */
export function newAlarm(symbol: string, price: number, current: number, now = Math.floor(Date.now() / 1000)): Alarm | 'at-price' {
  if (price === current) return 'at-price'
  return { id: crypto.randomUUID(), symbol, op: price > current ? 'above' : 'below', price, createdAt: now }
}

/** A line alarm, armed against where the line is now (`lineNow`); like newAlarm. */
export function newLineAlarm(symbol: string, line: NonNullable<Alarm['line']>, lineNow: number, current: number, now: number): Alarm | 'at-price' {
  const a = newAlarm(symbol, lineNow, current, now)
  return a === 'at-price' ? a : { ...a, line }
}

/**
 * A moved line starts watching anew, like re-arming: no old bars against the new line, and a line dragged across the
 * price does not fire at once. Alarms that already fired or ran out stay as they are.
 */
export function restartLine(a: Alarm, now: number, current: number, lineNow: number): Alarm {
  if (!isArmed(a)) return a
  const { checkedUntil: _, ...rest } = a
  const op = current === lineNow ? a.op : lineNow > current ? 'above' : 'below'
  return { ...rest, op, price: lineNow, createdAt: now }
}

/**
 * First bar since the last check that reached the alarm price; bars starting earlier do not count. A line alarm
 * compares each bar with the line at that bar's time (`knots`); without a table it never fires.
 */
export function hit(a: Alarm, bars: { time: number; high: number; low: number }[], knots?: Knot[]): { time: number; price: number } | null {
  if (!isArmed(a)) return null
  const from = a.checkedUntil ?? a.createdAt
  for (const b of bars) {
    if (b.time < from) continue
    const price = a.line ? (knots ? linePrice(knots, b.time) : null) : a.price
    if (price !== null && (a.op === 'above' ? b.high >= price : b.low <= price)) return { time: b.time, price }
  }
  return null
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const optTime = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v))

/** The alarm if it has every field it needs (from the other device or a backup), else null. */
export function checkAlarm(v: unknown): Alarm | null {
  if (!isObj(v) || !str(v.id) || !str(v.symbol) || typeof v.price !== 'number' || (v.op !== 'above' && v.op !== 'below') || typeof v.createdAt !== 'number') return null
  if (!optTime(v.triggeredAt) || !optTime(v.expiredAt) || !optTime(v.checkedUntil)) return null
  // A line that cannot be read must not turn into a fixed-price alarm at the arming price.
  if (v.line !== undefined && !(isObj(v.line) && str(v.line.key) && str(v.line.drawing) && str(v.line.part))) return null
  const tf = isObj(v.line) ? v.line.tf : undefined
  if (tf !== undefined && !TIMEFRAMES.includes(tf as Timeframe)) return null
  // The drawing list of this symbol in some tab ("<tab>:<symbol>"), never an object property name like __proto__.
  if (v.line && !((v.line.key as string).length > v.symbol.length + 1 && (v.line.key as string).endsWith(':' + v.symbol))) return null
  return v as unknown as Alarm
}

/** Removes the line alarms of these drawings (all of the list `key` without ids). */
export const dropAlarmsOf = (alarms: Alarm[], key: string, drawingIds?: string[]): Alarm[] =>
  alarms.filter((a) => !(a.line?.key === key && (!drawingIds || drawingIds.includes(a.line.drawing))))

/** Removes the line alarms of every drawing in a chart tab. */
export const dropAlarmsOfTab = (alarms: Alarm[], tabId: string): Alarm[] => alarms.filter((a) => !a.line?.key.startsWith(tabId + ':'))

/**
 * Where the next check starts after looking at bars up to `newest` (the newest bar may still move, so it is
 * looked at again). Never moves back: bars from before the alarm was set (Friday's last bar, seen on Saturday)
 * must not count.
 */
export const checkedAfter = (a: Alarm, newest: number): number => Math.max(a.checkedUntil ?? a.createdAt, newest)

export interface NativeTrigger {
  id: string
  triggeredAt: number
  triggeredPrice: number
  checkedUntil: number
}

/** Takes in what the background check found; the earliest trigger wins, so applying it again changes nothing. */
export function mergeTriggered(local: Alarm[], native: NativeTrigger[]): Alarm[] {
  return local.map((a) => {
    const n = native.find((x) => x.id === a.id)
    // A trigger from before the alarm was armed again belongs to the old round.
    if (!n || (a.triggeredAt === undefined && n.triggeredAt < (a.checkedUntil ?? a.createdAt))) return a
    const earlier = a.triggeredAt === undefined || n.triggeredAt < a.triggeredAt
    return {
      ...a,
      ...(earlier ? { triggeredAt: n.triggeredAt, triggeredPrice: n.triggeredPrice } : {}),
      checkedUntil: Math.max(a.checkedUntil ?? 0, n.checkedUntil)
    }
  })
}
