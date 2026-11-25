import type { Indicators } from '../store/useStore'

/** Indicator settings of a fresh install; files from before an indicator existed get its entry from here (merge). */
export const DEFAULT_INDICATORS: Indicators = {
  sma: { on: true, period: 20 },
  ema: { on: false, period: 50 },
  bb: { on: false, period: 20, mult: 2 },
  squeeze: { on: false, period: 20, mult: 2, kcMult: 1.5 },
  ema3: { on: false, fast: 20, mid: 50, slow: 200 },
  vwap: { on: false },
  vp: { on: false, rows: 30 },
  supertrend: { on: false, period: 10, mult: 3 },
  rsi: { on: true, period: 14 },
  macd: { on: false, fast: 12, slow: 26, signal: 9 },
  stoch: { on: false, period: 14, smoothK: 3, smoothD: 3 },
  atr: { on: false, period: 14 },
  adx: { on: false, period: 14 },
  patterns: { on: false }
}
