// Alarms of a long/short position box (renderer/src/lib/positionBox.ts). Target and stop are a pair: whichever a bar
// reaches first decides the trade and switches the other off (the stop when both fall in the same bar). With the price
// outside stop–target when armed (a breakout, or an entry far from the price) the pair waits until a bar touches the
// entry. The same rules run in AlarmCheck.java for the Android background check.
import { isArmed, type Alarm } from './alarms.ts'
import type { BoxDrawing } from '../renderer/src/lib/positionBox.ts'

type Bar = { time: number; high: number; low: number }
const PAIR = ['target', 'stop']
const isPair = (a: Alarm): boolean => !!a.line && PAIR.includes(a.line.part)

/** The direction is fixed by the side, not by where the price is (a breakout stop lies above it). */
export const boxOp = (type: 'long' | 'short', part: 'target' | 'stop'): 'above' | 'below' =>
  (part === 'target') === (type === 'long') ? 'above' : 'below'

/**
 * A box's target or stop armed (again) at `now`: its line price, the fixed direction, and whether the pair waits for
 * the entry. Drawn at about the price (within a tenth of the stop distance), the entry counts as reached already;
 * without a price (`current` undefined) the pair waits for the entry. A waiting side that lies between the price and
 * the entry (`near`) is crossed on the way to the entry: in the bar that reaches the entry it does not count.
 * Other alarms come back unchanged.
 */
export function armBox(a: Alarm, d: BoxDrawing, current: number | undefined, now: number): Alarm {
  if (!isPair(a)) return a
  const part = a.line!.part as 'target' | 'stop'
  const [entry, target, stop] = d.points.map((p) => p.price)
  const wait = current === undefined || !(current > Math.min(stop, target) && current < Math.max(stop, target))
  const reached = current !== undefined && Math.abs(current - entry) <= 0.1 * Math.abs(entry - stop)
  const price = part === 'target' ? target : stop
  const near = wait && current !== undefined && price > Math.min(current, entry) && price < Math.max(current, entry)
  const { checkedUntil: _c, triggeredAt: _t, triggeredPrice: _p, expiredAt: _e, cancelledAt: _x, ...rest } = a
  return {
    ...rest,
    op: boxOp(d.type, part),
    price,
    createdAt: now,
    box: { entry, wait, ...(reached && { entryAt: now }), ...(near && { near: true }) }
  }
}

/**
 * Bars since the last check against a box alarm: the first bar reaching its price (from the bar that touches the
 * entry on, when the pair waits for it, except a `near` side in that very bar), and when the entry was first touched.
 */
export function scanBox(a: Alarm, bars: Bar[]): { hit: { time: number; price: number } | null; entryAt?: number } {
  const stored = a.box?.entryAt
  if (!a.box || !isArmed(a)) return { hit: null, entryAt: stored }
  const from = a.checkedUntil ?? a.createdAt
  const { entry, wait } = a.box
  // A stored entry only opens the bars when it lies before them; one from a bar read again (the newest bar is) or
  // from a live price inside a bar is found again in the bars, so its bar stays the entry bar.
  let seen = stored !== undefined && stored < from ? stored : undefined
  const result = (hit: { time: number; price: number } | null) => ({ hit, entryAt: stored !== undefined && (seen === undefined || stored < seen) ? stored : seen })
  for (const b of bars) {
    if (b.time < from) continue
    const waiting = wait && seen === undefined
    if (seen === undefined && b.low <= entry && entry <= b.high) seen = b.time
    if (wait && seen === undefined) continue
    // The bar that brought the entry crossed a near side first (it lies between the arming price and the entry).
    if (waiting && a.box.near) continue
    if (a.op === 'above' ? b.high >= a.price : b.low <= a.price) return result({ time: b.time, price: a.price })
  }
  return result(null)
}

/** The other side of a box's target or stop. */
export const partnerOf = (a: Alarm, alarms: Alarm[]): Alarm | undefined =>
  isPair(a)
    ? alarms.find((x) => x.id !== a.id && isPair(x) && x.line!.key === a.line!.key && x.line!.drawing === a.line!.drawing && x.line!.part !== a.line!.part)
    : undefined

/** Which side decided: the earlier bar, the stop on a tie (the order inside one bar is unknown). */
export function pairWinner(target: { time: number } | null, stop: { time: number } | null): 'target' | 'stop' | null {
  if (!target) return stop ? 'stop' : null
  if (!stop) return 'target'
  return target.time < stop.time ? 'target' : 'stop'
}

/**
 * Makes every pair agree after a check or a sync: both reached (two devices saw a side each) → the earlier one stays,
 * the other is switched off at that time; one reached → the other, still armed, is switched off. Applying it twice
 * changes nothing.
 */
export function settlePairs(list: Alarm[]): Alarm[] {
  // A reached alarm is never also switched off (a background hit can arrive for one the app switched off meanwhile).
  const alarms: Alarm[] = list.map((a) => {
    if (a.triggeredAt === undefined || a.cancelledAt === undefined) return a
    const { cancelledAt: _x, ...rest } = a
    return rest
  })
  return alarms.map((a) => {
    const p = partnerOf(a, alarms)
    // Both switched off (each unit came from a different device): each `cancelledAt` is when the other side was
    // reached, so the earlier of the two decided (the stop on a tie). That side is reached again, at its line price.
    if (p && a.cancelledAt !== undefined && p.cancelledAt !== undefined && a.triggeredAt === undefined && p.triggeredAt === undefined) {
      const won = pairWinner(
        { time: a.line!.part === 'target' ? p.cancelledAt : a.cancelledAt },
        { time: a.line!.part === 'stop' ? p.cancelledAt : a.cancelledAt }
      )
      if (won !== a.line!.part) return { ...a, cancelledAt: Math.min(a.cancelledAt, p.cancelledAt) }
      const { cancelledAt: _x, ...rest } = a
      return { ...rest, triggeredAt: p.cancelledAt, triggeredPrice: a.price }
    }
    if (!p || p.triggeredAt === undefined) return a
    if (a.triggeredAt !== undefined) {
      const won = pairWinner(
        a.line!.part === 'target' ? { time: a.triggeredAt } : { time: p.triggeredAt },
        a.line!.part === 'stop' ? { time: a.triggeredAt } : { time: p.triggeredAt }
      )
      if (won === a.line!.part) return a
      const { triggeredAt: _t, triggeredPrice: _p, ...rest } = a
      return { ...rest, cancelledAt: p.triggeredAt }
    }
    // A partner hit from before this side was (re)armed belongs to an old round.
    return isArmed(a) && p.triggeredAt >= a.createdAt ? { ...a, cancelledAt: p.triggeredAt } : a
  })
}
