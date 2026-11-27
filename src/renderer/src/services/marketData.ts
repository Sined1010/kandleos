import { timeZoneForSymbol } from '../../../shared/calendar'
import { aggregateMonths } from '../../../shared/candles'
import { t } from '../../../shared/i18n'
import { phaseAt } from '../../../shared/market'
import {
  alpacaKnows,
  cryptoQuoteAsset,
  isCrypto,
  TF_MONTHS,
  type Candle,
  type CandleData,
  type OlderRequest,
  type Quote,
  type StockSource,
  type Timeframe
} from '../../../shared/types'
import { ipcError } from '../lib/format'
import { pollErrors } from '../lib/pollErrors'
import { socket } from './socket'

const BINANCE = 'https://api.binance.com/api/v3'
const BINANCE_WS = 'wss://stream.binance.com:9443'
// Binance has no candles longer than a month: quarters, half-years and years are built from monthly ones.
const BINANCE_TF: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '1D': '1d',
  '1W': '1w',
  '1M': '1M',
  '3M': '1M',
  '6M': '1M',
  '12M': '1M'
}

/** Months per candle when Binance's monthly candles have to be combined, else undefined. */
function combined(tf: Timeframe): number | undefined {
  const months = TF_MONTHS[tf]
  return months && months > 1 ? months : undefined
}

const kline = (k: (string | number)[]): Candle => ({
  time: Number(k[0]) / 1000,
  open: +k[1],
  high: +k[2],
  low: +k[3],
  close: +k[4],
  volume: +k[5]
})

/** `endTime` is matched against a bar's close (ms), so `open - 1` ends just before that bar; `startTime` against its open. */
async function klines(symbol: string, interval: string, limit: number, endTime?: number, startTime?: number): Promise<Candle[]> {
  const end = (endTime === undefined ? '' : `&endTime=${endTime}`) + (startTime === undefined ? '' : `&startTime=${startTime}`)
  // A reply that stalls (half-open connection after a network change) must not keep the chart loading for good.
  const res = await fetch(`${BINANCE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}${end}`, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(t('Binance: {symbol} nicht gefunden (HTTP {status})', { symbol, status: res.status }))
  return ((await res.json()) as (string | number)[][]).map(kline)
}

/** Keeps the last charts (src/mobile/candleCache.ts): on the phone in files, on the PC in memory only. */
interface CandleCacheLike {
  put(symbol: string, tf: Timeframe, c: CandleData): Promise<void>
  get(symbol: string, tf: Timeframe): CandleData | null
}
let cache: CandleCacheLike | null = null
export const setCandleCache = (c: CandleCacheLike): void => void (cache = c)
// Candles with pre-market and after-hours bars get a slot of their own (the file name turns '+' into '_').
const slot = (symbol: string, extended: boolean) => (extended ? symbol + '+ext' : symbol)
export const cachedCandles = (symbol: string, tf: Timeframe, extended = false): CandleData | null =>
  cache?.get(slot(symbol, extended), tf) ?? null

export async function loadCandles(
  symbol: string,
  tf: Timeframe,
  finnhubKey: string,
  extended = false,
  older?: OlderRequest
): Promise<CandleData> {
  if (!cache || older) return fetchCandles(symbol, tf, finnhubKey, extended, older)
  try {
    const data = await fetchCandles(symbol, tf, finnhubKey, extended)
    cache.put(slot(symbol, extended), tf, data).catch(() => {})
    return data
  } catch (e) {
    // Offline or source error: the last stored candles rather than an empty chart, marked with the reason.
    const kept = cachedCandles(symbol, tf, extended)
    if (kept) return { ...kept, stale: (e as Error).message || 'offline' }
    throw e
  }
}

/** Straight from the source, without the stored copies (the alarm checks: they have no use for a stale copy). */
export async function fetchCandles(
  symbol: string,
  tf: Timeframe,
  finnhubKey: string,
  extended = false,
  older?: OlderRequest,
  from?: number
): Promise<CandleData> {
  if (!isCrypto(symbol)) return window.api.stockCandles(symbol, tf, finnhubKey, extended, older)
  // Sections before a time come from the bar size itself; month-based charts load all history at once. The alarm
  // catch-up reads on from its last check (`from`): the newest 1000 bars alone leave a gap after a few days away.
  const candles = await klines(symbol, BINANCE_TF[tf], 1000, older && older.before * 1000 - 1, from && from * 1000)
  const months = combined(tf)
  return {
    candles: months ? aggregateMonths(candles, months) : candles,
    currency: cryptoQuoteAsset(symbol),
    provider: 'binance'
  }
}

/** Live bars for a crypto chart; `onReconnect` after a drop, when the stream may have missed bars. */
export function watchCandles(symbol: string, tf: Timeframe, onBar: (c: Candle) => void, onReconnect?: () => void): () => void {
  const url = `${BINANCE_WS}/ws/${symbol.toLowerCase()}@kline_${BINANCE_TF[tf]}`
  const toBar = (k: any): Candle => ({ time: k.t / 1000, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v })
  const months = combined(tf)
  if (!months) return socket(url, ({ k }) => onBar(toBar(k)), (_ws, again) => again && onReconnect?.())
  // The stream only updates the running month; the period's earlier months come from one REST call.
  // Until they are in, nothing is sent: a period built from the current month alone would be wrong.
  const bars = new Map<number, Candle>()
  let seeded = false
  const send = () => {
    if (!seeded) return
    const period = aggregateMonths([...bars.values()].sort((a, b) => a.time - b.time), months)
    onBar(period[period.length - 1])
  }
  const seed = () =>
    klines(symbol, '1M', 12)
      .then((list) => {
        // A month the stream already delivered is newer than the REST copy.
        for (const c of list) if (!bars.has(c.time)) bars.set(c.time, c)
        seeded = true
        send()
      })
      // Tried again when the stream opens again; until then the period gets no live bar.
      .catch(() => {})
  void seed()
  return socket(
    url,
    ({ k }) => {
      const bar = toBar(k)
      bars.set(bar.time, bar)
      send()
    },
    (_ws, again) => {
      if (!seeded) void seed()
      if (again) onReconnect?.()
    }
  )
}

export interface FeedStatus {
  state: 'off' | 'checking' | 'connecting' | 'live' | 'error'
  detail?: string
  /** unix seconds of the last Finnhub trade received */
  lastTrade?: number
}

/**
 * Live quotes: Binance ticker for crypto; for stocks polling of the chosen source via IPC (Alpaca every 5 s,
 * its free real-time IEX prices; Yahoo every 15 s), plus Finnhub trades with a valid key.
 * `onStatus` reports the Finnhub connection, `onStockError` why the stock source sent nothing, for the status badge.
 */
export function watchQuotes(
  symbols: string[],
  finnhubKey: string,
  source: StockSource | null,
  onQuote: (s: string, q: Quote) => void,
  onStatus: (s: FeedStatus) => void,
  onStockError: (e: string | null) => void
): () => void {
  const crypto = symbols.filter(isCrypto)
  // Without a stock source there are no stock prices; Finnhub trades need a polled quote to build on.
  const stocks = source === 'alpaca' || source === 'yahoo' ? symbols.filter((s) => !isCrypto(s)) : []
  if (!stocks.length) finnhubKey = ''
  const cleanups: (() => void)[] = []
  let active = true

  let error: string | null | undefined // undefined = key check still running
  let wsOpen = false
  let lastTrade: number | undefined
  let lastReport = 0
  const report = () => {
    if (!active) return
    lastReport = Date.now()
    if (!finnhubKey) onStatus({ state: 'off' })
    else if (error === undefined) onStatus({ state: 'checking' })
    else if (error) onStatus({ state: 'error', detail: error })
    else onStatus(wsOpen || !stocks.length ? { state: 'live', lastTrade } : { state: 'connecting' })
  }
  report()

  if (crypto.length) {
    const streams = crypto.map((s) => `${s.toLowerCase()}@ticker`).join('/')
    cleanups.push(
      socket(`${BINANCE_WS}/stream?streams=${streams}`, ({ data: d }) =>
        onQuote(d.s, { price: +d.c, changePct: +d.P, time: d.E / 1000 })
      )
    )
  }

  // Latest polled quote per stock: the previous close for live changes, the regular price for extended hours.
  const polled: Record<string, Quote> = {}
  // Time of the latest Finnhub trade per stock: a slower poll must not put an older price over it.
  const traded: Record<string, number> = {}
  const stockError = pollErrors()
  let groups = 0
  const poll = (list = stocks, group = 0) =>
    window.api
      .stockQuotes(list)
      .then(({ quotes, error: sourceError }) => {
        if (!active) return
        onStockError(stockError.report(group, sourceError))
        for (const [s, q] of Object.entries(quotes)) {
          polled[s] = q
          if (!(traded[s] > q.time)) onQuote(s, q)
        }
      })
      .catch((e) => active && onStockError(stockError.report(group, ipcError(e))))
  const startPolling = (list = stocks, ms = source === 'alpaca' ? 5_000 : 15_000) => {
    if (!list.length) return
    const group = ++groups
    stockError.start(group)
    // The slow group once right away: until each group has answered, the first poll's error stays (pollErrors), and
    // a minute is long for it. The fast ones answer within seconds; asking them now would ask every stock twice.
    if (ms > 15_000) poll(list, group)
    const id = setInterval(() => poll(list, group), ms)
    cleanups.push(() => clearInterval(id))
  }
  let fellBack = false
  const openFinnhub = () =>
    cleanups.push(
      socket(
        `wss://ws.finnhub.io?token=${encodeURIComponent(finnhubKey)}`,
        (msg) => {
          if (msg.type === 'error') {
            error = msg.msg ?? t('Finnhub-Fehler')
            // E.g. too many symbols for the free plan: the US stocks go back to normal polling.
            if (!fellBack) {
              fellBack = true
              startPolling(stocks.filter(alpacaKnows))
            }
            return report()
          }
          if (msg.type !== 'trade') return
          // One message can carry hundreds of trades; only the latest per symbol matters.
          const latest: Record<string, { p: number; t: number }> = {}
          for (const t of msg.data) latest[t.s] = t
          for (const [s, t] of Object.entries(latest)) {
            const base = polled[s]
            const time = t.t / 1000
            if (!base?.prevClose) continue
            traded[s] = time
            // Trades outside the regular session update the extra pre-/after-market price, not the regular one.
            const phase = phaseAt(s, base.timezone ?? timeZoneForSymbol(s), time)
            if (phase === 'pre' || phase === 'post')
              onQuote(s, { ...base, ext: { phase, price: t.p, changePct: (t.p / base.price - 1) * 100, time } })
            else if (phase === 'open' || phase === null)
              onQuote(s, { price: t.p, changePct: (t.p / base.prevClose - 1) * 100, time, prevClose: base.prevClose })
          }
          lastTrade = Date.now() / 1000
          if (Date.now() - lastReport > 5000) report()
        },
        (ws) => {
          // US listings only: Finnhub answers e.g. WEED.TO with "Invalid symbol", which would mark the feed as failed.
          stocks.filter(alpacaKnows).forEach((symbol) => ws.send(JSON.stringify({ type: 'subscribe', symbol })))
          wsOpen = true
          report()
        },
        () => {
          wsOpen = false
          report()
        }
      )
    )

  if (stocks.length) poll()
  if (!finnhubKey) {
    if (stocks.length) startPolling()
  } else {
    window.api
      .finnhubCheck(finnhubKey)
      .catch(() => t('Finnhub nicht erreichbar'))
      .then((err) => {
        if (!active) return
        error = err
        report()
        if (!stocks.length) return
        // An invalid key would only make the socket reconnect forever; fall back to polling.
        if (err) startPolling()
        else {
          openFinnhub()
          // Finnhub's free stream has US listings only; other exchanges, indices and commodities keep being polled.
          startPolling(stocks.filter((s) => !alpacaKnows(s)))
          // The trades build on the polled quote: a slow poll keeps its previous close current (the app left open
          // overnight) and covers stocks without trades and a dropped stream.
          startPolling(stocks.filter(alpacaKnows), 60_000)
        }
      })
  }

  return () => {
    active = false
    cleanups.forEach((c) => c())
  }
}
