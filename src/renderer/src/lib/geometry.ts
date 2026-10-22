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

/** Label of the measure tool: absolute and percentage change plus the number of bars. */
export function measureLabel(from: number, to: number, bars: number, fmt: (p: number) => string): string {
  const diff = to - from
  const pct = from ? (diff / from) * 100 : 0
  const sign = diff >= 0 ? '+' : '−'
  return `${sign}${fmt(Math.abs(diff))} (${sign}${Math.abs(pct).toFixed(2)} %) · ${t('{n} Kerzen', { n: Math.round(Math.abs(bars)) })}`
}
