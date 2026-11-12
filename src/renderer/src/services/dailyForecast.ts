// The daily Chronos-2 forecast for a TradingAgents analysis: whatever candle size the chart shows, the agents work
// with daily closes and horizons of weeks to months, so the forecast they are compared with is daily too.
import { summaryKey, type SummaryRow } from '../../../shared/archive'
import { futureTimes } from '../../../shared/calendar'
import { chronosBlock, chronosOrSkip, type ChronosSkip, type ChronosSnapshot } from '../../../shared/chronosLink'
import { backtest, bandScale, checkCutoffs, historyNeeded, scaleBands } from '../../../shared/forecast'
import { HISTORY_LIMIT, prependOlder } from '../../../shared/history'
import { FORECAST_MIN_BARS, forecastSteps, TF_SECONDS, type Candle } from '../../../shared/types'
import type { ForecastResult } from '../components/ForecastInfo'
import { archiveForecast } from './archive'
import { loadCandles } from './marketData'

// The check behind the block always runs in full: its track record is what tells the agent how to weigh it.
const RUNS = 30
// The model reads at most this much history; longer prefixes would only be cut in main.
const CONTEXT = 2048

/** Daily forecast with backtest and archive record, ready for the market analyst; a reason when not possible. */
export async function dailyForecast(
  symbol: string,
  opts: { finnhubKey: string; calibrate: boolean; onStage?: (s: 'candles' | 'model') => void }
): Promise<ChronosSnapshot | ChronosSkip> {
  opts.onStage?.('candles')
  let first
  try {
    first = await loadCandles(symbol, '1D', opts.finnhubKey, false)
  } catch {
    return { skipped: 'load' }
  }
  // A stored copy (source failed) is no base for an analysis or an archive record.
  if (first.stale) return { skipped: 'load' }
  let bars: Candle[] = first.candles
  if (bars.length < FORECAST_MIN_BARS) return { skipped: 'history' }
  while (bars.length < historyNeeded(forecastSteps('1D', bars.length, 64), RUNS) && bars.length < HISTORY_LIMIT) {
    try {
      const older = await loadCandles(symbol, '1D', opts.finnhubKey, false, { before: bars[0].time, provider: first.provider })
      const merged = prependOlder(bars, older.candles)
      if (merged.length <= bars.length) break
      bars = merged
    } catch {
      // Older sections are a bonus: go on with what is there.
      break
    }
  }
  const n = forecastSteps('1D', bars.length, 64)
  const closes = bars.map((c) => c.close)
  const last = bars[bars.length - 1]
  opts.onStage?.('model')
  try {
    const cutoffs = checkCutoffs(bars.length, n, RUNS)
    const [live, ...past] = await window.api.forecast(
      [closes.slice(-CONTEXT), ...cutoffs.map((c) => closes.slice(Math.max(0, c - CONTEXT), c))],
      [0, ...cutoffs.map((_, k) => k + 1)]
    )
    const check = cutoffs.length ? backtest(closes, cutoffs, past, n) : null
    const factor = opts.calibrate && cutoffs.length ? bandScale(closes, cutoffs, past, n) : null
    const raw = live.slice(0, n)
    const steps = factor === null ? raw : scaleBands(raw, factor)
    const result: ForecastResult = {
      times: futureTimes(bars.map((c) => c.time), TF_SECONDS['1D'], n, first.timezone),
      steps,
      raw,
      upperWicks: [],
      lowerWicks: [],
      base: last.close,
      baseTime: last.time,
      check,
      bandScale: factor,
      backtestPath: null
    }
    archiveForecast(result, { symbol, timeframe: '1D', provider: first.provider, extended: false, timeZone: first.timezone, auto: false })
    const key = summaryKey({ symbol, timeframe: '1D', steps: raw })
    const row = (await window.api.archive.summary(key).catch((): Record<string, SummaryRow> => ({})))[key]
    const snapshot: Omit<ChronosSnapshot, 'block' | 'appVersion'> = {
      pair: symbol,
      asOf: last.time,
      base: last.close,
      steps: n,
      end: steps[n - 1],
      factor,
      check: check && {
        runs: check.runs,
        inside80: check.inside80,
        skill: check.naiveError > 0 ? 1 - check.error / check.naiveError : 0,
        chance: check.chance
      },
      record: row ? { settled: row.settled, independent: row.independent, inside80: row.sum.shown.in80 / row.settled } : null
    }
    // Main checks it the same way; an unusable one runs the analysis without Chronos instead of failing it.
    return chronosOrSkip({ ...snapshot, block: chronosBlock(snapshot), appVersion: __APP_VERSION__ })
  } catch {
    return { skipped: 'model' }
  }
}
