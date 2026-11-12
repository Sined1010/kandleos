import { barZone, periodIndex, periodStart, utcOffset } from './calendar.ts'
import type { Candle } from './types'

/** Groups bars into buckets; `bucketOf` gives each bar's bucket start time. */
function group(candles: Candle[], bucketOf: (t: number) => number): Candle[] {
  const out: Candle[] = []
  for (const c of candles) {
    const time = bucketOf(c.time)
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
 * Buckets of `seconds`, shifted by `offset`. With `timeZone` the grid runs on that zone's clock, so 2h/4h stock bars
 * keep their time of day across a DST switch (on a UTC grid they would move by an hour, and the forecast's future bars
 * would take both seasons' times). Without one the grid is UTC (crypto, and hours built from half hours).
 */
export function aggregate(candles: Candle[], seconds: number, offset = 0, timeZone?: string): Candle[] {
  if (!timeZone) return group(candles, (t) => Math.floor((t - offset) / seconds) * seconds + offset)
  return group(candles, (t) => {
    const shift = utcOffset(t, timeZone)
    return Math.floor((t + shift - offset) / seconds) * seconds + offset - shift
  })
}

/**
 * Groups monthly bars into calendar periods of `months` months (quarters, half-years, years from January).
 * Each period is stamped at midnight on its first day, read in the zone the source dates its bars in.
 */
export function aggregateMonths(candles: Candle[], months: number, timeZone = 'UTC'): Candle[] {
  const zone = barZone(candles.map((c) => c.time), timeZone)
  return group(candles, (t) => periodStart(periodIndex(t, months, zone), months, zone))
}

/**
 * Maps a timestamp to a fractional bar index. Between bars it interpolates, outside the data it
 * extrapolates, so drawings survive timeframe switches and future space: right by `step` seconds per bar,
 * left by the bars' average spacing.
 */
export function timeToLogical(times: number[], t: number, step: number): number {
  const n = times.length
  if (t <= times[0]) return (t - times[0]) / backStep(times, step)
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

// A shorter timeframe loads less history, so points drawn on a longer one can lie before the first bar. Stock
// bars skip nights and weekends; extrapolating there by `step` would push those points several times too far left.
const backStep = (times: number[], step: number) =>
  times.length > 1 ? (times[times.length - 1] - times[0]) / (times.length - 1) : step

export function logicalToTime(times: number[], l: number, step: number): number {
  const n = times.length
  if (l <= 0) return times[0] + l * backStep(times, step)
  if (l >= n - 1) return times[n - 1] + (l - (n - 1)) * step
  const i = Math.floor(l)
  return times[i] + (l - i) * (times[i + 1] - times[i])
}

/**
 * Folds a price tick into the last bar, or opens the next bar: on the timeframe grid anchored at the last bar, counted
 * on `zone`'s clock (2h/4h stock bars are built on it, see aggregate: across a DST weekend a UTC step would open
 * Monday's bar an hour off), or for month-based bars (`months` > 0) at the start of the tick's calendar period.
 */
export function mergeTick(last: Candle, price: number, time: number, seconds: number, months = 0, zone = 'UTC'): Candle {
  const fold = (): Candle => ({ ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price })
  if (months) {
    const period = periodIndex(time, months, zone)
    if (period <= periodIndex(last.time, months, zone)) return fold()
    return { time: periodStart(period, months, zone), open: price, high: price, low: price, close: price, volume: 0 }
  }
  const from = last.time + utcOffset(last.time, zone)
  const local = time + utcOffset(time, zone)
  if (local < from + seconds) return fold()
  const t = from + Math.floor((local - from) / seconds) * seconds - utcOffset(time, zone)
  return { time: t, open: price, high: price, low: price, close: price, volume: 0 }
}

/**
 * Yahoo ends intraday data with an extra point stamped "now" (14:14:30 on 5m bars). Live ticks are laid on a
 * grid anchored at the last bar, so that point is moved onto the grid of the bar before it, or folded into
 * that bar when it falls inside it.
 */
export function snapLast(candles: Candle[], seconds: number): Candle[] {
  const [prev, live] = candles.slice(-2)
  if (!live) return candles
  const time = prev.time + Math.floor((live.time - prev.time) / seconds) * seconds
  if (time === live.time) return candles
  const head = candles.slice(0, -2)
  if (time > prev.time) return [...head, prev, { ...live, time }]
  return [...head, { ...prev, high: Math.max(prev.high, live.high), low: Math.min(prev.low, live.low), close: live.close }]
}
