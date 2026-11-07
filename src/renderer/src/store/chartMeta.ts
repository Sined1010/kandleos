import { create } from 'zustand'

type ChartMeta = { symbol: string; currency: string; timeZone?: string }

/** Currency and exchange time zone of the chart's loaded candles: ChartArea sets them, the chart and the phone's header read them (not persisted). */
export const useChartMeta = create<ChartMeta>(() => ({ symbol: '', currency: '' }))

/** The values for `symbol`, or none while they still belong to the previous symbol (until its candles load). */
export const metaFor = (meta: ChartMeta, symbol: string): { currency: string; timeZone?: string } =>
  meta.symbol === symbol ? { currency: meta.currency, timeZone: meta.timeZone } : { currency: '', timeZone: undefined }
