export const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D', '1W'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

export const TF_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
  '1W': 604800
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
}

export const SYMBOL_RE = /^[A-Z0-9.\-^=]{1,20}$/

// shortcut: market is guessed from the quote-currency suffix; add an explicit market field if exotic tickers collide.
export const isCrypto = (symbol: string): boolean => /^[A-Z0-9]{2,}(USDT|USDC|FDUSD|BTC|ETH|BNB)$/.test(symbol)
