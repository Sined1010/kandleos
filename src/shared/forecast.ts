// Reading Chronos-2 output: each forecast step holds 21 quantiles of the predicted close.
import { FORECAST_MIN_BARS } from './types.ts'

/** Quantile level of each of the 21 values per step. */
export const QUANTILES = [
  0.01, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.99
]
/** Index of a level in a step's values. */
export const Q = { p05: 1, p10: 2, p25: 5, median: 10, p75: 15, p90: 18, p95: 19 } as const

/**
 * Probability that the close ends above `price`, read off the quantiles (linear between levels).
 * Beyond the outermost quantiles the model says nothing finer, so the result stays within 1-99 %.
 */
export function probabilityAbove(step: number[], price: number): number {
  // The model can output slightly crossing quantiles; sorted they form a valid distribution.
  const q = [...step].sort((a, b) => a - b)
  const last = q.length - 1
  if (price <= q[0]) return 1 - QUANTILES[0]
  if (price >= q[last]) return 1 - QUANTILES[last]
  let i = 0
  while (price > q[i + 1]) i++
  const share = q[i + 1] > q[i] ? (price - q[i]) / (q[i + 1] - q[i]) : 0
  return 1 - (QUANTILES[i] + share * (QUANTILES[i + 1] - QUANTILES[i]))
}

/**
 * Where backtests start: forecasts made `steps`, 2×`steps`, ... bars before the end, so each one can be
 * compared with the bars that really followed. Only cutoffs with enough history for the model count.
 */
export function backtestCutoffs(bars: number, steps: number, max = 3): number[] {
  const out: number[] = []
  for (let k = 1; k <= max && bars - k * steps >= FORECAST_MIN_BARS; k++) out.push(bars - k * steps)
  return out
}

export interface BacktestResult {
  runs: number
  steps: number
  /** Mean absolute deviation of the median from the real closes, as a share of the close. */
  error: number
  /** Share of real closes inside the 80 % and 50 % ranges (ideally about 0.8 and 0.5). */
  inside80: number
  inside50: number
  /** Runs whose median got the direction from the cutoff to the end of the horizon right. */
  direction: number
}

/** Compares backtest forecasts (one per cutoff, as from backtestCutoffs) with the closes that followed. */
export function backtest(closes: number[], cutoffs: number[], forecasts: number[][][], steps: number): BacktestResult {
  let error = 0
  let in80 = 0
  let in50 = 0
  let direction = 0
  let n = 0
  cutoffs.forEach((c, r) => {
    const f = forecasts[r]
    for (let i = 0; i < steps; i++) {
      const real = closes[c + i]
      const q = f[i]
      error += Math.abs(q[Q.median] - real) / real
      if (real >= q[Q.p10] && real <= q[Q.p90]) in80++
      if (real >= q[Q.p25] && real <= q[Q.p75]) in50++
      n++
    }
    const base = closes[c - 1]
    if (Math.sign(f[steps - 1][Q.median] - base) === Math.sign(closes[c + steps - 1] - base)) direction++
  })
  return { runs: cutoffs.length, steps, error: error / n, inside80: in80 / n, inside50: in50 / n, direction }
}

/**
 * Conformal calibration of the ranges: the factor by which every quantile's distance from the median must be
 * stretched (above 1) or shrunk (below 1) so that `level` of the real closes in the backtests lay inside the
 * 80 % range. Distances are relative (log prices), as prices move in percent and never go below zero.
 * 1 when there is nothing to compare. Steps of one backtest are correlated, so this is a sound correction
 * but not an exact guarantee.
 */
export function bandScale(closes: number[], cutoffs: number[], forecasts: number[][][], steps: number, level = 0.8): number {
  const scores: number[] = []
  cutoffs.forEach((c, r) => {
    for (let i = 0; i < steps; i++) {
      const q = forecasts[r][i]
      const real = closes[c + i]
      const med = q[Q.median]
      const edge = real < med ? q[Q.p10] : q[Q.p90]
      if (!(real > 0 && med > 0 && edge > 0)) continue
      const half = Math.abs(Math.log(edge / med))
      if (half > 0) scores.push(Math.abs(Math.log(real / med)) / half)
    }
  })
  if (!scores.length) return 1
  scores.sort((a, b) => a - b)
  // Finite-sample conformal quantile: the ceil((n + 1) · level)-th smallest score.
  return scores[Math.min(scores.length, Math.ceil((scores.length + 1) * level)) - 1]
}

/** Quantiles stretched around each step's median by `factor` in log prices; the median itself stays. */
export const scaleBands = (steps: number[][], factor: number): number[][] =>
  steps.map((q) => {
    const med = q[Q.median]
    return q.map((v) => (v > 0 && med > 0 ? med * (v / med) ** factor : med + factor * (v - med)))
  })

export interface ForecastCandle {
  open: number
  high: number
  low: number
  close: number
}

/**
 * One candle per forecast step: it opens at the previous step's median close (the first at the last real
 * close), closes at this step's median and gets the forecast median wick lengths above and below its body.
 * Wick lengths rather than high and low prices: forecast as price paths of their own, the median high can
 * drift below the median close a few steps out, while wick lengths stay stable and never negative.
 */
export function forecastCandles(base: number, closes: number[], upper: number[], lower: number[]): ForecastCandle[] {
  return closes.map((close, i) => {
    const open = i ? closes[i - 1] : base
    return {
      open,
      close,
      high: Math.max(open, close) + Math.max(0, upper[i]),
      low: Math.min(open, close) - Math.max(0, lower[i])
    }
  })
}
