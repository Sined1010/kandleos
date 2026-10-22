import { alpacaCandles, alpacaName, alpacaQuotes, alpacaSearch } from './alpaca'
import { periodIndex, timeZoneForSymbol } from '../shared/calendar'
import { t } from '../shared/i18n'
import { marketStatus, phaseAt } from '../shared/market'
import { aggregate, aggregateMonths } from '../shared/candles'
import { aliasName, cleanName, COINS, findAliases } from '../shared/names'
import {
  cryptoQuoteAsset,
  isCrypto,
  SYMBOL_RE,
  TF_MONTHS,
  TF_SECONDS,
  type Candle,
  type CandleData,
  type Quote,
  type SearchResult,
  type StockSource,
  type Timeframe
} from '../shared/types'

// Chosen by the user on first start or in the settings; the window tells main (see index.ts).
let source: StockSource | null = null
export function setStockSource(s: unknown): void {
  if (s === 'alpaca' || s === 'yahoo' || s === 'none') source = s
}

const sourceOff = () =>
  new Error(t('Aktienkurse sind ausgeschaltet. In den Einstellungen eine Datenquelle für Aktien wählen.'))

// 2h/4h are built from hourly bars, quarters, half-years and years from monthly bars (see stockCandles).
const YAHOO: Record<Timeframe, [interval: string, range: string]> = {
  '1m': ['1m', '5d'],
  '5m': ['5m', '1mo'],
  '15m': ['15m', '1mo'],
  '30m': ['30m', '1mo'],
  '1h': ['60m', '6mo'],
  '2h': ['60m', '1y'],
  '4h': ['60m', '1y'],
  '1D': ['1d', '5y'],
  '1W': ['1wk', '10y'],
  '1M': ['1mo', 'max'],
  '3M': ['1mo', 'max'],
  '6M': ['1mo', 'max'],
  '12M': ['1mo', 'max']
}
const FINNHUB: Record<Timeframe, [resolution: string, days: number]> = {
  '1m': ['1', 5],
  '5m': ['5', 30],
  '15m': ['15', 30],
  '30m': ['30', 30],
  '1h': ['60', 180],
  '2h': ['60', 365],
  '4h': ['60', 365],
  '1D': ['D', 1825],
  '1W': ['W', 3650],
  '1M': ['M', 18250],
  '3M': ['M', 18250],
  '6M': ['M', 18250],
  '12M': ['M', 18250]
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  // Yahoo rejects requests without a browser-like user agent.
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', ...headers }, signal: AbortSignal.timeout(10_000) })
  if (res.status === 404) throw new Error(t('Symbol nicht gefunden – Tipp: Firmenname in die Suche eingeben'))
  if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}`)
  return res.json()
}

/**
 * Coins on Binance matching the query, without Yahoo: by name from the list of common coins, or the query as
 * a coin symbol traded against USDT (checked with one cheap Binance request).
 */
async function coinSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim().toUpperCase().replace(/USDT$/, '')
  const out = Object.entries(COINS)
    .filter(([sym, name]) => sym.startsWith(q) || name.toUpperCase().startsWith(q))
    .map(([sym, name]) => ({ symbol: sym + 'USDT', name, exchange: 'Binance' }))
  if (/^[A-Z0-9]{2,10}$/.test(q) && !COINS[q]) {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${q}USDT`, {
      signal: AbortSignal.timeout(5000)
    }).catch(() => null)
    if (res?.ok) out.unshift({ symbol: q + 'USDT', name: q, exchange: 'Binance' })
  }
  return out.slice(0, 5)
}

export async function searchSymbols(query: unknown): Promise<SearchResult[]> {
  if (typeof query !== 'string' || !query.trim() || query.length > 40) return []
  if (source !== 'yahoo') {
    const [coins, stocks] = await Promise.all([
      coinSearch(query),
      source === 'alpaca' ? alpacaSearch(query).catch(() => []) : []
    ])
    return [...stocks, ...coins]
  }
  // German names for futures and indices come first; Yahoo's search does not know them.
  const curated: SearchResult[] = findAliases(query).map((a) => ({
    symbol: a.symbol,
    name: t(a.name),
    exchange: a.symbol.endsWith('=F') ? 'Future' : 'Index'
  }))
  let found: SearchResult[] = []
  try {
    const d = await getJson(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query.trim())}&quotesCount=10&newsCount=0&listsCount=0`
    )
    found = (d.quotes ?? []).flatMap((q: any): SearchResult[] => {
      if (typeof q.symbol !== 'string') return []
      const crypto = q.quoteType === 'CRYPTOCURRENCY'
      // Crypto charts come from Binance, so Yahoo's BTC-USD becomes the BTCUSDT pair.
      const symbol = crypto ? q.symbol.replace(/-USD$/, 'USDT') : q.symbol
      if (!SYMBOL_RE.test(symbol) || crypto !== isCrypto(symbol) || curated.some((c) => c.symbol === symbol)) return []
      const name = aliasName(symbol) ?? cleanName(String(q.longname ?? q.shortname ?? ''), crypto)
      return [{ symbol, name, exchange: crypto ? 'Binance' : (q.exchDisp ?? '') }]
    })
  } catch (e) {
    // Curated hits still work offline or when Yahoo is down.
    if (!curated.length) throw e
  }
  return [...curated, ...found]
}

function checkArgs(symbol: unknown, key: unknown): [string, string] {
  if (typeof symbol !== 'string' || !SYMBOL_RE.test(symbol)) throw new Error(t('Ungültiges Symbol: {symbol}', { symbol: String(symbol) }))
  return [symbol, typeof key === 'string' && /^[A-Za-z0-9]{1,64}$/.test(key) ? key : '']
}

// The key goes in a header, not the URL, so it never shows up in proxy or server logs.
const finnhubAuth = (key: string) => ({ 'X-Finnhub-Token': key })

async function finnhubCandles(symbol: string, tf: Timeframe, key: string): Promise<Candle[]> {
  const [res, days] = FINNHUB[tf]
  const to = Math.floor(Date.now() / 1000)
  const d = await getJson(
    `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${res}&from=${to - days * 86400}&to=${to}`,
    finnhubAuth(key)
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

/** Yahoo's exchange time zone, if it is one the runtime knows (it ends up in Intl.DateTimeFormat). */
function validTimeZone(tz: unknown): string | undefined {
  if (typeof tz !== 'string') return undefined
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return tz
  } catch {
    return undefined
  }
}

async function yahooCandles(symbol: string, tf: Timeframe, extended = false): Promise<CandleData> {
  const [interval, range] = YAHOO[tf]
  // With range=max Yahoo silently coarsens long histories (monthly becomes quarterly); an explicit span does not.
  const span = range === 'max' ? `period1=0&period2=${Math.floor(Date.now() / 1000)}` : `range=${range}`
  const d = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&${span}` +
      (extended ? '&includePrePost=true' : '')
  )
  const r = d.chart?.result?.[0]
  if (!r?.timestamp) throw new Error(t('Keine Kursdaten für {symbol}', { symbol }))
  const q = r.indicators.quote[0]
  const out: Candle[] = []
  r.timestamp.forEach((t: number, i: number) => {
    // Yahoo pads gaps with nulls and can repeat the live bar's timestamp.
    if (q.open[i] == null || q.close[i] == null || (out.length && t <= out[out.length - 1].time)) return
    out.push({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] ?? 0 })
  })
  const timezone = validTimeZone(r.meta?.exchangeTimezoneName) ?? timeZoneForSymbol(symbol)
  // Weekly and monthly data end with an extra bar stamped "now" holding only today's trading, while the
  // running week's or month's bar already includes it; keeping both would show the period twice.
  const [prev, live] = out.slice(-2)
  if (live && interval !== '1d' && !interval.endsWith('m')) {
    const zone = timezone ?? 'UTC'
    const samePeriod =
      interval === '1wk'
        ? live.time - prev.time < 7 * 86400
        : periodIndex(live.time, 1, zone) === periodIndex(prev.time, 1, zone)
    if (samePeriod) out.pop()
  }
  return { candles: out, currency: r.meta?.currency ?? '', timezone }
}

export async function stockCandles(
  symbolArg: unknown,
  tfArg: unknown,
  keyArg: unknown,
  extendedArg?: unknown
): Promise<CandleData> {
  const [symbol, key] = checkArgs(symbolArg, keyArg)
  if (typeof tfArg !== 'string' || !(tfArg in YAHOO)) throw new Error(t('Ungültiger Timeframe: {tf}', { tf: String(tfArg) }))
  const tf = tfArg as Timeframe
  // Pre-market and after-hours candles exist for intraday bars only.
  const extended = extendedArg === true && TF_SECONDS[tf] < 86400
  if (source === 'alpaca') return alpacaCandles(symbol, tf, extended)
  if (source !== 'yahoo') throw sourceOff()
  let data: CandleData | undefined
  if (key && !extended) {
    try {
      const candles = await finnhubCandles(symbol, tf, key)
      // Finnhub candles carry no currency; Yahoo's quote metadata does.
      const meta = await yahooMeta(symbol).catch(() => null)
      // Finnhub candles carry no exchange time zone: take Yahoo's, else derive it from the ticker suffix.
      const timezone = validTimeZone(meta?.exchangeTimezoneName) ?? timeZoneForSymbol(symbol)
      data = { candles, currency: meta?.currency ?? '', timezone }
    } catch (e) {
      console.warn(`Finnhub-Kerzen für ${symbol} nicht verfügbar, nutze Yahoo:`, (e as Error).message)
    }
  }
  data ??= await yahooCandles(symbol, tf, extended)
  const months = TF_MONTHS[tf]
  if (months && months > 1) return { ...data, candles: aggregateMonths(data.candles, months, data.timezone) }
  return tf === '2h' || tf === '4h' ? { ...data, candles: aggregate(data.candles, TF_SECONDS[tf]) } : data
}

/** Validates the key with one cheap request. Returns null if it works, otherwise a user-facing reason. */
export async function finnhubCheck(keyArg: unknown): Promise<string | null> {
  const [, key] = checkArgs('AAPL', keyArg)
  if (!key) return t('Ungültiges Key-Format')
  try {
    const res = await fetch('https://finnhub.io/api/v1/quote?symbol=AAPL', {
      headers: finnhubAuth(key),
      signal: AbortSignal.timeout(10_000)
    })
    if (res.status === 401 || res.status === 403) return t('API-Key ungültig')
    if (res.status === 429) return 'Rate-Limit erreicht (max. 60 Anfragen/Minute)'
    return res.ok ? null : `Finnhub HTTP ${res.status}`
  } catch {
    return t('Finnhub nicht erreichbar')
  }
}

async function finnhubQuote(symbol: string, key: string): Promise<Quote> {
  const d = await getJson(`https://finnhub.io/api/v1/quote?symbol=${symbol}`, finnhubAuth(key))
  if (!d.c) throw new Error(t('Finnhub: kein Kurs für {symbol}', { symbol }))
  return { price: d.c, changePct: d.dp ?? 0, time: d.t, prevClose: d.pc }
}

async function yahooMeta(symbol: string): Promise<any> {
  const d = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  )
  const m = d.chart?.result?.[0]?.meta
  if (!m?.regularMarketPrice) throw new Error(t('Yahoo: kein Kurs für {symbol}', { symbol }))
  return m
}

/** Display name for a watchlist symbol, or null if the data source does not know it. */
export async function symbolName(symbolArg: unknown): Promise<string | null> {
  const [symbol] = checkArgs(symbolArg, '')
  const crypto = isCrypto(symbol)
  if (source !== 'yahoo') {
    if (crypto) return COINS[symbol.slice(0, -cryptoQuoteAsset(symbol).length)] ?? null
    return source === 'alpaca' ? alpacaName(symbol).catch(() => null) : null
  }
  // Yahoo lists coins against USD (BTC-USD), not as exchange pairs (BTCUSDT).
  const lookup = crypto ? `${symbol.slice(0, -cryptoQuoteAsset(symbol).length)}-USD` : symbol
  try {
    const m = await yahooMeta(lookup)
    const name = aliasName(symbol) ?? cleanName(String(m.longName ?? m.shortName ?? ''), crypto)
    return name || null
  } catch {
    return null
  }
}

async function yahooQuote(symbol: string): Promise<Quote> {
  // 5-minute bars including pre- and after-market: the metadata holds the regular session,
  // the last bar the latest extended-hours price.
  const d = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d&includePrePost=true`
  )
  const r = d.chart?.result?.[0]
  const m = r?.meta
  if (!m?.regularMarketPrice) throw new Error(t('Yahoo: kein Kurs für {symbol}', { symbol }))
  const price: number = m.regularMarketPrice
  const prev = m.chartPreviousClose ?? m.previousClose ?? price
  const timezone = validTimeZone(m.exchangeTimezoneName)
  const quote: Quote = { price, changePct: (price / prev - 1) * 100, time: m.regularMarketTime, prevClose: prev, timezone }
  const times: number[] = r.timestamp ?? []
  const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? []
  let i = times.length - 1
  while (i >= 0 && closes[i] == null) i--
  const phase = i >= 0 ? phaseAt(symbol, timezone ?? timeZoneForSymbol(symbol), times[i]) : null
  if (phase === 'pre' || phase === 'post') {
    const ext = closes[i] as number
    quote.ext = { phase, price: ext, changePct: (ext / price - 1) * 100, time: times[i] }
  }
  return quote
}

export async function stockQuotes(symbols: unknown, keyArg: unknown): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {}
  if (!Array.isArray(symbols)) return out
  if (source === 'alpaca') return alpacaQuotes(symbols.filter((s) => typeof s === 'string' && SYMBOL_RE.test(s)))
  if (source !== 'yahoo') return out
  await Promise.all(
    symbols.map(async (s) => {
      try {
        const [symbol, key] = checkArgs(s, keyArg)
        // Outside the regular session Yahoo also has the pre-market and after-hours price; Finnhub's quote does not.
        const regular = marketStatus(symbol, timeZoneForSymbol(symbol))?.phase === 'open'
        out[symbol] =
          key && regular ? await finnhubQuote(symbol, key).catch(() => yahooQuote(symbol)) : await yahooQuote(symbol)
      } catch (e) {
        console.warn((e as Error).message)
      }
    })
  )
  return out
}
