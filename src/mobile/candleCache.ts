import type { CandleData, Timeframe } from '../shared/types'
import type { Files } from './storeFile'

// The last charts' candles on the phone, so a chart shows at once (and without network) before fresh
// prices arrive. Everything stays in memory too: get() is synchronous for the first paint.
const MAX_CHARTS = 20
const MAX_BARS = 2000
const INDEX = 'candles/index.json'

const keyOf = (symbol: string, tf: Timeframe) => `${symbol}_${tf}`
const fileOf = (key: string) => `candles/${key.replace(/[^A-Za-z0-9_.^=-]/g, '_')}.json`

export function createCandleCache(f: Files) {
  let order: string[] = [] // oldest first
  const mem = new Map<string, CandleData>()

  return {
    async load(): Promise<void> {
      try {
        order = JSON.parse((await f.read(INDEX)) ?? '[]')
      } catch {
        order = []
      }
      for (const key of order) {
        try {
          const s = await f.read(fileOf(key))
          if (s) mem.set(key, JSON.parse(s))
        } catch {
          // a damaged entry is simply not cached
        }
      }
      order = order.filter((k) => mem.has(k))
    },
    async put(symbol: string, tf: Timeframe, c: CandleData): Promise<void> {
      const key = keyOf(symbol, tf)
      const data = { ...c, candles: c.candles.slice(-MAX_BARS) }
      mem.set(key, data)
      order = [...order.filter((k) => k !== key), key]
      while (order.length > MAX_CHARTS) {
        const old = order.shift()!
        mem.delete(old)
        await f.remove(fileOf(old)).catch(() => {})
      }
      await f.write(fileOf(key), JSON.stringify(data))
      await f.write(INDEX, JSON.stringify(order))
    },
    get(symbol: string, tf: Timeframe): CandleData | null {
      return mem.get(keyOf(symbol, tf)) ?? null
    }
  }
}
export type CandleCache = ReturnType<typeof createCandleCache>
