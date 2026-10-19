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

/**
 * Timestamps of the next `count` bars, following the trading calendar seen in the history: only weekdays
 * (and, for intraday bars, times of day) that occur in recent bars are used. Crypto stays 24/7, stocks skip
 * nights and weekends, so a 64-bar forecast is labelled with the dates it really reaches.
 */
// shortcut: holidays and DST shifts are not modelled; fine for a projection, upgrade with an exchange calendar.
export function futureTimes(times: number[], seconds: number, count: number): number[] {
  const last = times[times.length - 1]
  const even = () => Array.from({ length: count }, (_, i) => last + (i + 1) * seconds)
  // The calendar comes from the bars before the last one: Yahoo stamps the live bar with the current time.
  const history = times.slice(0, -1)
  // Markets that trade around the clock (crypto) have no gaps; weekly bars have none worth modelling.
  const gappy = history.some((t, i) => i > 0 && t - history[i - 1] > seconds)
  if (seconds >= 604800 || !gappy) return even()
  const weekdays = new Set(history.map((t) => new Date(t * 1000).getUTCDay()))
  const out: number[] = []
  if (seconds >= 86400) {
    for (let t = last + seconds; out.length < count; t += seconds) if (weekdays.has(new Date(t * 1000).getUTCDay())) out.push(t)
    return out
  }
  // Intraday: the times of day bars start at (session hours, incl. odd closing bars), on the trading weekdays.
  const slots = [...new Set(history.map((t) => t % 86400))].sort((a, b) => a - b)
  for (let day = Math.floor(last / 86400); out.length < count; day++) {
    if (!weekdays.has(new Date(day * 86400 * 1000).getUTCDay())) continue
    for (const s of slots) if (day * 86400 + s > last && out.length < count) out.push(day * 86400 + s)
  }
  return out
}

/** Folds a price tick into the last bar, or opens the next bar on the timeframe grid anchored at the last bar. */
export function mergeTick(last: Candle, price: number, time: number, seconds: number): Candle {
  if (time < last.time + seconds) {
    return { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price }
  }
  const t = last.time + Math.floor((time - last.time) / seconds) * seconds
  return { time: t, open: price, high: price, low: price, close: price, volume: 0 }
}
