import { contextBridge, ipcRenderer } from 'electron'
import type { CandleData, Quote, SearchResult, Timeframe } from '../shared/types'

const api = {
  storeGet: (): string | null => ipcRenderer.sendSync('store:get'),
  storeSet: (data: string): Promise<void> => ipcRenderer.invoke('store:set', data),
  keyGet: (): string => ipcRenderer.sendSync('key:get'),
  keySet: (key: string): Promise<void> => ipcRenderer.invoke('key:set', key),
  stockCandles: (symbol: string, tf: Timeframe, key: string): Promise<CandleData> =>
    ipcRenderer.invoke('stocks:candles', symbol, tf, key),
  stockQuotes: (symbols: string[], key: string): Promise<Record<string, Quote>> =>
    ipcRenderer.invoke('stocks:quotes', symbols, key),
  searchSymbols: (query: string): Promise<SearchResult[]> => ipcRenderer.invoke('symbols:search', query)
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
