import {
  cryptoQuoteAsset,
  isCrypto,
  type Candle,
  type CandleData,
  type Quote,
  type Timeframe
} from '../../../shared/types'

const BINANCE = 'https://api.binance.com/api/v3'
const BINANCE_WS = 'wss://stream.binance.com:9443'
const BINANCE_TF: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1D': '1d',
  '1W': '1w',
  '1M': '1M'
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

export async function loadCandles(symbol: string, tf: Timeframe, finnhubKey: string): Promise<CandleData> {
  if (!isCrypto(symbol)) return window.api.stockCandles(symbol, tf, finnhubKey)
  const res = await fetch(`${BINANCE}/klines?symbol=${symbol}&interval=${BINANCE_TF[tf]}&limit=1000`)
  if (!res.ok) throw new Error(`Binance: ${symbol} nicht gefunden (HTTP ${res.status})`)
  const rows: (string | number)[][] = await res.json()
  const candles = rows.map((k) => ({
    time: Number(k[0]) / 1000,
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
    volume: +k[5]
  }))
  return { candles, currency: cryptoQuoteAsset(symbol) }
}

/** Live bars for a crypto chart. */
export function watchCandles(symbol: string, tf: Timeframe, onBar: (c: Candle) => void): () => void {
  return socket(`${BINANCE_WS}/ws/${symbol.toLowerCase()}@kline_${BINANCE_TF[tf]}`, ({ k }) =>
    onBar({ time: k.t / 1000, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v })
  )
}

export interface FeedStatus {
  state: 'off' | 'checking' | 'connecting' | 'live' | 'error'
  detail?: string
  /** unix seconds of the last Finnhub trade received */
  lastTrade?: number
}

/**
 * Live quotes: Binance ticker for crypto; Finnhub trades (valid key) or Yahoo polling via IPC for stocks.
 * `onStatus` reports the Finnhub connection for the status badge.
 */
export function watchQuotes(
  symbols: string[],
  finnhubKey: string,
  onQuote: (s: string, q: Quote) => void,
  onStatus: (s: FeedStatus) => void
): () => void {
  const crypto = symbols.filter(isCrypto)
  const stocks = symbols.filter((s) => !isCrypto(s))
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

  const prevClose: Record<string, number> = {}
  const poll = () =>
    window.api
      // A rejected key is not sent again, so quotes come straight from Yahoo.
      .stockQuotes(stocks, error ? '' : finnhubKey)
      .then((quotes) => {
        if (!active) return
        for (const [s, q] of Object.entries(quotes)) {
          if (q.prevClose) prevClose[s] = q.prevClose
          onQuote(s, q)
        }
      })
      .catch((e) => console.warn('Aktienkurse:', e))
  const startPolling = () => {
    const id = setInterval(poll, 15_000)
    cleanups.push(() => clearInterval(id))
  }
  const openFinnhub = () =>
    cleanups.push(
      socket(
        `wss://ws.finnhub.io?token=${encodeURIComponent(finnhubKey)}`,
        (msg) => {
          if (msg.type === 'error') {
            error = msg.msg ?? 'Finnhub-Fehler'
            return report()
          }
          if (msg.type !== 'trade') return
          // One message can carry hundreds of trades; only the latest per symbol matters.
          const latest: Record<string, { p: number; t: number }> = {}
          for (const t of msg.data) latest[t.s] = t
          for (const [s, t] of Object.entries(latest)) {
            const pc = prevClose[s]
            if (pc) onQuote(s, { price: t.p, changePct: (t.p / pc - 1) * 100, time: t.t / 1000, prevClose: pc })
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
      .catch(() => 'Finnhub nicht erreichbar')
      .then((err) => {
        if (!active) return
        error = err
        report()
        if (!stocks.length) return
        // An invalid key would only make the socket reconnect forever; fall back to Yahoo polling.
        if (err) startPolling()
        else openFinnhub()
      })
  }

  return () => {
    active = false
    cleanups.forEach((c) => c())
  }
}
