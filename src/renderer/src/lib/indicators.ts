// All functions return arrays aligned with the input; warm-up slots are NaN.
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
