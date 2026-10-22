import { timeZoneForSymbol } from '../../../shared/calendar'
import { aggregateMonths } from '../../../shared/candles'
import { t } from '../../../shared/i18n'
import { phaseAt } from '../../../shared/market'
import {
  cryptoQuoteAsset,
  isCrypto,
  TF_MONTHS,
  type Candle,
  type CandleData,
  type Quote,
  type StockSource,
  type Timeframe
} from '../../../shared/types'

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

async function klines(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  const res = await fetch(`${BINANCE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)
  if (!res.ok) throw new Error(t('Binance: {symbol} nicht gefunden (HTTP {status})', { symbol, status: res.status }))
  return ((await res.json()) as (string | number)[][]).map(kline)
}

/** WebSocket that reconnects after drops (Binance closes streams every 24h). Returns a close function. */
function socket(
  url: string,
  onMessage: (msg: any) => void,
  onOpen?: (ws: WebSocket) => void,
  onDrop?: () => void
): () => void {
  let ws: WebSocket
  let closed = false
  let timer: ReturnType<typeof setTimeout>
  const connect = () => {
    ws = new WebSocket(url)
    ws.onopen = () => onOpen?.(ws)
    ws.onmessage = (e) => onMessage(JSON.parse(e.data))
    ws.onclose = () => {
      if (closed) return
      onDrop?.()
      timer = setTimeout(connect, 3000)
    }
  }
  connect()
  return () => {
    closed = true
    clearTimeout(timer)
    ws.close()
  }
}

export async function loadCandles(
  symbol: string,
  tf: Timeframe,
  finnhubKey: string,
  extended = false
): Promise<CandleData> {
  if (!isCrypto(symbol)) return window.api.stockCandles(symbol, tf, finnhubKey, extended)
  const candles = await klines(symbol, BINANCE_TF[tf], 1000)
  const months = combined(tf)
  return { candles: months ? aggregateMonths(candles, months) : candles, currency: cryptoQuoteAsset(symbol) }
}

/** Live bars for a crypto chart. */
export function watchCandles(symbol: string, tf: Timeframe, onBar: (c: Candle) => void): () => void {
  const url = `${BINANCE_WS}/ws/${symbol.toLowerCase()}@kline_${BINANCE_TF[tf]}`
  const toBar = (k: any): Candle => ({ time: k.t / 1000, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v })
  const months = combined(tf)
  if (!months) return socket(url, ({ k }) => onBar(toBar(k)))
  // The stream only updates the running month; the period's earlier months come from one REST call.
  // Until they are in, nothing is sent: a period built from the current month alone would be wrong.
  const bars = new Map<number, Candle>()
  let seeded = false
  const send = () => {
    if (!seeded) return
    const period = aggregateMonths([...bars.values()].sort((a, b) => a.time - b.time), months)
    onBar(period[period.length - 1])
  }
  klines(symbol, '1M', 12)
    .then((list) => {
      // A month the stream already delivered is newer than the REST copy.
      for (const c of list) if (!bars.has(c.time)) bars.set(c.time, c)
      seeded = true
      send()
    })
    .catch(() => {})
  return socket(url, ({ k }) => {
    const bar = toBar(k)
    bars.set(bar.time, bar)
    send()
  })
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
 * `onStatus` reports the Finnhub connection for the status badge.
 */
export function watchQuotes(
  symbols: string[],
  finnhubKey: string,
  source: StockSource | null,
  onQuote: (s: string, q: Quote) => void,
  onStatus: (s: FeedStatus) => void
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
  const poll = () =>
    window.api
      // A rejected key is not sent again, so quotes come straight from the chosen source.
      .stockQuotes(stocks, error ? '' : finnhubKey)
      .then((quotes) => {
        if (!active) return
        for (const [s, q] of Object.entries(quotes)) {
          polled[s] = q
          onQuote(s, q)
        }
      })
      .catch((e) => console.warn('Aktienkurse:', e))
  const startPolling = () => {
    const id = setInterval(poll, source === 'alpaca' ? 5_000 : 15_000)
    cleanups.push(() => clearInterval(id))
  }
  const openFinnhub = () =>
    cleanups.push(
      socket(
        `wss://ws.finnhub.io?token=${encodeURIComponent(finnhubKey)}`,
        (msg) => {
          if (msg.type === 'error') {
            error = msg.msg ?? t('Finnhub-Fehler')
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
          stocks.forEach((symbol) => ws.send(JSON.stringify({ type: 'subscribe', symbol })))
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
        else openFinnhub()
      })
  }

  return () => {
    active = false
    cleanups.forEach((c) => c())
  }
}
