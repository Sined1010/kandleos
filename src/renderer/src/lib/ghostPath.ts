/** Small seeded random numbers: the ghost path is the same on every render. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Ghost = { open: number; close: number; hi: number; lo: number; top: number; body: number }

/**
 * The forecast loader's candles (ForecastLoader.tsx): a calm random walk from the last close, in units of the chart's
 * average candle range (0 = last close, up positive).
 */
export function ghostPath(count: number): Ghost[] {
  const rnd = seeded(7)
  let close = 0
  return Array.from({ length: count }, () => {
    const open = close
    // A pull back towards the start keeps the path in the forecast's area instead of drifting off.
    close = open + (rnd() - 0.5) * 0.9 - open * 0.08
    const top = Math.max(open, close)
    const bottom = Math.min(open, close)
    return { open, close, hi: top + rnd() * 0.3, lo: bottom - rnd() * 0.3, top, body: top - bottom }
  })
}
