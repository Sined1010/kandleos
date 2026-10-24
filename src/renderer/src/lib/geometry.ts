// Pure helpers for the drawing tools (pixel and price math), kept apart so they can be tested.
import { t } from '../../../shared/i18n.ts'

/** End point of a ray from (x1,y1) through (x2,y2), continued to the left or right edge of the plot. */
export function rayEnd(x1: number, y1: number, x2: number, y2: number, width: number): [number, number] {
  if (x2 === x1) return [x2, y2 >= y1 ? 1e6 : -1e6]
  const edge = x2 > x1 ? width : 0
  return [edge, y1 + ((y2 - y1) * (edge - x1)) / (x2 - x1)]
}

/** Whether point i of a wave is a trough (lower on screen than its neighbours), so its label goes below it. */
export function isTrough(ys: number[], i: number): boolean {
  const prev = ys[i - 1] ?? ys[i + 1]
  const next = ys[i + 1] ?? ys[i - 1]
  return ys[i] >= (prev + next) / 2
}

/**
 * Price distance of the third channel point from the line through the first two, measured at the third point's
 * bar position (`l1..l3` are fractional bar indexes), so the parallel line keeps that distance in price.
 */
export function channelOffset(l1: number, p1: number, l2: number, p2: number, l3: number, p3: number): number {
  const onLine = l2 === l1 ? p1 : p1 + ((p2 - p1) * (l3 - l1)) / (l2 - l1)
  return p3 - onLine
}

/** Ratios of the trend-based Fibonacci extension: targets from the pullback C in multiples of the move A → B. */
export const FIB_EXT_LEVELS = [0, 0.618, 1, 1.618, 2.618]
export const fibExtPrice = (a: number, b: number, c: number, ratio: number): number => c + (b - a) * ratio

/** Fibonacci time zones: bar offsets in units of the distance between the two clicks. */
export const FIB_TIME_ZONES = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]

/** Fibonacci fan: share of the move given back at the end point, one ray each (0 is the move itself). */
export const FIB_FAN_LEVELS = [0, 0.382, 0.5, 0.618]
/** Price the fan ray `ratio` passes through at the end of the move. */
export const fanPrice = (start: number, end: number, ratio: number): number => end - (end - start) * ratio

/**
 * Sine line through an extreme at bar `l1` and the next opposite extreme at bar `l2` (half a period later):
 * the price at bar `l`. Before the half period is known (same bar) it stays at the first price.
 */
export function sinePrice(l1: number, p1: number, l2: number, p2: number, l: number): number {
  const half = l2 - l1
  if (!half) return p1
  return (p1 + p2) / 2 - ((p2 - p1) / 2) * Math.cos((Math.PI * (l - l1)) / half)
}

/** Label of the measure tool: absolute and percentage change plus the number of bars. */
export function measureLabel(from: number, to: number, bars: number, fmt: (p: number) => string): string {
  const diff = to - from
  const pct = from ? (diff / from) * 100 : 0
  const sign = diff >= 0 ? '+' : '−'
  return `${sign}${fmt(Math.abs(diff))} (${sign}${Math.abs(pct).toFixed(2)} %) · ${t('{n} Kerzen', { n: Math.round(Math.abs(bars)) })}`
}
