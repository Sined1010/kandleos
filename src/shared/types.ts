export const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

export const TF_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
  '1W': 604800,
  // shortcut: a month is taken as 30 days (live ticks, drawing math); exact calendar months only matter at bar edges.
  '1M': 2592000
}

/** Button label; monthly candles read "1Mo" so they are not confused with the "1M" (one month) range preset. */
export const tfLabel = (tf: Timeframe): string => (tf === '1M' ? '1Mo' : tf)

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
}

export interface SearchResult {
  symbol: string
  name: string
  exchange: string
}

export const SYMBOL_RE = /^[A-Z0-9.\-^=]{1,20}$/

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
