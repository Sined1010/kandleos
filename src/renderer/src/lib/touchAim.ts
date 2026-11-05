/** On the phone the crosshair sits above the finger, so the finger never hides the point being placed. */
export const AIM_OFFSET = { x: 0, y: -64 }

/** Crosshair position for a finger at `finger` (chart-relative px), kept inside the chart area. */
export function aimAt(finger: { x: number; y: number }, box: { width: number; height: number }): { x: number; y: number } {
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v))
  return { x: clamp(finger.x + AIM_OFFSET.x, box.width), y: clamp(finger.y + AIM_OFFSET.y, box.height) }
}

/** Where two fingers began: their gap and midpoint (px) and the visible bar range then. */
export interface PinchStart {
  gap: number
  mid: number
  from: number
  to: number
}

/** Visible bar range for a pinch now at `gap`/`mid` in a chart `width` px wide: the bar under the starting
 *  midpoint stays under the fingers, and fingers moving apart show fewer bars. */
export function pinchRange(s: PinchStart, gap: number, mid: number, width: number): { from: number; to: number } {
  const span = ((s.to - s.from) * s.gap) / gap
  const anchor = s.from + (s.mid / width) * (s.to - s.from)
  const from = anchor - (mid / width) * span
  return { from, to: from + span }
}
