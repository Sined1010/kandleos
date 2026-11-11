import type { SearchResult } from './types.ts'

const base = (query: string) => query.trim().toUpperCase().replace(/USDT$/, '')

/**
 * Coins traded against USDT on Binance that match the query: the exact symbol first, then the common coins by symbol
 * or name, then other symbols starting with it (PEPE for "pep"). Without Binance's list only the common coins count.
 */
export function matchCoins(query: string, pairs: Set<string> | null, names: Record<string, string>): SearchResult[] {
  const q = base(query)
  if (!q) return []
  const listed = (b: string) => !pairs || pairs.has(b + 'USDT')
  const known = Object.keys(names).filter((b) => (b.startsWith(q) || names[b].toUpperCase().startsWith(q)) && listed(b))
  const others = pairs ? [...pairs].map((p) => p.slice(0, -4)).filter((b) => b.startsWith(q) && !names[b]) : []
  const rank = (b: string) => (b === q ? 0 : names[b] ? 1 : 2)
  return [...known, ...others]
    .sort((a, b) => rank(a) - rank(b) || a.length - b.length)
    .slice(0, 5)
    .map((b) => ({ symbol: b + 'USDT', name: names[b] ?? b, exchange: 'Binance', kind: 'crypto' as const }))
}

/**
 * Stock and coin hits in one list: what is named exactly as typed first (a stock's ticker, then a coin's symbol or
 * name: "SOL", "Bitcoin"), then the other stocks, then the other coins; each symbol once.
 */
export function mergeHits(query: string, stocks: SearchResult[], coins: SearchResult[]): SearchResult[] {
  const q = query.trim().toUpperCase()
  const exactStock = (r: SearchResult) => r.symbol === q
  const exactCoin = (r: SearchResult) => r.symbol === base(q) + 'USDT' || r.name.toUpperCase() === q
  const seen = new Set<string>()
  return [...stocks.filter(exactStock), ...coins.filter(exactCoin), ...stocks, ...coins].filter(
    (r) => !seen.has(r.symbol) && !!seen.add(r.symbol)
  )
}

/** Exchange names of OTC listings: Alpaca's asset list says OTC, Yahoo's search OQX, OQB, PNK or "Other OTC". */
const OTC = /^(OTC|OQX|OQB|PNK|Other OTC|OTC Markets.*)$/i

/**
 * Hits whose chart can load. With Alpaca as the stock source, US symbols load from Alpaca, which has no OTC prices
 * (Infineon: IFNNY and IFNNF stay empty, IFX.DE comes through Yahoo), so OTC hits are left out; Yahoo has them.
 */
export function withPrices(hits: SearchResult[], source: 'alpaca' | 'yahoo'): SearchResult[] {
  return source === 'alpaca' ? hits.filter((h) => !OTC.test(h.exchange ?? '')) : hits
}
