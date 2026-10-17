import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Quote, Timeframe } from '../../../shared/types'

export type Point = { time: number; price: number }
export type Drawing =
  | { id: string; type: 'trend' | 'fib'; p1: Point; p2: Point }
  | { id: string; type: 'hline'; price: number }
export type Tool = 'cursor' | 'trend' | 'hline' | 'fib'

export interface Indicators {
  sma: { on: boolean; period: number }
  ema: { on: boolean; period: number }
  bb: { on: boolean; period: number; mult: number }
  rsi: { on: boolean; period: number }
  macd: { on: boolean; fast: number; slow: number; signal: number }
}

interface State {
  symbol: string
  timeframe: Timeframe
  watchlist: string[]
  finnhubKey: string
  indicators: Indicators
  drawings: Record<string, Drawing[]>
  tool: Tool
  selectedId: string | null
  setSymbol: (symbol: string) => void
  setTimeframe: (tf: Timeframe) => void
  addToWatchlist: (symbol: string) => void
  removeFromWatchlist: (symbol: string) => void
  setFinnhubKey: (key: string) => void
  setIndicator: <K extends keyof Indicators>(name: K, patch: Partial<Indicators[K]>) => void
  setTool: (tool: Tool) => void
  select: (id: string | null) => void
  addDrawing: (d: Drawing) => void
  removeDrawing: (id: string) => void
  clearDrawings: () => void
}

const withDrawings = (s: State, list: Drawing[]) => ({ drawings: { ...s.drawings, [s.symbol]: list } })

export const useStore = create<State>()(
  persist(
    (set) => ({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      watchlist: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'AAPL', 'NVDA', 'MSFT', 'TSLA'],
      finnhubKey: '',
      indicators: {
        sma: { on: true, period: 20 },
        ema: { on: false, period: 50 },
        bb: { on: false, period: 20, mult: 2 },
        rsi: { on: true, period: 14 },
        macd: { on: false, fast: 12, slow: 26, signal: 9 }
      },
      drawings: {},
      tool: 'cursor',
      selectedId: null,
      setSymbol: (symbol) => set({ symbol, selectedId: null, tool: 'cursor' }),
      setTimeframe: (timeframe) => set({ timeframe }),
      addToWatchlist: (symbol) =>
        set((s) => (s.watchlist.includes(symbol) ? s : { watchlist: [...s.watchlist, symbol] })),
      removeFromWatchlist: (symbol) => set((s) => ({ watchlist: s.watchlist.filter((x) => x !== symbol) })),
      setFinnhubKey: (finnhubKey) => set({ finnhubKey }),
      setIndicator: (name, patch) =>
        set((s) => ({ indicators: { ...s.indicators, [name]: { ...s.indicators[name], ...patch } } })),
      setTool: (tool) => set({ tool, selectedId: null }),
      select: (selectedId) => set({ selectedId }),
      addDrawing: (d) => set((s) => withDrawings(s, [...(s.drawings[s.symbol] ?? []), d])),
      removeDrawing: (id) =>
        set((s) => ({ ...withDrawings(s, (s.drawings[s.symbol] ?? []).filter((d) => d.id !== id)), selectedId: null })),
      clearDrawings: () => set((s) => ({ ...withDrawings(s, []), selectedId: null }))
    }),
    {
      name: 'kandleos',
      version: 1,
      // Synchronous read lets the store hydrate before the first render (no flash of defaults).
      storage: createJSONStorage(() => ({
        getItem: () => window.api.storeGet(),
        setItem: (_name, value) => void window.api.storeSet(value),
        removeItem: () => {}
      })),
      partialize: ({ symbol, timeframe, watchlist, finnhubKey, indicators, drawings }) => ({
        symbol,
        timeframe,
        watchlist,
        finnhubKey,
        indicators,
        drawings
      })
    }
  )
)

/** Live quotes change several times per second, so they live outside the persisted store. */
export const useQuotes = create<{ quotes: Record<string, Quote> }>(() => ({ quotes: {} }))
export const setQuote = (symbol: string, q: Quote): void =>
  useQuotes.setState((s) => ({ quotes: { ...s.quotes, [symbol]: q } }))
