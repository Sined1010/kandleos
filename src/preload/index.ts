import { contextBridge, ipcRenderer } from 'electron'
import type { CandleData, Quote, SearchResult, Timeframe } from '../shared/types'

const api = {
  storeGet: (): string | null => ipcRenderer.sendSync('store:get'),
  storeSet: (data: string): Promise<void> => ipcRenderer.invoke('store:set', data),
  keyGet: (): string => ipcRenderer.sendSync('key:get'),
  keySet: (key: string): Promise<void> => ipcRenderer.invoke('key:set', key),
  /** `extended`: intraday candles include pre-market and after-hours trading (Yahoo only). */
  stockCandles: (symbol: string, tf: Timeframe, key: string, extended = false): Promise<CandleData> =>
    ipcRenderer.invoke('stocks:candles', symbol, tf, key, extended),
  stockQuotes: (symbols: string[], key: string): Promise<Record<string, Quote>> =>
    ipcRenderer.invoke('stocks:quotes', symbols, key),
  searchSymbols: (query: string): Promise<SearchResult[]> => ipcRenderer.invoke('symbols:search', query),
  finnhubCheck: (key: string): Promise<string | null> => ipcRenderer.invoke('finnhub:check', key),
  symbolName: (symbol: string): Promise<string | null> => ipcRenderer.invoke('symbols:name', symbol),
  /** Opens the third-party license file; resolves to an error message, or '' on success. */
  openLicenses: (): Promise<string> => ipcRenderer.invoke('app:licenses'),
  /**
   * Chronos-2 forecast per price series: the 21 quantiles (shared/forecast.ts) for each of the next 64 bars.
   * Series sharing a group id are forecast together; without `groups` each stands alone.
   */
  forecast: (series: number[][], groups?: number[]): Promise<number[][][]> =>
    ipcRenderer.invoke('forecast:run', series, groups),
  /** Model download progress in percent; returns an unsubscribe function. */
  onForecastProgress: (cb: (pct: number) => void): (() => void) => {
    const handler = (_e: unknown, pct: number) => cb(pct)
    ipcRenderer.on('forecast:progress', handler)
    return () => ipcRenderer.removeListener('forecast:progress', handler)
  }
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
