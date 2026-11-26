// Drawings as the store keeps them, checked for anything that comes from the other device (sync.ts): one broken
// drawing would otherwise crash the chart every time it is shown.
import type { Drawing, Tool } from '../renderer/src/store/useStore.ts'
import { isObj } from './types.ts'

/** Clicks each tool needs; the drawing is created on the last one. */
export const CLICKS: Record<Exclude<Tool, 'cursor'>, number> = {
  trend: 2,
  ray: 2,
  hline: 1,
  vline: 1,
  fib: 2,
  rect: 2,
  channel: 3,
  elliott: 6,
  abc: 4,
  measure: 2,
  fibext: 3,
  fibfan: 2,
  fibtime: 2,
  triangle: 6,
  wxy: 4,
  wxyxz: 6,
  sine: 2,
  avwap: 1,
  text: 1,
  // One click on the entry; target, stop and right edge come with it (lib/positionBox.ts newBox).
  long: 1,
  short: 1
}

/** A position box: entry, target, stop, right edge, with target and stop on their own side of the entry. */
function boxOk(type: 'long' | 'short', pts: unknown): boolean {
  if (!Array.isArray(pts) || pts.length !== 4 || !pts.every(point)) return false
  const [e, t, s] = pts.map((p) => p.price as number)
  return type === 'long' ? t > e && e > s : t < e && e < s
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const point = (p: unknown) => isObj(p) && finite(p.time) && finite(p.price)

/** The drawing if it has every field its type draws with, else null. */
export function checkDrawing(v: unknown): Drawing | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.type !== 'string' || !Object.hasOwn(CLICKS, v.type)) return null
  if (v.color !== undefined && typeof v.color !== 'string') return null
  if (v.alarmUntil !== undefined && !finite(v.alarmUntil)) return null
  const type = v.type as keyof typeof CLICKS
  const points = v.points
  const ok =
    type === 'hline'
      ? finite(v.price)
      : type === 'vline'
        ? finite(v.time)
        : type === 'trend' || type === 'fib'
          ? point(v.p1) && point(v.p2)
          : type === 'long' || type === 'short'
            ? boxOk(type, points)
            : Array.isArray(points) &&
            points.length >= CLICKS[type] &&
            points.length <= 64 &&
            points.every(point) &&
            (type !== 'text' || (typeof v.text === 'string' && (v.size === undefined || finite(v.size))))
  return ok ? (v as unknown as Drawing) : null
}
