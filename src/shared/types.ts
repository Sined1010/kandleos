export const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1D', '1W', '1M', '3M', '6M', '12M'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

// shortcut: month-based candles are taken as 30 days per month here (drawing math beyond the data only);
// bar edges, live ticks and the forecast axis use real calendar months via TF_MONTHS.
export const TF_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14400,
  '1D': 86400,
  '1W': 604800,
  '1M': 2592000,
  '3M': 7776000,
  '6M': 15552000,
  '12M': 31104000
}

/** Calendar months per candle for month-based timeframes (quarters, half-years and years start in January). */
export const TF_MONTHS: Partial<Record<Timeframe, number>> = { '1M': 1, '3M': 3, '6M': 6, '12M': 12 }

/** Button label; month candles read "1Mo", "3Mo", ... so they are not confused with the range presets (1M, 3M, 6M). */
export const tfLabel = (tf: Timeframe): string => (TF_MONTHS[tf] ? tf + 'o' : tf)

/** Chronos-2 needs some history to work with; fewer candles give no forecast. */
export const FORECAST_MIN_BARS = 32

/**
 * How many of Chronos-2's 64 forecast steps are shown: at most `max` (the chosen forecast length), at most a
 * quarter of the history the model saw (a short history says little about the far future) and at most five
 * years ahead for month-based candles.
 */
export function forecastSteps(tf: Timeframe, bars: number, max = 64): number {
  const months = TF_MONTHS[tf]
  return Math.min(max, 64, Math.floor(bars / 4), months ? Math.floor(60 / months) : 64)
}

/** time = bar open in UTC seconds */
export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Quote {
  price: number
  changePct: number
  time: number
  prevClose?: number
  /** IANA time zone of the exchange, when the quote source names it (Yahoo). */
  timezone?: string
  /**
   * Latest pre-market or after-hours price (US stocks), shown next to the regular one; `changePct` is
   * relative to the regular close `price`.
   */
  ext?: { phase: 'pre' | 'post'; price: number; changePct: number; time: number }
}

/** Where stock prices come from: Alpaca (own key), Yahoo Finance (unofficial, opt-in) or none (crypto only). */
export type StockSource = 'alpaca' | 'yahoo' | 'none'
export const STOCK_SOURCES: StockSource[] = ['alpaca', 'yahoo', 'none']

/** Indices, futures, currencies and foreign listings (^GSPC, GC=F, EURUSD=X, SAP.DE) are not on Alpaca. */
export const alpacaKnows = (symbol: string): boolean => !/[\^=]/.test(symbol) && !/\.[A-Z]{2,}$/.test(symbol)

/** Which source serves a stock symbol, null with stocks off. With Alpaca, the Yahoo extra takes what Alpaca lacks. */
export function stockRoute(source: StockSource | null, yahooExtra: boolean, symbol: string): 'alpaca' | 'yahoo' | null {
  if (source === 'alpaca') return yahooExtra && !alpacaKnows(symbol) ? 'yahoo' : 'alpaca'
  return source === 'yahoo' ? 'yahoo' : null
}

export interface SearchResult {
  symbol: string
  name: string
  exchange: string
}

/** What the info button shows about a stock; every field is optional because the sources differ. */
export interface CompanyInfo {
  source: 'Finnhub' | 'Yahoo Finance'
  name?: string
  /** What the company does; Yahoo only, in English. */
  description?: string
  sector?: string
  industry?: string
  country?: string
  exchange?: string
  currency?: string
  /** In `currency` units. */
  marketCap?: number
  employees?: number
  /** https only, so the window can open it. */
  website?: string
  /** Date of the IPO, YYYY-MM-DD (Finnhub only). */
  ipo?: string
  pe?: number
  /** In percent. */
  dividendYield?: number
  beta?: number
  high52?: number
  low52?: number
}

// Starts with a letter, digit or ^ (indices): the symbol also names a results folder, so ".." must never pass.
export const SYMBOL_RE = /^[A-Z0-9^][A-Z0-9.\-^=]{0,19}$/
/** Formats of the stored API keys (empty Finnhub key = none). */
export const FINNHUB_KEY_RE = /^[A-Za-z0-9]{0,64}$/
export const ALPACA_KEY_RE = /^[A-Za-z0-9]{10,80}$/

export interface CandleData {
  candles: Candle[]
  /** ISO code as the exchange reports it, e.g. USD, EUR, GBp (pence); '' if unknown */
  currency: string
  /** IANA time zone of the exchange (stocks only), e.g. America/New_York; drives the trading calendar. */
  timezone?: string
}

// shortcut: market is guessed from the quote-currency suffix; add an explicit market field if exotic tickers collide.
const CRYPTO_RE = /^[A-Z0-9]{2,}(USDT|USDC|FDUSD|BTC|ETH|BNB)$/
export const isCrypto = (symbol: string): boolean => CRYPTO_RE.test(symbol)
/** BTCUSDT → USDT */
export const cryptoQuoteAsset = (symbol: string): string => CRYPTO_RE.exec(symbol)?.[1] ?? ''
