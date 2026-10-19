import type { Candle } from './types'

// shortcut: buckets are aligned to UTC, not exchange sessions; switch to session-aligned bars if that matters.
export function aggregate(candles: Candle[], seconds: number): Candle[] {
  const out: Candle[] = []
  for (const c of candles) {
    const time = Math.floor(c.time / seconds) * seconds
    const last = out[out.length - 1]
    if (last?.time === time) {
      last.high = Math.max(last.high, c.high)
      last.low = Math.min(last.low, c.low)
      last.close = c.close
      last.volume += c.volume
    } else out.push({ ...c, time })
  }
  return out
}

/**
 * Maps a timestamp to a fractional bar index. Between bars it interpolates, outside the data it
 * extrapolates by `step` seconds per bar, so drawings survive timeframe switches and future space.
 */
export function timeToLogical(times: number[], t: number, step: number): number {
  const n = times.length
  if (t <= times[0]) return (t - times[0]) / step
  if (t >= times[n - 1]) return n - 1 + (t - times[n - 1]) / step
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= t) lo = mid
    else hi = mid
  }
  return lo + (t - times[lo]) / (times[hi] - times[lo])
}

export function logicalToTime(times: number[], l: number, step: number): number {
  const n = times.length
  if (l <= 0) return times[0] + l * step
  if (l >= n - 1) return times[n - 1] + (l - (n - 1)) * step
  const i = Math.floor(l)
  return times[i] + (l - i) * (times[i + 1] - times[i])
}

/** Folds a price tick into the last bar, or opens the next bar on the timeframe grid anchored at the last bar. */
export function mergeTick(last: Candle, price: number, time: number, seconds: number): Candle {
  if (time < last.time + seconds) {
    return { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price }
  }
  const t = last.time + Math.floor((time - last.time) / seconds) * seconds
  return { time: t, open: price, high: price, low: price, close: price, volume: 0 }
}
