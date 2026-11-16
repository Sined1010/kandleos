// All functions return arrays aligned with the input; warm-up slots are NaN.
import { mergeTick } from '../../../shared/candles.ts'
import type { Candle } from '../../../shared/types'

/** Leading NaNs are skipped, so it can smooth the output of another indicator. */
export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN)
  const start = values.findIndex((v) => !Number.isNaN(v))
  if (start < 0) return out
  let sum = 0
  for (let i = start; i < values.length; i++) {
    sum += values[i]
    if (i - start >= period) sum -= values[i - period]
    if (i - start >= period - 1) out[i] = sum / period
  }
  return out
}

/** Wilder's Average True Range. */
export function atr(c: Candle[], period: number): number[] {
  const out = new Array<number>(c.length).fill(NaN)
  let sum = 0
  let prev = NaN
  for (let i = 0; i < c.length; i++) {
    const tr =
      i === 0
        ? c[i].high - c[i].low
        : Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close))
    if (i < period) {
      sum += tr
      if (i === period - 1) out[i] = prev = sum / period
    } else out[i] = prev = (prev * (period - 1) + tr) / period
  }
  return out
}

/** Slow stochastic: %K smoothed by `smoothK`, %D = SMA(`smoothD`) of %K. */
export function stochastic(c: Candle[], period: number, smoothK: number, smoothD: number) {
  const raw = c.map((_, i) => {
    if (i < period - 1) return NaN
    let hi = -Infinity
    let lo = Infinity
    for (let j = i - period + 1; j <= i; j++) {
      hi = Math.max(hi, c[j].high)
      lo = Math.min(lo, c[j].low)
    }
    // A flat range has no position inside it; show the midpoint instead of dividing by zero.
    return hi === lo ? 50 : ((c[i].close - lo) / (hi - lo)) * 100
  })
  const k = sma(raw, smoothK)
  return { k, d: sma(k, smoothD) }
}

// shortcut: anchored to UTC midnight, not the exchange session; on 1D/1W bars it equals the typical price.
/** VWAP of the typical price, restarting every UTC day. */
export function vwap(c: Candle[]): number[] {
  let day = -1
  let pv = 0
  let vol = 0
  return c.map((x) => {
    const d = Math.floor(x.time / 86400)
    if (d !== day) {
      day = d
      pv = 0
      vol = 0
    }
    const tp = (x.high + x.low + x.close) / 3
    pv += tp * x.volume
    vol += x.volume
    return vol > 0 ? pv / vol : tp
  })
}

/** Supertrend line; `rising[i]` tells whether it runs below price (uptrend) or above (downtrend). */
export function supertrend(c: Candle[], period: number, mult: number) {
  const a = atr(c, period)
  const value = a.map(() => NaN)
  const rising = a.map(() => true)
  let upper = NaN
  let lower = NaN
  let up = true
  for (let i = 0; i < c.length; i++) {
    if (Number.isNaN(a[i])) continue
    const mid = (c[i].high + c[i].low) / 2
    const basicUpper = mid + mult * a[i]
    const basicLower = mid - mult * a[i]
    const prevClose = c[i - 1]?.close ?? c[i].close
    // Bands only tighten until price closes beyond them.
    upper = Number.isNaN(upper) || basicUpper < upper || prevClose > upper ? basicUpper : upper
    lower = Number.isNaN(lower) || basicLower > lower || prevClose < lower ? basicLower : lower
    if (up && c[i].close < lower) up = false
    else if (!up && c[i].close > upper) up = true
    value[i] = up ? lower : upper
    rising[i] = up
  }
  return { value, rising }
}

/** EMA seeded with the SMA of the first `period` defined values; leading NaNs are skipped. */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN)
  const start = values.findIndex((v) => !Number.isNaN(v))
  if (start < 0 || values.length - start < period) return out
  const k = 2 / (period + 1)
  let prev = values.slice(start, start + period).reduce((a, b) => a + b, 0) / period
  out[start + period - 1] = prev
  for (let i = start + period; i < values.length; i++) out[i] = prev = values[i] * k + prev * (1 - k)
  return out
}

export function bollinger(values: number[], period: number, mult: number) {
  const mid = sma(values, period)
  const upper = mid.map(() => NaN)
  const lower = mid.map(() => NaN)
  for (let i = period - 1; i < values.length; i++) {
    let sq = 0
    for (let j = i - period + 1; j <= i; j++) sq += (values[j] - mid[i]) ** 2
    const sd = Math.sqrt(sq / period)
    upper[i] = mid[i] + mult * sd
    lower[i] = mid[i] - mult * sd
  }
  return { mid, upper, lower }
}

/** Wilder's RSI. */
export function rsi(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN)
  if (values.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d > 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  const calc = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss))
  out[period] = calc()
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = calc()
  }
  return out
}

export function macd(values: number[], fast: number, slow: number, signal: number) {
  const f = ema(values, fast)
  const s = ema(values, slow)
  const line = f.map((v, i) => v - s[i])
  const sig = ema(line, signal)
  return { line, signal: sig, hist: line.map((v, i) => v - sig[i]) }
}

const trueRange = (c: Candle[], i: number) =>
  i === 0
    ? c[i].high - c[i].low
    : Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close))

/** Wilder's ADX: strength of a trend (0–100), whatever its direction. */
export function adx(c: Candle[], period: number): number[] {
  const out = new Array<number>(c.length).fill(NaN)
  let trS = 0
  let plusS = 0
  let minusS = 0
  let dxSum = 0
  let prev = NaN
  for (let i = 1; i < c.length; i++) {
    const up = c[i].high - c[i - 1].high
    const down = c[i - 1].low - c[i].low
    const plus = up > down && up > 0 ? up : 0
    const minus = down > up && down > 0 ? down : 0
    const tr = trueRange(c, i)
    if (i <= period) {
      trS += tr
      plusS += plus
      minusS += minus
    } else {
      trS += tr - trS / period
      plusS += plus - plusS / period
      minusS += minus - minusS / period
    }
    if (i < period) continue
    const pdi = trS > 0 ? plusS / trS : 0
    const ndi = trS > 0 ? minusS / trS : 0
    const dx = pdi + ndi > 0 ? (Math.abs(pdi - ndi) / (pdi + ndi)) * 100 : 0
    const k = i - period
    if (k < period) {
      dxSum += dx
      if (k === period - 1) out[i] = prev = dxSum / period
    } else out[i] = prev = (prev * (period - 1) + dx) / period
  }
  return out
}

/**
 * Bollinger squeeze: the bands lie inside the Keltner channel. Keltner uses plain moving averages (close and true
 * range) on purpose, so a bar depends only on its last `period` bars and never flips when older bars are loaded.
 * `lastRunning`: the last bar is still forming and stays unjudged (no grey, no dot) until it is finished.
 */
export function squeeze(c: Candle[], period: number, mult: number, kcMult: number, lastRunning: boolean) {
  const { mid, upper, lower } = bollinger(
    c.map((x) => x.close),
    period,
    mult
  )
  const range = sma(
    c.map((_, i) => trueRange(c, i)),
    period
  )
  const on = c.map(() => false)
  const released = c.map(() => false)
  const end = lastRunning ? c.length - 1 : c.length
  for (let i = period; i < end; i++) {
    on[i] = upper[i] < mid[i] + kcMult * range[i] && lower[i] > mid[i] - kcMult * range[i]
    released[i] = on[i - 1] && !on[i]
  }
  return { on, released }
}

/** VWAP of the typical price from bar `from` on; NaN before it and while no volume has traded. */
export function anchoredVwap(c: Candle[], from: number): number[] {
  let pv = 0
  let vol = 0
  return c.map((x, i) => {
    if (i < from) return NaN
    pv += ((x.high + x.low + x.close) / 3) * x.volume
    vol += x.volume
    return vol > 0 ? pv / vol : NaN
  })
}

export interface VolumeProfile {
  /** Price at the bottom of row 0. */
  low: number
  /** Height of one row. */
  step: number
  /** Volume per row, bottom up. */
  rows: number[]
  /** Row with the most volume (point of control). */
  poc: number
  /** Rows of the value area (70 % of the volume around the POC), inclusive. */
  vaLow: number
  vaHigh: number
}

// shortcut: a bar's volume is spread evenly over its high–low range (no tick data); real VPVR needs lower-timeframe bars.
/** Volume by price level over the given bars; null when there is no volume. */
export function volumeProfile(c: Candle[], rows: number): VolumeProfile | null {
  let low = Infinity
  let high = -Infinity
  let total = 0
  for (const x of c) {
    low = Math.min(low, x.low)
    high = Math.max(high, x.high)
    if (x.volume > 0) total += x.volume
  }
  if (!(total > 0)) return null
  // All bars at one price: any row height works, everything lands in row 0.
  const step = high > low ? (high - low) / rows : 1
  const row = (p: number) => Math.min(rows - 1, Math.max(0, Math.floor((p - low) / step)))
  const out = new Array<number>(rows).fill(0)
  for (const x of c) {
    if (!(x.volume > 0)) continue
    if (x.high === x.low) {
      out[row(x.high)] += x.volume
      continue
    }
    for (let k = row(x.low); k <= row(x.high); k++) {
      const lo = low + k * step
      out[k] += (x.volume * Math.max(0, Math.min(lo + step, x.high) - Math.max(lo, x.low))) / (x.high - x.low)
    }
  }
  const poc = out.indexOf(Math.max(...out))
  let a = poc
  let z = poc
  let sum = out[poc]
  while (sum < total * 0.7 && (a > 0 || z < rows - 1)) {
    const down = a > 0 ? out[a - 1] : -1
    const up = z < rows - 1 ? out[z + 1] : -1
    sum += up >= down ? out[++z] : out[--a]
  }
  return { low, step, rows: out, poc, vaLow: a, vaHigh: z }
}

/**
 * Index of the bar holding time `t` (the last bar starting at or before it); 'before' left of the loaded bars,
 * 'after' once the last bar (`step` seconds long) has ended, or when there are no bars. A time in a gap between
 * bars (a daily anchor at midnight on an hourly chart) belongs to the next bar, not to yesterday's close.
 * `exact`: `step` is the real bar length; month bars vary in length and skip the gap rule.
 */
export function anchorIndex(times: number[], t: number, step: number, exact = true): number | 'before' | 'after' {
  if (!times.length || t >= times[times.length - 1] + step) return 'after'
  if (t < times[0]) return 'before'
  let lo = 0
  let hi = times.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (times[mid] <= t) lo = mid
    else hi = mid - 1
  }
  return exact && t >= times[lo] + step && lo + 1 < times.length ? lo + 1 : lo
}

/**
 * Whether the last bar is still forming (the squeeze leaves it unjudged): week and month bars run on while the
 * exchange is closed; shorter bars while the market trades and a live tick would still be folded into them
 * (mergeTick, same grid and zone as the live chart), so finished means no tick will change the bar any more.
 */
export function lastBarRunning(p: {
  step: number
  phase: string | null
  extended: boolean
  lastTime: number
  now: number
  /** Exchange zone the live chart lays ticks on (mergeTick). */
  zone?: string
}): boolean {
  if (p.step > 86400 || p.phase === null) return true
  const trading =
    p.phase === 'open' ||
    // A day bar goes on after a lunch break; an intraday bar of the break hour is done.
    (p.step === 86400 ? p.phase === 'break' : p.extended && (p.phase === 'pre' || p.phase === 'post'))
  if (!trading) return false
  const bar = { time: p.lastTime, open: 0, high: 0, low: 0, close: 0, volume: 0 }
  return mergeTick(bar, 0, p.now - QUOTE_DELAY, p.step, 0, p.zone).time === p.lastTime
}

// shortcut: quotes up to 20 minutes late (Yahoo's usual 15) still count for the bar they belong to; a longer delay
// would let the squeeze judge a bar that still takes ticks. Use the latest tick's time instead if that shows up.
const QUOTE_DELAY = 20 * 60
