import { contextBridge, ipcRenderer } from 'electron'
import type { Candle, Quote, Timeframe } from '../shared/types'

const api = {
  storeGet: (): string | null => ipcRenderer.sendSync('store:get'),
  storeSet: (data: string): Promise<void> => ipcRenderer.invoke('store:set', data),
  stockCandles: (symbol: string, tf: Timeframe, key: string): Promise<Candle[]> =>
    ipcRenderer.invoke('stocks:candles', symbol, tf, key),
  stockQuotes: (symbols: string[], key: string): Promise<Record<string, Quote>> =>
    ipcRenderer.invoke('stocks:quotes', symbols, key)
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
