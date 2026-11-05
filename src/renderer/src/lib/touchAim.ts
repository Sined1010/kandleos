/** On the phone the crosshair sits above the finger, so the finger never hides the point being placed. */
export const AIM_OFFSET = { x: 0, y: -64 }

/** Crosshair position for a finger at `finger` (chart-relative px), kept inside the chart area. */
export function aimAt(finger: { x: number; y: number }, box: { width: number; height: number }): { x: number; y: number } {
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v))
  return { x: clamp(finger.x + AIM_OFFSET.x, box.width), y: clamp(finger.y + AIM_OFFSET.y, box.height) }
}
