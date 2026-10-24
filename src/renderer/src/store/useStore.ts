import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isCrypto, type Quote, type StockSource, type Timeframe } from '../../../shared/types'
import { rangeById, type RangeId } from '../lib/ranges'
import { moveSymbolTo } from '../lib/watchlist'
import type { AnalystId, ProviderId } from '../../../shared/agents'
import type { Lang } from '../../../shared/i18n'
import type { FeedStatus } from '../services/marketData'

export type Point = { time: number; price: number }
export type Drawing =
  | { id: string; type: 'trend' | 'fib'; p1: Point; p2: Point }
  | { id: string; type: 'hline'; price: number }
  | { id: string; type: 'vline'; time: number }
  // Tools added later store their clicks as a point list; the older shapes above keep their saved format.
  | {
      id: string
      type: 'ray' | 'rect' | 'channel' | 'elliott' | 'abc' | 'measure' | 'fibext' | 'fibfan' | 'fibtime' | 'triangle' | 'wxy' | 'wxyxz' | 'sine'
      points: Point[]
    }
  | { id: string; type: 'text'; points: Point[]; text: string }
export type Tool = 'cursor' | Drawing['type']
export interface Folder {
  id: string
  name: string
  symbols: string[]
  collapsed: boolean
}

/** What a shown forecast draws; changing it redraws without recomputing. */
export interface ForecastView {
  /** Median as a dashed line, or as candles built from the close, high and low forecasts. */
  style: 'line' | 'candles'
  band50: boolean
  band80: boolean
  band90: boolean
  /** Value box for the forecast step under the mouse. */
  hover: boolean
}

/** How a forecast is computed; changing it recomputes a shown forecast. */
export interface ForecastRun {
  /** Longest forecast in candles; 'auto' allows Chronos-2's full 64 steps where the history allows. */
  horizon: 'auto' | 8 | 16 | 32
  /**
   * Number of earlier forecasts compared with what really happened (accuracy line and the latest one drawn
   * grey over the real bars); 0 switches the backtest off and saves computing it.
   */
  backtestRuns: 0 | 3 | 5 | 10
  /** Stretch or shrink the ranges so that in the backtests 80 % of the real closes lay in the 80 % range. */
  calibrate: boolean
  /** Recompute a shown forecast whenever a new candle begins. */
  autoUpdate: boolean
}

/** Choices for the analysis with TradingAgents; the API keys themselves live encrypted in the main process. */
export interface AgentsConfig {
  provider: ProviderId
  /** Chosen models per provider, so switching providers keeps each one's choice. */
  models: Partial<Record<ProviderId, { deep: string; quick: string }>>
  analysts: AnalystId[]
  debateRounds: number
  ollamaUrl: string
}

/** One chart tab; the active one is mirrored in the store's symbol, timeframe and range. */
export interface ChartTab {
  id: string
  symbol: string
  timeframe: Timeframe
  range: RangeId | null
}
export const MAX_TABS = 3

export interface Indicators {
  sma: { on: boolean; period: number }
  ema: { on: boolean; period: number }
  bb: { on: boolean; period: number; mult: number }
  ema3: { on: boolean; fast: number; mid: number; slow: number }
  vwap: { on: boolean }
  supertrend: { on: boolean; period: number; mult: number }
  rsi: { on: boolean; period: number }
  macd: { on: boolean; fast: number; slow: number; signal: number }
  stoch: { on: boolean; period: number; smoothK: number; smoothD: number }
  atr: { on: boolean; period: number }
}

interface State {
  /** Symbol, timeframe and range of the active tab; the rest of the app only ever reads these. */
  symbol: string
  timeframe: Timeframe
  tabs: ChartTab[]
  activeTab: string
  /** Opens a new tab with the current chart (up to MAX_TABS). */
  addTab: () => void
  closeTab: (id: string) => void
  selectTab: (id: string) => void
  folders: Folder[]
  /** Display names per symbol (automatic or set by the user); missing means "show the ticker". */
  names: Record<string, string>
  finnhubKey: string
  indicators: Indicators
  drawings: Record<string, Drawing[]>
  tool: Tool
  selectedId: string | null
  setSymbol: (symbol: string) => void
  setTimeframe: (tf: Timeframe) => void
  /** Active time-range preset (also picks its candle size); null after a manual timeframe choice. */
  range: RangeId | null
  setRange: (id: RangeId) => void
  /** Intraday stock charts include pre-market and after-hours candles. */
  extendedHours: boolean
  toggleExtendedHours: () => void
  forecastView: ForecastView
  setForecastView: (patch: Partial<ForecastView>) => void
  forecastRun: ForecastRun
  setForecastRun: (patch: Partial<ForecastRun>) => void
  agentsConfig: AgentsConfig
  setAgentsConfig: (patch: Partial<AgentsConfig>) => void
  /** Interface language; English unless chosen otherwise. */
  language: Lang
  setLanguage: (lang: Lang) => void
  /** An empty name removes it, so the automatic name is looked up again. */
  setName: (symbol: string, name: string) => void
  addFolder: (name: string) => string
  renameFolder: (id: string, name: string) => void
  removeFolder: (id: string) => void
  toggleFolder: (id: string) => void
  addToFolder: (id: string, symbol: string) => void
  removeFromFolder: (id: string, symbol: string) => void
  /** Into folder `toId` in front of `before`, or at its end; also reorders within one folder. */
  moveSymbol: (symbol: string, fromId: string, toId: string, before?: string | null) => void
  setFinnhubKey: (key: string) => void
  /** Where stock prices come from; null until chosen in the first-start window (Yahoo is never on by default). */
  stockSource: StockSource | null
  /** With Alpaca: indices, commodities and other exchanges come from Yahoo (confirmed for private use). */
  yahooExtra: boolean
  setStockSource: (source: StockSource, yahooExtra?: boolean) => void
  /** Whether the disclaimer shown on first start has been confirmed. */
  disclaimerAccepted: boolean
  acceptDisclaimer: () => void
  setIndicator: <K extends keyof Indicators>(name: K, patch: Partial<Indicators[K]>) => void
  setTool: (tool: Tool) => void
  select: (id: string | null) => void
  addDrawing: (d: Drawing) => void
  updateDrawing: (d: Drawing) => void
  removeDrawing: (id: string) => void
  clearDrawings: () => void
}

const chartTab = (symbol: string, timeframe: Timeframe, range: RangeId | null): ChartTab => ({
  id: crypto.randomUUID(),
  symbol,
  timeframe,
  range
})
const firstTab = chartTab('BTCUSDT', '1h', null)
/** Applies a chart change to the top-level fields and to the active tab. */
const syncTab = (s: State, patch: Partial<Omit<ChartTab, 'id'>>) => ({
  ...patch,
  tabs: s.tabs.map((t) => (t.id === s.activeTab ? { ...t, ...patch } : t))
})
const showTab = (t: ChartTab) => ({
  activeTab: t.id,
  symbol: t.symbol,
  timeframe: t.timeframe,
  range: t.range,
  selectedId: null,
  tool: 'cursor' as const
})
/** Drawings belong to a tab and its symbol, so two tabs on the same symbol are separate charts. */
export const drawingsKey = (s: { activeTab: string; symbol: string }): string => `${s.activeTab}:${s.symbol}`
const withDrawings = (s: State, list: Drawing[]) => ({ drawings: { ...s.drawings, [drawingsKey(s)]: list } })
const folder = (name: string, symbols: string[]): Folder => ({ id: crypto.randomUUID(), name, symbols, collapsed: false })
const mapFolder = (s: State, id: string, fn: (f: Folder) => Folder) => ({
  folders: s.folders.map((f) => (f.id === id ? fn(f) : f))
})
const withSymbol = (f: Folder, symbol: string): Folder =>
  f.symbols.includes(symbol) ? f : { ...f, symbols: [...f.symbols, symbol] }
const withoutSymbol = (f: Folder, symbol: string): Folder => ({ ...f, symbols: f.symbols.filter((x) => x !== symbol) })

export const useStore = create<State>()(
  persist(
    (set) => ({
      symbol: firstTab.symbol,
      timeframe: firstTab.timeframe,
      tabs: [firstTab],
      activeTab: firstTab.id,
      addTab: () =>
        set((s) => {
          if (s.tabs.length >= MAX_TABS) return {}
          const t = chartTab(s.symbol, s.timeframe, s.range)
          return { tabs: [...s.tabs, t], ...showTab(t) }
        }),
      closeTab: (id) =>
        set((s) => {
          const i = s.tabs.findIndex((t) => t.id === id)
          if (s.tabs.length < 2 || i < 0) return {}
          const tabs = s.tabs.filter((t) => t.id !== id)
          // A closed tab's drawings can never be shown again.
          const drawings = Object.fromEntries(Object.entries(s.drawings).filter(([k]) => !k.startsWith(`${id}:`)))
          // Closing the active tab shows its right neighbour, or the left one at the end.
          return id === s.activeTab
            ? { tabs, drawings, ...showTab(tabs[Math.min(i, tabs.length - 1)]) }
            : { tabs, drawings }
        }),
      selectTab: (id) =>
        set((s) => {
          const t = s.tabs.find((x) => x.id === id)
          return t && id !== s.activeTab ? showTab(t) : {}
        }),
      // Created on first start, when the language is still the default English.
      folders: [folder('Crypto', ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']), folder('Stocks', ['AAPL', 'NVDA', 'MSFT', 'TSLA'])],
      names: {},
      stockSource: null,
      yahooExtra: false,
      setStockSource: (stockSource, yahooExtra = false) =>
        set({ stockSource, yahooExtra: stockSource === 'alpaca' && yahooExtra }),
      disclaimerAccepted: false,
      acceptDisclaimer: () => set({ disclaimerAccepted: true }),
      finnhubKey: window.api.keyGet(),
      indicators: {
        sma: { on: true, period: 20 },
        ema: { on: false, period: 50 },
        bb: { on: false, period: 20, mult: 2 },
        ema3: { on: false, fast: 20, mid: 50, slow: 200 },
        vwap: { on: false },
        supertrend: { on: false, period: 10, mult: 3 },
        rsi: { on: true, period: 14 },
        macd: { on: false, fast: 12, slow: 26, signal: 9 },
        stoch: { on: false, period: 14, smoothK: 3, smoothD: 3 },
        atr: { on: false, period: 14 }
      },
      drawings: {},
      tool: 'cursor',
      selectedId: null,
      setSymbol: (symbol) => set((s) => ({ ...syncTab(s, { symbol }), selectedId: null, tool: 'cursor' })),
      setTimeframe: (timeframe) => set((s) => syncTab(s, { timeframe, range: null })),
      range: null,
      setRange: (range) => set((s) => syncTab(s, { range, timeframe: rangeById(range).tf })),
      extendedHours: false,
      toggleExtendedHours: () => set((s) => ({ extendedHours: !s.extendedHours })),
      forecastView: { style: 'line', band50: true, band80: true, band90: true, hover: true },
      setForecastView: (patch) => set((s) => ({ forecastView: { ...s.forecastView, ...patch } })),
      forecastRun: { horizon: 'auto', backtestRuns: 3, calibrate: false, autoUpdate: false },
      setForecastRun: (patch) => set((s) => ({ forecastRun: { ...s.forecastRun, ...patch } })),
      agentsConfig: {
        provider: 'anthropic',
        models: {},
        analysts: ['market', 'social', 'news', 'fundamentals'],
        debateRounds: 1,
        ollamaUrl: 'http://localhost:11434'
      },
      setAgentsConfig: (patch) => set((s) => ({ agentsConfig: { ...s.agentsConfig, ...patch } })),
      language: 'en',
      setLanguage: (language) => set({ language }),
      setName: (symbol, name) =>
        set((s) => {
          const { [symbol]: _, ...rest } = s.names
          return { names: name ? { ...rest, [symbol]: name } : rest }
        }),
      addFolder: (name) => {
        const f = folder(name, [])
        set((s) => ({ folders: [...s.folders, f] }))
        return f.id
      },
      renameFolder: (id, name) => set((s) => mapFolder(s, id, (f) => ({ ...f, name }))),
      removeFolder: (id) => set((s) => ({ folders: s.folders.filter((f) => f.id !== id) })),
      toggleFolder: (id) => set((s) => mapFolder(s, id, (f) => ({ ...f, collapsed: !f.collapsed }))),
      addToFolder: (id, symbol) => set((s) => mapFolder(s, id, (f) => withSymbol({ ...f, collapsed: false }, symbol))),
      removeFromFolder: (id, symbol) => set((s) => mapFolder(s, id, (f) => withoutSymbol(f, symbol))),
      moveSymbol: (symbol, fromId, toId, before) =>
        set((s) => ({ folders: moveSymbolTo(s.folders, symbol, fromId, toId, before) })),
      setFinnhubKey: (finnhubKey) => {
        set({ finnhubKey })
        void window.api.keySet(finnhubKey)
      },
      setIndicator: (name, patch) =>
        set((s) => ({ indicators: { ...s.indicators, [name]: { ...s.indicators[name], ...patch } } })),
      setTool: (tool) => set({ tool, selectedId: null }),
      select: (selectedId) => set({ selectedId }),
      addDrawing: (d) => set((s) => withDrawings(s, [...(s.drawings[drawingsKey(s)] ?? []), d])),
      updateDrawing: (d) =>
        set((s) => withDrawings(s, (s.drawings[drawingsKey(s)] ?? []).map((x) => (x.id === d.id ? d : x)))),
      removeDrawing: (id) =>
        set((s) => ({
          ...withDrawings(s, (s.drawings[drawingsKey(s)] ?? []).filter((d) => d.id !== id)),
          selectedId: null
        })),
      clearDrawings: () => set((s) => ({ ...withDrawings(s, []), selectedId: null }))
    }),
    {
      name: 'kandleos',
      version: 4,
      // v1 had a flat watchlist; keep the user's symbols by splitting them into two folders.
      migrate: (persisted, version) => {
        const p = persisted as Record<string, unknown>
        if (version < 2 && Array.isArray(p.watchlist)) {
          const list = p.watchlist as string[]
          p.folders = [folder('Krypto', list.filter(isCrypto)), folder('Aktien', list.filter((s) => !isCrypto(s)))]
          delete p.watchlist
        }
        // v2 kept the API key in this file; move it to the encrypted key file. It stays in the
        // returned state for this session, and partialize leaves it out of every future write.
        if (version < 3) {
          if (typeof p.finnhubKey === 'string' && p.finnhubKey) void window.api.keySet(p.finnhubKey)
          // An empty legacy key must not blank out one already in the key file.
          else delete p.finnhubKey
        }
        // v3 kept drawings per symbol, shared by all tabs; every existing tab gets its own copy.
        if (version < 4 && p.drawings) {
          if (!Array.isArray(p.tabs) || !p.tabs.length) {
            const { symbol = firstTab.symbol, timeframe = firstTab.timeframe, range = null } = p as Partial<State>
            p.tabs = [{ ...firstTab, symbol, timeframe, range }]
            p.activeTab = firstTab.id
          }
          const old = p.drawings as Record<string, Drawing[]>
          p.drawings = Object.fromEntries(
            (p.tabs as ChartTab[]).flatMap((t) => Object.entries(old).map(([sym, list]) => [`${t.id}:${sym}`, list]))
          )
        }
        return p as unknown as State
      },
      // Synchronous read lets the store hydrate before the first render (no flash of defaults).
      // Indicators added in later versions are missing from older files; fill them with their defaults.
      merge: (persisted, current) => {
        const p = persisted as Partial<State>
        const { backtest, ...view } = (p.forecastView ?? {}) as Partial<ForecastView> & { backtest?: boolean }
        const s = {
          ...current,
          ...p,
          indicators: { ...current.indicators, ...p.indicators },
          forecastView: { ...current.forecastView, ...view },
          // The backtest used to be a display switch of its own; switched off, it now means depth 0.
          forecastRun: { ...current.forecastRun, ...(backtest === false && { backtestRuns: 0 as const }), ...p.forecastRun },
          agentsConfig: { ...current.agentsConfig, ...p.agentsConfig }
        }
        // Files from before tabs hold a single chart; it becomes the first tab.
        const tabs = p.tabs?.length
          ? p.tabs.slice(0, MAX_TABS)
          : [{ ...firstTab, symbol: s.symbol, timeframe: s.timeframe, range: s.range }]
        return { ...s, tabs, ...showTab(tabs.find((t) => t.id === p.activeTab) ?? tabs[0]) }
      },
      storage: createJSONStorage(() => ({
        getItem: () => window.api.storeGet(),
        setItem: (_name, value) => void window.api.storeSet(value),
        removeItem: () => {}
      })),
      partialize: ({
        symbol,
        timeframe,
        tabs,
        activeTab,
        range,
        extendedHours,
        forecastView,
        forecastRun,
        agentsConfig,
        language,
        folders,
        names,
        indicators,
        drawings,
        stockSource,
        yahooExtra,
        disclaimerAccepted
      }) => ({
        stockSource,
        yahooExtra,
        language,
        agentsConfig,
        range,
        extendedHours,
        forecastView,
        forecastRun,
        disclaimerAccepted,
        names,
        symbol,
        timeframe,
        tabs,
        activeTab,
        folders,
        indicators,
        drawings
      })
    }
  )
)

/** Live quotes change several times per second, so they live outside the persisted store. */
export const useQuotes = create<{ quotes: Record<string, Quote>; feed: FeedStatus }>(() => ({
  quotes: {},
  feed: { state: 'off' }
}))
export const setFeedStatus = (feed: FeedStatus): void => useQuotes.setState({ feed })
// Finnhub ticks name no exchange; keep the time zone an earlier Yahoo quote reported.
export const setQuote = (symbol: string, q: Quote): void =>
  useQuotes.setState((s) => ({
    quotes: { ...s.quotes, [symbol]: { ...q, timezone: q.timezone ?? s.quotes[symbol]?.timezone } }
  }))
