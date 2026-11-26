// Long/short position box: entry, target and stop as flat lines between a left and a right edge. The numbers it shows,
// where a new one goes, and how its handles drag. No account and no position size: distances per unit only.
import { atr } from './indicators.ts'
import { isArmed, type Alarm } from '../../../shared/alarms.ts'
import type { Candle } from '../../../shared/types.ts'
import type { Drawing, Point } from '../store/useStore.ts'

export type BoxDrawing = Extract<Drawing, { type: 'long' | 'short' }>

/** Bars a new box reaches to the right of its entry. */
export const BOX_BARS = 20
const ATR_PERIOD = 14

/**
 * Distances from the entry: target positive, stop negative (in % of the entry and per unit), and reward to risk.
 */
export function boxNumbers(d: BoxDrawing): { targetPct: number; stopPct: number; targetAbs: number; stopAbs: number; ratio: number } {
  const [e, t, s] = d.points.map((p) => p.price)
  const targetAbs = Math.abs(t - e)
  const stopAbs = -Math.abs(e - s)
  return { targetPct: (targetAbs / e) * 100, stopPct: (stopAbs / e) * 100, targetAbs, stopAbs, ratio: targetAbs / -stopAbs }
}

/** A box at `entry`: stop 1 ATR(14), target 1.5 ATR away (2 % / 3 % with too few bars), alarms ending at its right edge. */
export function newBox(type: 'long' | 'short', id: string, entry: Point, candles: Candle[], rightTime: number): BoxDrawing {
  const a = candles.length > ATR_PERIOD ? atr(candles, ATR_PERIOD).at(-1)! : NaN
  const [risk, reward] = Number.isFinite(a) && a > 0 ? [a, 1.5 * a] : [0.02 * entry.price, 0.03 * entry.price]
  const dir = type === 'long' ? 1 : -1
  const at = (price: number) => ({ time: entry.time, price })
  return {
    id,
    type,
    points: [at(entry.price), at(entry.price + dir * reward), at(entry.price - dir * risk), { time: rightTime, price: entry.price }],
    alarmUntil: rightTime
  }
}

/**
 * What the box shows (`alarms`: this box's): the side that was reached, still watching, run out, or no alarms (then
 * the right edge tells whether it is over).
 */
export function boxState(alarms: Alarm[], d: BoxDrawing, now: number): 'running' | 'target' | 'stop' | 'expired' | 'idle' {
  const pair = alarms.filter((a) => a.line?.part === 'target' || a.line?.part === 'stop')
  const reached = pair.find((a) => a.triggeredAt !== undefined)
  if (reached) return reached.line!.part as 'target' | 'stop'
  if (pair.some(isArmed)) return 'running'
  if (pair.some((a) => a.expiredAt !== undefined)) return 'expired'
  return d.points[3].time < now ? 'expired' : 'idle'
}

/**
 * A handle dragged: 0 the whole box (time and price), 1 the target and 2 the stop (price, kept on their side of the
 * entry), 3 the right edge (time, kept right of the left edge; it is the alarms' end too).
 */
export function dragBox(o: BoxDrawing, handle: 0 | 1 | 2 | 3, cursor: Point, shiftTime: (t: number) => number, dPrice: number): BoxDrawing {
  const [e, t, s, r] = o.points
  if (handle === 0) {
    // The alarm end is the right edge: it moves along (no end stays none).
    const points = o.points.map((p) => ({ time: shiftTime(p.time), price: p.price + dPrice }))
    return { ...o, points, ...(o.alarmUntil !== undefined && { alarmUntil: points[3].time }) }
  }
  if (handle === 3) {
    const time = Math.max(cursor.time, e.time + 1)
    return { ...o, points: [e, t, s, { ...r, time }], alarmUntil: time }
  }
  // Up is the target's side for a long and the stop's side for a short.
  const up = (handle === 1) === (o.type === 'long')
  const gap = Math.abs(e.price) * 1e-4
  const price = up ? Math.max(cursor.price, e.price + gap) : Math.min(cursor.price, e.price - gap)
  const moved = { ...(handle === 1 ? t : s), price }
  return { ...o, points: handle === 1 ? [e, moved, s, r] : [e, t, moved, r] }
}
