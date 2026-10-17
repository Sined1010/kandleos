import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isCrypto, type Quote, type Timeframe } from '../../../shared/types'
import type { FeedStatus } from '../services/marketData'

export type Point = { time: number; price: number }
export type Drawing =
  | { id: string; type: 'trend' | 'fib'; p1: Point; p2: Point }
  | { id: string; type: 'hline'; price: number }
export type Tool = 'cursor' | 'trend' | 'hline' | 'fib'
export interface Folder {
  id: string
  name: string
  symbols: string[]
  collapsed: boolean
}

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
  folders: Folder[]
  finnhubKey: string
  indicators: Indicators
  drawings: Record<string, Drawing[]>
  tool: Tool
  selectedId: string | null
  setSymbol: (symbol: string) => void
  setTimeframe: (tf: Timeframe) => void
  addFolder: (name: string) => string
  renameFolder: (id: string, name: string) => void
  removeFolder: (id: string) => void
  toggleFolder: (id: string) => void
  addToFolder: (id: string, symbol: string) => void
  removeFromFolder: (id: string, symbol: string) => void
  moveSymbol: (symbol: string, fromId: string, toId: string) => void
  setFinnhubKey: (key: string) => void
  setIndicator: <K extends keyof Indicators>(name: K, patch: Partial<Indicators[K]>) => void
  setTool: (tool: Tool) => void
  select: (id: string | null) => void
  addDrawing: (d: Drawing) => void
  updateDrawing: (d: Drawing) => void
  removeDrawing: (id: string) => void
  clearDrawings: () => void
}

const withDrawings = (s: State, list: Drawing[]) => ({ drawings: { ...s.drawings, [s.symbol]: list } })
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
      symbol: 'BTCUSDT',
      timeframe: '1h',
      folders: [folder('Krypto', ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']), folder('Aktien', ['AAPL', 'NVDA', 'MSFT', 'TSLA'])],
      finnhubKey: window.api.keyGet(),
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
      moveSymbol: (symbol, fromId, toId) =>
        set((s) =>
          fromId === toId
            ? s
            : {
                folders: s.folders.map((f) =>
                  f.id === fromId ? withoutSymbol(f, symbol) : f.id === toId ? withSymbol(f, symbol) : f
                )
              }
        ),
      setFinnhubKey: (finnhubKey) => {
        set({ finnhubKey })
        void window.api.keySet(finnhubKey)
      },
      setIndicator: (name, patch) =>
        set((s) => ({ indicators: { ...s.indicators, [name]: { ...s.indicators[name], ...patch } } })),
      setTool: (tool) => set({ tool, selectedId: null }),
      select: (selectedId) => set({ selectedId }),
      addDrawing: (d) => set((s) => withDrawings(s, [...(s.drawings[s.symbol] ?? []), d])),
      updateDrawing: (d) =>
        set((s) => withDrawings(s, (s.drawings[s.symbol] ?? []).map((x) => (x.id === d.id ? d : x)))),
      removeDrawing: (id) =>
        set((s) => ({ ...withDrawings(s, (s.drawings[s.symbol] ?? []).filter((d) => d.id !== id)), selectedId: null })),
      clearDrawings: () => set((s) => ({ ...withDrawings(s, []), selectedId: null }))
    }),
    {
      name: 'kandleos',
      version: 3,
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
        return p as unknown as State
      },
      // Synchronous read lets the store hydrate before the first render (no flash of defaults).
      storage: createJSONStorage(() => ({
        getItem: () => window.api.storeGet(),
        setItem: (_name, value) => void window.api.storeSet(value),
        removeItem: () => {}
      })),
      partialize: ({ symbol, timeframe, folders, indicators, drawings }) => ({
        symbol,
        timeframe,
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
export const setQuote = (symbol: string, q: Quote): void =>
  useQuotes.setState((s) => ({ quotes: { ...s.quotes, [symbol]: q } }))
