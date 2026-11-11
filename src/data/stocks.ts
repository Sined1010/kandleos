import { http, type HttpRes } from './http'
import { alpacaAsset, alpacaCandles, alpacaHasKeys, alpacaQuotes, alpacaSearch, warmAlpaca } from './alpaca'
import { isinFromCusip, looksLikeWkn, warmXetra, xetraOfWkn, wikidataIsin, wknOf, xetraIds } from './isin'
import { matchCoins, mergeHits, withPrices } from '../shared/search'
import { periodIndex, timeZoneForSymbol } from '../shared/calendar'
import { t } from '../shared/i18n'
import { marketStatus, phaseAt } from '../shared/market'
import { aggregate, aggregateMonths, snapLast } from '../shared/candles'
import { firstWhole, sectionWindow } from '../shared/history'
import { aliasName, cleanName, COINS, findAliases } from '../shared/names'
import {
  alpacaKnows,
  cryptoQuoteAsset,
  isCrypto,
  stockRoute,
  SYMBOL_RE,
  TF_MONTHS,
  TF_SECONDS,
  type Candle,
  type CandleData,
  type CandleProvider,
  type CompanyInfo,
  type OlderRequest,
  type Quote,
  type SearchKind,
  type SearchResult,
  type StockSource,
  type Timeframe
} from '../shared/types'

// Chosen by the user on first start or in the settings; the window tells main (see index.ts).
let source: StockSource | null = null
// With Alpaca: whether Yahoo fills in what Alpaca does not have (indices, commodities, other exchanges).
let yahooExtra = false
export function setStockSource(s: unknown, extra?: unknown): void {
  if (s === 'alpaca' || s === 'yahoo' || s === 'none') source = s
  yahooExtra = source === 'alpaca' && extra === true
}

const yahooOn = () => source === 'yahoo' || yahooExtra
const viaAlpaca = (symbol: string) => stockRoute(source, yahooExtra, symbol) === 'alpaca'

const sourceOff = () =>
  new Error(t('Aktienkurse sind ausgeschaltet. In den Einstellungen eine Datenquelle für Aktien wählen.'))

// 2h/4h are built from hourly bars, quarters, half-years and years from monthly bars (see stockCandles).
// The first load asks for Yahoo's own range (counted on its clock, in sessions); each older section for
// `days` days (0 = all).
const YAHOO: Record<Timeframe, [interval: string, range: string, days: number]> = {
  '1m': ['1m', '5d', 5],
  '5m': ['5m', '1mo', 30],
  '15m': ['15m', '1mo', 30],
  '30m': ['30m', '1mo', 30],
  '1h': ['60m', '6mo', 182],
  '2h': ['60m', '1y', 365],
  '4h': ['60m', '1y', 365],
  '1D': ['1d', '5y', 1826],
  '1W': ['1wk', '10y', 3652],
  '1M': ['1mo', 'max', 0],
  '3M': ['1mo', 'max', 0],
  '6M': ['1mo', 'max', 0],
  '12M': ['1mo', 'max', 0]
}
// Yahoo refuses intraday spans reaching further back than this many days (HTTP 422).
const YAHOO_CAP: Record<string, number> = { '1m': 8, '5m': 60, '15m': 60, '30m': 60, '60m': 730 }

/**
 * End of a section that reaches through the bar at `before`: a section's first bar may be cut at its
 * start, so the next older section brings a whole copy of it (see prependOlder). Yahoo leaves out bars
 * that end after period2, and an hour starting at :30 ends past its 2h/4h bucket, so one bar size more is
 * asked for; finish() drops what lies past `before`.
 */
const through = (before: number, tf: Timeframe) => before + 2 * TF_SECONDS[tf]

/** 2h/4h are built from hours: starting on a bucket edge keeps the oldest bar whole. */
const aligned = (from: number, tf: Timeframe) => (tf === '2h' || tf === '4h' ? firstWhole(from, TF_SECONDS[tf]) : from)
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
  // A redirect keeps custom headers, so with the Finnhub key it is not followed (the 3xx fails below).
  const redirect = headers['X-Finnhub-Token'] ? 'manual' : undefined
  const res = await http(url, { headers: { 'User-Agent': 'Mozilla/5.0', ...headers }, redirect, timeoutMs: 10_000 })
  if (res.status === 404) throw new Error(t('Symbol nicht gefunden – Tipp: Firmenname in die Suche eingeben'))
  if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}`)
  return res.json()
}

// shortcut: Binance's USDT pairs are kept for the session (one request of about 200 KB); a coin listed later shows
// after a restart.
let pairs: Promise<Set<string>> | null = null

/**
 * All symbols traded against USDT on Binance, so search only offers coins whose chart can load. The book ticker
 * rather than the price list: delisted pairs keep their last price there, but have no bid.
 */
function binancePairs(): Promise<Set<string>> {
  pairs ??= http('https://api.binance.com/api/v3/ticker/bookTicker', { timeoutMs: 10_000 })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Binance HTTP ${res.status}`)
      const list: unknown = await res.json()
      if (!Array.isArray(list)) throw new Error('Binance: no list')
      return new Set(
        list.filter((p) => Number(p?.bidPrice) > 0).map((p) => String(p.symbol)).filter((s) => s.endsWith('USDT') && SYMBOL_RE.test(s))
      )
    })
    .catch((e) => {
      pairs = null
      throw e
    })
  return pairs
}

/** The promise's value if it comes within `ms`, else (or on an error) the fallback; the promise itself runs on. */
function within<T, F>(p: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return Promise.race([p.catch(() => fallback), new Promise<F>((r) => setTimeout(() => r(fallback), ms))])
}

const yahooKind: Record<string, SearchKind> = {
  EQUITY: 'stock',
  ETF: 'etf',
  MUTUALFUND: 'fund',
  CRYPTOCURRENCY: 'crypto',
  INDEX: 'index',
  FUTURE: 'future',
  CURRENCY: 'currency'
}

/**
 * The search box got the focus: the lists the search matches against start loading now rather than with the first
 * search, which would wait up to 2 s for Binance's pairs (a phone on mobile data takes that long). `wkn`: a digit was
 * typed, so a WKN may follow and the Xetra list (5 MB, slow on a phone) loads too; the search waits only 3 s for it.
 */
export function warmSearch(wkn = false): void {
  void binancePairs().catch(() => {})
  if (source === 'alpaca' && alpacaHasKeys()) warmAlpaca()
  if (wkn && yahooOn()) warmXetra()
}

export async function searchSymbols(query: unknown): Promise<SearchResult[]> {
  if (typeof query !== 'string' || !query.trim() || query.length > 40) return []
  // Neither list may hold up the search: a slow Binance leaves only the common coins, a slow Xetra list (5 MB on its
  // first load) only the plain search. Both keep loading for the next search.
  const listed = within(binancePairs(), 2000, null)
  // With Alpaca as the source, hits Alpaca has no prices for (OTC) are left out; Yahoo's home listing then leads.
  const priced = (hits: SearchResult[]) => withPrices(hits, source === 'alpaca' ? 'alpaca' : 'yahoo')
  const alpaca = source === 'alpaca' ? alpacaSearch(query).then(priced, () => []) : Promise.resolve([])
  if (!yahooOn()) {
    const [us, list] = await Promise.all([alpaca, listed])
    return mergeHits(query, us, matchCoins(query, list, COINS))
  }
  // A WKN is also searched as its ISIN, which Yahoo knows; the Xetra list maps one to the other. Its Xetra listing
  // comes first, as Yahoo may answer with another exchange only (A0RPWH → London).
  const q = query.trim().toUpperCase()
  const byWkn = looksLikeWkn(q)
    ? within(xetraOfWkn(q), 3000, undefined).then(async (x) =>
        x && SYMBOL_RE.test(x.mnemonic + '.DE') ? { x, hits: await yahooSearch(x.isin).catch(() => []) } : undefined
      )
    : Promise.resolve(undefined)
  const [us, yahoo, wkn, list] = await Promise.all([alpaca, yahooSearch(query).catch(() => []), byWkn, listed])
  const found = wkn
    ? [{ symbol: wkn.x.mnemonic + '.DE', name: wkn.hits[0]?.name ?? q, exchange: 'XETRA', kind: wkn.hits[0]?.kind }, ...wkn.hits, ...yahoo]
    : yahoo
  const coins = matchCoins(query, list, COINS)
  // Alpaca's US hits first, then Yahoo's for everything else (a US symbol from Yahoo is the same symbol). Yahoo's
  // coins only when Binance trades them; without Binance's list none, as their charts may not load.
  return mergeHits(query, [...us, ...priced(found).filter((f) => f.kind !== 'crypto' || list?.has(f.symbol))], coins)
}

async function yahooSearch(query: string): Promise<SearchResult[]> {
  // German names for futures and indices come first; Yahoo's search does not know them.
  const curated: SearchResult[] = findAliases(query).map((a) => ({
    symbol: a.symbol,
    name: t(a.name),
    exchange: a.symbol.endsWith('=F') ? 'Future' : 'Index',
    kind: a.symbol.endsWith('=F') ? 'future' : 'index'
  }))
  let found: SearchResult[] = []
  try {
    // 20 rather than 10: the search filter (stocks, ETFs, crypto) then still has hits of each kind.
    const d = await getJson(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query.trim())}&quotesCount=20&newsCount=0&listsCount=0`
    )
    found = (d.quotes ?? []).flatMap((q: any): SearchResult[] => {
      if (typeof q.symbol !== 'string') return []
      const crypto = q.quoteType === 'CRYPTOCURRENCY'
      // Crypto charts come from Binance, so Yahoo's BTC-USD becomes the BTCUSDT pair.
      const symbol = crypto ? q.symbol.replace(/-USD$/, 'USDT') : q.symbol
      if (!SYMBOL_RE.test(symbol) || crypto !== isCrypto(symbol) || curated.some((c) => c.symbol === symbol)) return []
      const name = aliasName(symbol) ?? cleanName(String(q.longname ?? q.shortname ?? ''), crypto)
      return [{ symbol, name, exchange: crypto ? 'Binance' : (q.exchDisp ?? ''), kind: Object.hasOwn(yahooKind, q.quoteType) ? yahooKind[q.quoteType] : undefined }]
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

async function finnhubCandles(symbol: string, tf: Timeframe, key: string, before?: number): Promise<Candle[]> {
  const [res, days] = FINNHUB[tf]
  const [from, to] = sectionWindow(days, before, Math.floor(Date.now() / 1000))!
  const d = await getJson(
    `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${res}` +
      `&from=${aligned(from, tf)}&to=${before === undefined ? to : through(before, tf)}`,
    finnhubAuth(key)
  )
  // At the start of its history Finnhub answers "no_data".
  if (before !== undefined && d.s === 'no_data') return []
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

async function yahooCandles(symbol: string, tf: Timeframe, extended = false, before?: number): Promise<CandleData> {
  const [interval, range, days] = YAHOO[tf]
  const now = Math.floor(Date.now() / 1000)
  let span: string
  if (before === undefined) {
    // With range=max Yahoo silently coarsens long histories (monthly becomes quarterly); an explicit span does not.
    span = range === 'max' ? `period1=0&period2=${now}` : `range=${range}`
  } else {
    // Older sections end at a bar's time, not the local clock (which may be off); only Yahoo's cap uses it.
    const window = sectionWindow(days, before, now, YAHOO_CAP[interval])
    if (!window) return { candles: [], currency: '', provider: 'yahoo' }
    span = `period1=${aligned(window[0], tf)}&period2=${through(before, tf)}`
  }
  const d = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&${span}` +
      (extended ? '&includePrePost=true' : '')
  )
  const r = d.chart?.result?.[0]
  if (before !== undefined && !r?.timestamp) return { candles: [], currency: '', provider: 'yahoo' }
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
  if (before === undefined && live && interval !== '1d' && !interval.endsWith('m')) {
    const zone = timezone ?? 'UTC'
    const samePeriod =
      interval === '1wk'
        ? live.time - prev.time < 7 * 86400
        : periodIndex(live.time, 1, zone) === periodIndex(prev.time, 1, zone)
    if (samePeriod) out.pop()
  }
  const candles = before === undefined && interval.endsWith('m') ? snapLast(out, parseInt(interval) * 60) : out
  return { candles, currency: r.meta?.currency ?? '', timezone, provider: 'yahoo' }
}

export async function stockCandles(
  symbolArg: unknown,
  tfArg: unknown,
  keyArg: unknown,
  extendedArg?: unknown,
  olderArg?: unknown
): Promise<CandleData> {
  const [symbol, key] = checkArgs(symbolArg, keyArg)
  if (typeof tfArg !== 'string' || !(tfArg in YAHOO)) throw new Error(t('Ungültiger Timeframe: {tf}', { tf: String(tfArg) }))
  const tf = tfArg as Timeframe
  // Pre-market and after-hours candles exist for intraday bars only.
  const extended = extendedArg === true && TF_SECONDS[tf] < 86400
  const older = checkOlder(olderArg)
  if (older) {
    // A section before the oldest bar comes from the source that sent the first one, without falling back.
    if (older.provider === 'alpaca' && viaAlpaca(symbol)) return alpacaCandles(symbol, tf, extended, older.before)
    const data =
      older.provider === 'finnhub' && key && !extended && yahooOn()
          ? { candles: await finnhubCandles(symbol, tf, key, older.before), currency: '', provider: 'finnhub' as const }
          : older.provider === 'yahoo' && yahooOn()
            ? await yahooCandles(symbol, tf, extended, older.before)
            : null
    if (!data) throw sourceOff()
    return finish(data, tf, older.before)
  }
  if (viaAlpaca(symbol)) return alpacaCandles(symbol, tf, extended)
  if (!yahooOn()) throw sourceOff()
  let data: CandleData | undefined
  if (key && !extended) {
    try {
      const candles = await finnhubCandles(symbol, tf, key)
      // Finnhub candles carry no currency; Yahoo's quote metadata does.
      const meta = await yahooMeta(symbol).catch(() => null)
      // Finnhub candles carry no exchange time zone: take Yahoo's, else derive it from the ticker suffix.
      const timezone = validTimeZone(meta?.exchangeTimezoneName) ?? timeZoneForSymbol(symbol)
      data = { candles, currency: meta?.currency ?? '', timezone, provider: 'finnhub' }
    } catch (e) {
      console.warn(`Finnhub-Kerzen für ${symbol} nicht verfügbar, nutze Yahoo:`, (e as Error).message)
    }
  }
  data ??= await yahooCandles(symbol, tf, extended)
  return finish(data, tf)
}

/** Builds the longer candle sizes from the source's bars; a section keeps only bars up to `before`. */
function finish(data: CandleData, tf: Timeframe, before = Infinity): CandleData {
  const months = TF_MONTHS[tf]
  const candles =
    months && months > 1
      ? aggregateMonths(data.candles, months, data.timezone)
      : tf === '2h' || tf === '4h'
        ? aggregate(data.candles, TF_SECONDS[tf])
        : data.candles
  return { ...data, candles: candles.filter((c) => c.time <= before) }
}

/** The renderer's request for an older section, checked: it crosses from the window into main. */
function checkOlder(arg: unknown): OlderRequest | undefined {
  if (arg === undefined || arg === null) return undefined
  const { before, provider } = arg as Partial<OlderRequest>
  // A day of slack for a local clock that runs ahead.
  if (typeof before !== 'number' || !Number.isFinite(before) || before <= 0 || before > Date.now() / 1000 + 86400)
    throw new Error(t('Ungültiger Zeitpunkt'))
  return { before, provider: PROVIDERS.includes(provider as CandleProvider) ? provider : undefined }
}
const PROVIDERS: CandleProvider[] = ['alpaca', 'yahoo', 'finnhub']

/** Validates the key with one cheap request. Returns null if it works, otherwise a user-facing reason. */
export async function finnhubCheck(keyArg: unknown): Promise<string | null> {
  const [, key] = checkArgs('AAPL', keyArg)
  if (!key) return t('Ungültiges Key-Format')
  try {
    const res = await http('https://finnhub.io/api/v1/quote?symbol=AAPL', { headers: finnhubAuth(key), redirect: 'manual', timeoutMs: 10_000 })
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
    if (viaAlpaca(symbol)) return alpacaAsset(symbol).then((a) => a?.name || null, () => null)
    if (!yahooOn()) return null
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

/** Latest prices; `error` says why Alpaca sent none (key rejected, offline), for the source badge. */
export async function stockQuotes(symbols: unknown, keyArg: unknown): Promise<{ quotes: Record<string, Quote>; error: string | null }> {
  const out: Record<string, Quote> = {}
  let error: string | null = null
  if (!Array.isArray(symbols)) return { quotes: out, error }
  const alpaca = symbols.filter((s) => typeof s === 'string' && SYMBOL_RE.test(s) && viaAlpaca(s))
  // shortcut: with the Yahoo extra its symbols are polled at Alpaca's 5 s pace; throttle here if Yahoo starts refusing.
  const yahoo = yahooOn() ? symbols.filter((s) => !alpaca.includes(s)) : []
  await Promise.all([
    // One failing source must not drop the other's prices.
    alpaca.length &&
      alpacaQuotes(alpaca).then(
        (q) => Object.assign(out, q),
        (e) => void (error = (e as Error).name === 'TimeoutError' ? t('Alpaca nicht erreichbar') : (e as Error).message)
      ),
    ...yahoo.map(async (s) => {
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
  ])
  return { quotes: out, error }
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const raw = (v: any): number | undefined => num(v?.raw)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
// The window opens https links only (see index.ts).
const https = (v: unknown): string | undefined => str(v)?.replace(/^http:\/\//, 'https://').match(/^https:\/\/\S+$/)?.[0]

/** Company profile for the info button: Finnhub with a key, otherwise (and for what Finnhub lacks) Yahoo if switched on. */
export async function companyInfo(symbolArg: unknown, keyArg: unknown): Promise<CompanyInfo> {
  const [symbol, key] = checkArgs(symbolArg, keyArg)
  if (isCrypto(symbol)) throw new Error(t('Infos gibt es nur für Aktien.'))
  // The numbers are extra: a slow or unreachable source must not hold back the panel.
  const ids = Promise.race([securityIds(symbol), new Promise<{}>((r) => setTimeout(() => r({}), 5000))])
  const [info, found] = await Promise.all([profile(symbol, key), ids])
  return { ...info, ...found }
}

async function profile(symbol: string, key: string): Promise<CompanyInfo> {
  // Finnhub's free plan covers US listings only; indices, commodities and other exchanges fall through to Yahoo.
  const finnhub = key && alpacaKnows(symbol) ? await finnhubInfo(symbol, key).catch(() => null) : null
  if (finnhub) return finnhub
  if (!yahooOn()) {
    throw new Error(
      key
        ? t('Finnhub hat keine Infos zu {symbol}.', { symbol })
        : t('Für Infos einen Finnhub-Key eintragen oder Yahoo Finance einschalten (Einstellungen).')
    )
  }
  return yahooInfo(symbol)
}

/** ISIN (and WKN) from the most exact source that has the symbol; none if unsure or a source fails. */
async function securityIds(symbol: string): Promise<Pick<CompanyInfo, 'isin' | 'wkn' | 'idSource'>> {
  if (/[\^=]/.test(symbol)) return {} // indices, futures, currencies
  const [, base, suffix = ''] = symbol.match(/^(.+?)(?:\.([A-Z]{1,2}))?$/)!
  try {
    if (alpacaKnows(symbol) && alpacaHasKeys()) {
      const isin = isinFromCusip((await alpacaAsset(symbol).catch(() => undefined))?.cusip)
      if (isin) return { isin, idSource: 'Alpaca' }
    }
    if (suffix === 'DE' || suffix === 'F') {
      const x = await xetraIds(base).catch(() => undefined)
      if (x) return { ...x, idSource: 'Deutsche Börse' }
    }
    // A US share class is written BRK-B at Yahoo; anything else after a dot is an exchange suffix.
    const isin = await wikidataIsin(alpacaKnows(symbol) ? symbol : base, alpacaKnows(symbol) ? '' : suffix)
    return isin ? { isin, wkn: wknOf(isin), idSource: 'Wikidata' } : {}
  } catch (e) {
    console.warn((e as Error).message)
    return {}
  }
}

async function finnhubInfo(symbol: string, key: string): Promise<CompanyInfo | null> {
  const [p, m] = await Promise.all([
    getJson(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}`, finnhubAuth(key)),
    getJson(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all`, finnhubAuth(key)).catch(() => null)
  ])
  if (!str(p?.name)) return null
  const k = m?.metric ?? {}
  const cap = num(p.marketCapitalization)
  return {
    source: 'Finnhub',
    name: str(p.name),
    sector: str(p.finnhubIndustry),
    country: str(p.country),
    exchange: str(p.exchange),
    currency: str(p.currency),
    // Finnhub reports millions.
    marketCap: cap && cap * 1e6,
    website: https(p.weburl),
    ipo: str(p.ipo),
    pe: num(k.peTTM ?? k.peBasicExclExtraTTM),
    dividendYield: num(k.dividendYieldIndicatedAnnual),
    beta: num(k.beta),
    high52: num(k['52WeekHigh']),
    low52: num(k['52WeekLow'])
  }
}

// quoteSummary wants a session cookie and its crumb; both are fetched once and renewed when Yahoo rejects them.
let yahooSession: Promise<{ cookie: string; crumb: string }> | null = null
const cookiesOf = (res: HttpRes | null) => res?.setCookies ?? []
function yahooAuth(): Promise<{ cookie: string; crumb: string }> {
  yahooSession ??= (async () => {
    const opts = { headers: { 'User-Agent': 'Mozilla/5.0' }, timeoutMs: 10_000 }
    // fc.yahoo.com answers 404 but sets the session cookie; failing here is fine, the crumb request sets one too.
    const jar = cookiesOf(await http('https://fc.yahoo.com', { ...opts, redirect: 'manual' }).catch(() => null))
    const res = await http('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      ...opts,
      headers: { ...opts.headers, Cookie: jar.join('; ') }
    })
    const crumb = (await res.text()).trim()
    if (!res.ok || !/^\S{1,64}$/.test(crumb)) throw new Error(`Yahoo HTTP ${res.status}`)
    return { cookie: [...jar, ...cookiesOf(res)].join('; '), crumb }
  })().catch((e) => {
    yahooSession = null
    throw e
  })
  return yahooSession
}

async function yahooInfo(symbol: string, retry = true): Promise<CompanyInfo> {
  const { cookie, crumb } = await yahooAuth()
  let d: any
  try {
    d = await getJson(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
        `?modules=assetProfile,price,summaryDetail&crumb=${encodeURIComponent(crumb)}`,
      { Cookie: cookie }
    )
  } catch (e) {
    // An expired crumb answers 401; get a new session once.
    if (!retry || !/HTTP 401/.test((e as Error).message)) throw e
    yahooSession = null
    return yahooInfo(symbol, false)
  }
  const r = d.quoteSummary?.result?.[0]
  if (!r) throw new Error(t('Yahoo hat keine Infos zu {symbol}.', { symbol }))
  const p = r.assetProfile ?? {}
  const pr = r.price ?? {}
  const sd = r.summaryDetail ?? {}
  const dy = raw(sd.dividendYield)
  return {
    source: 'Yahoo Finance',
    name: str(pr.longName) ?? str(pr.shortName),
    description: str(p.longBusinessSummary),
    sector: str(p.sectorDisp) ?? str(p.sector),
    industry: str(p.industryDisp) ?? str(p.industry),
    country: str(p.country),
    exchange: str(pr.exchangeName),
    currency: str(pr.currency),
    marketCap: raw(pr.marketCap) ?? raw(sd.marketCap),
    employees: num(p.fullTimeEmployees),
    website: https(p.website),
    pe: raw(sd.trailingPE),
    dividendYield: dy && dy * 100,
    beta: raw(sd.beta),
    high52: raw(sd.fiftyTwoWeekHigh),
    low52: raw(sd.fiftyTwoWeekLow)
  }
}
