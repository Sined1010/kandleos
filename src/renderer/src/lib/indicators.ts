// All functions return arrays aligned with the input; warm-up slots are NaN.

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
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
