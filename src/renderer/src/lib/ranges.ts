import type { Timeframe } from '../../../shared/types'

/**
 * Time-range presets like on TradingView: each shows a span of history with a candle size that fits it,
 * and stays within what the data sources deliver (Binance: 1000 bars, Yahoo: per-interval ranges).
 */
export const RANGES = [
  { id: '1T', title: '1 Tag', tf: '5m', days: 1 },
  { id: '5T', title: '5 Tage', tf: '15m', days: 5 },
  { id: '1M', title: '1 Monat', tf: '1h', days: 30 },
  { id: '3M', title: '3 Monate', tf: '4h', days: 91 },
  { id: '6M', title: '6 Monate', tf: '1D', days: 182 },
  { id: 'YTD', title: 'Seit Jahresbeginn', tf: '1D', days: 'ytd' },
  { id: '1J', title: '12 Monate', tf: '1D', days: 365 },
  { id: '5J', title: '5 Jahre', tf: '1W', days: 1826 },
  { id: 'Max', title: 'Gesamte Historie', tf: '1M', days: 'max' }
] as const satisfies readonly { id: string; title: string; tf: Timeframe; days: number | 'ytd' | 'max' }[]

export type RangeId = (typeof RANGES)[number]['id']
export const rangeById = (id: RangeId) => RANGES.find((r) => r.id === id)!

/** Index of the first bar inside the preset's span, counted back from the last bar. */
export function rangeStartIndex(times: number[], id: RangeId): number {
  const { days } = rangeById(id)
  if (days === 'max' || !times.length) return 0
  const last = times[times.length - 1]
  const start = days === 'ytd' ? Date.UTC(new Date(last * 1000).getUTCFullYear(), 0, 1) / 1000 : last - days * 86400
  const i = times.findIndex((t) => t >= start)
  return i < 0 ? 0 : i
}
