// Soft magnet for drawing: a point near the open, high, low or close of the nearest bar snaps onto it; farther away it
// stays where it was put, so a stop just below a low can still be set (or the magnet switched off, or Ctrl held).
import type { Candle } from '../../../shared/types.ts'
import type { Drawing } from '../store/useStore.ts'

export type SnapKind = 'open' | 'high' | 'low' | 'close'
const KINDS: SnapKind[] = ['open', 'high', 'low', 'close']

/** How a tool uses the magnet: onto a bar's price, onto the bar only (time tools), or not at all. */
export function magnetMode(tool: Drawing['type'], enabled: boolean, ctrl: boolean): 'price' | 'time' | 'off' {
  if (tool === 'text' || !enabled || ctrl) return 'off'
  return tool === 'vline' || tool === 'fibtime' || tool === 'avwap' ? 'time' : 'price'
}

/**
 * A point (bar index `logical`, `price`, its pixel `y`) after the magnet: on the nearest bar, and on its open, high,
 * low or close when one lies within `reach` px. Outside the loaded bars nothing snaps.
 */
export function snapPoint(
  at: { logical: number; price: number; y: number },
  candles: Candle[],
  toY: (price: number) => number | null,
  reach: number,
  mode: 'price' | 'time' | 'off'
): { logical: number; price: number; kind?: SnapKind } {
  const i = Math.round(at.logical)
  const bar = candles[i]
  if (mode === 'off' || !bar) return { logical: at.logical, price: at.price }
  if (mode === 'time') return { logical: i, price: at.price }
  let best: { kind: SnapKind; d: number } | null = null
  for (const kind of KINDS) {
    const y = toY(bar[kind])
    const d = y === null ? Infinity : Math.abs(y - at.y)
    if (d <= reach && (!best || d < best.d)) best = { kind, d }
  }
  // Out of reach the point stays exactly where it was put, as without the magnet.
  return best ? { logical: i, price: bar[best.kind], kind: best.kind } : { logical: at.logical, price: at.price }
}
