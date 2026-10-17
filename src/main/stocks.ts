import { aggregate } from '../shared/candles'
import {
  isCrypto,
  SYMBOL_RE,
  TF_SECONDS,
  type Candle,
  type CandleData,
  type Quote,
  type SearchResult,
  type Timeframe
} from '../shared/types'

const YAHOO: Record<Timeframe, [interval: string, range: string]> = {
  '1m': ['1m', '5d'],
  '5m': ['5m', '1mo'],
  '15m': ['15m', '1mo'],
  '1h': ['60m', '6mo'],
  '4h': ['60m', '1y'],
  '1D': ['1d', '5y'],
  '1W': ['1wk', '10y']
}
const FINNHUB: Record<Timeframe, [resolution: string, days: number]> = {
  '1m': ['1', 5],
  '5m': ['5', 30],
  '15m': ['15', 30],
  '1h': ['60', 180],
  '4h': ['60', 365],
  '1D': ['D', 1825],
  '1W': ['W', 3650]
}

async function getJson(url: string): Promise<any> {
  // Yahoo rejects requests without a browser-like user agent.
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10_000) })
  if (res.status === 404) throw new Error(`Symbol nicht gefunden – Tipp: Firmenname in die Suche eingeben`)
  if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}`)
  return res.json()
}

export async function searchSymbols(query: unknown): Promise<SearchResult[]> {
  if (typeof query !== 'string' || !query.trim() || query.length > 40) return []
  const d = await getJson(
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query.trim())}&quotesCount=10&newsCount=0&listsCount=0`
  )
  return (d.quotes ?? []).flatMap((q: any): SearchResult[] => {
    if (typeof q.symbol !== 'string') return []
    const crypto = q.quoteType === 'CRYPTOCURRENCY'
    // Crypto charts come from Binance, so Yahoo's BTC-USD becomes the BTCUSDT pair.
    const symbol = crypto ? q.symbol.replace(/-USD$/, 'USDT') : q.symbol
    if (!SYMBOL_RE.test(symbol) || crypto !== isCrypto(symbol)) return []
    return [{ symbol, name: String(q.shortname ?? q.longname ?? '').trim(), exchange: crypto ? 'Binance' : (q.exchDisp ?? '') }]
  })
}

function checkArgs(symbol: unknown, key: unknown): [string, string] {
  if (typeof symbol !== 'string' || !SYMBOL_RE.test(symbol)) throw new Error(`Ungültiges Symbol: ${String(symbol)}`)
  return [symbol, typeof key === 'string' && /^[A-Za-z0-9]{1,64}$/.test(key) ? key : '']
}

async function finnhubCandles(symbol: string, tf: Timeframe, key: string): Promise<Candle[]> {
  const [res, days] = FINNHUB[tf]
  const to = Math.floor(Date.now() / 1000)
  const d = await getJson(
    `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${res}&from=${to - days * 86400}&to=${to}&token=${key}`
  )
  if (d.s !== 'ok') throw new Error(`Finnhub: ${d.s ?? d.error}`)
  return d.t.map((t: number, i: number) => ({
    time: t,
    open: d.o[i],
    high: d.h[i],
    low: d.l[i],
    close: d.c[i],
    volume: d.v[i]
  }))
}

async function yahooCandles(symbol: string, tf: Timeframe): Promise<CandleData> {
  const [interval, range] = YAHOO[tf]
  const d = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`
  )
  const r = d.chart?.result?.[0]
  if (!r?.timestamp) throw new Error(`Keine Kursdaten für ${symbol}`)
  const q = r.indicators.quote[0]
  const out: Candle[] = []
  r.timestamp.forEach((t: number, i: number) => {
    // Yahoo pads gaps with nulls and can repeat the live bar's timestamp.
    if (q.open[i] == null || q.close[i] == null || (out.length && t <= out[out.length - 1].time)) return
    out.push({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] ?? 0 })
  })
  return { candles: out, currency: r.meta?.currency ?? '' }
}

export async function stockCandles(symbolArg: unknown, tfArg: unknown, keyArg: unknown): Promise<CandleData> {
  const [symbol, key] = checkArgs(symbolArg, keyArg)
  if (typeof tfArg !== 'string' || !(tfArg in YAHOO)) throw new Error(`Ungültiger Timeframe: ${String(tfArg)}`)
  const tf = tfArg as Timeframe
  let data: CandleData | undefined
  if (key) {
    try {
      const candles = await finnhubCandles(symbol, tf, key)
      // Finnhub candles carry no currency; Yahoo's quote metadata does.
      const currency = await yahooMeta(symbol).then((m) => m.currency ?? '', () => '')
      data = { candles, currency }
    } catch (e) {
      console.warn(`Finnhub-Kerzen für ${symbol} nicht verfügbar, nutze Yahoo:`, (e as Error).message)
    }
  }
  data ??= await yahooCandles(symbol, tf)
  return tf === '4h' ? { ...data, candles: aggregate(data.candles, TF_SECONDS['4h']) } : data
}

async function finnhubQuote(symbol: string, key: string): Promise<Quote> {
  const d = await getJson(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`)
  if (!d.c) throw new Error(`Finnhub: kein Kurs für ${symbol}`)
  return { price: d.c, changePct: d.dp ?? 0, time: d.t, prevClose: d.pc }
}

async function yahooMeta(symbol: string): Promise<any> {
  const d = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  )
  const m = d.chart?.result?.[0]?.meta
  if (!m?.regularMarketPrice) throw new Error(`Yahoo: kein Kurs für ${symbol}`)
  return m
}

async function yahooQuote(symbol: string): Promise<Quote> {
  const m = await yahooMeta(symbol)
  const prev = m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice
  return {
    price: m.regularMarketPrice,
    changePct: (m.regularMarketPrice / prev - 1) * 100,
    time: m.regularMarketTime,
    prevClose: prev
  }
}

export async function stockQuotes(symbols: unknown, keyArg: unknown): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {}
  if (!Array.isArray(symbols)) return out
  await Promise.all(
    symbols.map(async (s) => {
      try {
        const [symbol, key] = checkArgs(s, keyArg)
        out[symbol] = key ? await finnhubQuote(symbol, key).catch(() => yahooQuote(symbol)) : await yahooQuote(symbol)
      } catch (e) {
        console.warn((e as Error).message)
      }
    })
  )
  return out
}
