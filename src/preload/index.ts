import { contextBridge, ipcRenderer } from 'electron'
import type { AgentsEvent, AgentsRequest, AgentsStatus, SavedAnalysis, SetupProgress } from '../main/agents'
import type { CandleData, CompanyInfo, Quote, SearchResult, Timeframe } from '../shared/types'

/** Subscribes to a main-process event channel; returns the unsubscribe function. */
function listen<T>(channel: string, cb: (value: T) => void): () => void {
  const handler = (_e: unknown, value: T) => cb(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  storeGet: (): string | null => ipcRenderer.sendSync('store:get'),
  /** Language for texts the main process produces (error messages, names). */
  setLanguage: (lang: string): void => ipcRenderer.send('app:language', lang),
  /**
   * Where stock prices come from (StockSource); main routes candles, quotes, search and names by it.
   * `yahooExtra`: with Alpaca, what Alpaca does not have comes from Yahoo.
   */
  setStockSource: (source: string, yahooExtra = false): void => ipcRenderer.send('app:stock-source', source, yahooExtra),
  alpacaHasKeys: (): Promise<boolean> => ipcRenderer.invoke('alpaca:has-keys'),
  /** Checks the key pair with Alpaca and stores it encrypted; resolves to an error message or null. Empty removes it. */
  alpacaSetKeys: (id: string, secret: string): Promise<string | null> => ipcRenderer.invoke('alpaca:set-keys', id, secret),
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
  /** Profile of a stock for the info button: Finnhub with a key, otherwise Yahoo if switched on. */
  companyInfo: (symbol: string, key: string): Promise<CompanyInfo> => ipcRenderer.invoke('stocks:info', symbol, key),
  /** Opens the third-party license file; resolves to an error message, or '' on success. */
  openLicenses: (): Promise<string> => ipcRenderer.invoke('app:licenses'),
  /**
   * Chronos-2 forecast per price series: the 21 quantiles (shared/forecast.ts) for each of the next 64 bars.
   * Series sharing a group id are forecast together; without `groups` each stands alone.
   */
  forecast: (series: number[][], groups?: number[]): Promise<number[][][]> =>
    ipcRenderer.invoke('forecast:run', series, groups),
  /** Model download progress in percent; returns an unsubscribe function. */
  onForecastProgress: (cb: (pct: number) => void): (() => void) => listen('forecast:progress', cb),
  /** Comprehensive analysis with TradingAgents: setup, keys (stored encrypted, only their presence comes back), runs. */
  agents: {
    status: (): Promise<AgentsStatus> => ipcRenderer.invoke('agents:status'),
    install: (): Promise<AgentsStatus> => ipcRenderer.invoke('agents:install'),
    remove: (): Promise<AgentsStatus> => ipcRenderer.invoke('agents:remove'),
    onSetup: (cb: (p: SetupProgress) => void): (() => void) => listen('agents:setup', cb),
    keys: (): Promise<Record<string, boolean>> => ipcRenderer.invoke('agents:keys'),
    setKey: (name: string, value: string): Promise<Record<string, boolean>> =>
      ipcRenderer.invoke('agents:key-set', name, value),
    run: (req: AgentsRequest): Promise<SavedAnalysis> => ipcRenderer.invoke('agents:run', req),
    onEvent: (cb: (e: AgentsEvent) => void): (() => void) => listen('agents:event', cb),
    cancel: (): Promise<void> => ipcRenderer.invoke('agents:cancel'),
    results: (symbol: string): Promise<SavedAnalysis[]> => ipcRenderer.invoke('agents:results', symbol),
    ollamaModels: (url: string): Promise<string[] | null> => ipcRenderer.invoke('agents:ollama-models', url)
  }
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
