import { useEffect } from 'react'
import { watchQuotes } from './marketData'
import { setFeedStatus, setQuote, setStockError, useStore } from '../store/useStore'

/** Live prices for the watchlist and the chart symbol (desktop App and phone MobileApp). */
export function useQuoteFeed(): void {
  const symbol = useStore((s) => s.symbol)
  const folders = useStore((s) => s.folders)
  const finnhubKey = useStore((s) => s.finnhubKey)
  const stockSource = useStore((s) => s.stockSource)
  const yahooExtra = useStore((s) => s.yahooExtra)
  // Armed price alarms (phone) need live prices even for symbols off the watchlist.
  const alarmSymbols = useStore((s) => s.alarms.filter((a) => a.triggeredAt === undefined).map((a) => a.symbol).join(','))
  // The chart symbol joins the quote feed so stock charts get live ticks even when it is not on the watchlist.
  // Sorted: the feed depends on which symbols are watched, not on their order, so reordering the watchlist
  // keeps the Finnhub and Binance connections open instead of reconnecting.
  const feed = [...new Set([...folders.flatMap((f) => f.symbols), symbol, ...(alarmSymbols ? alarmSymbols.split(',') : [])])].sort().join(',')

  useEffect(() => {
    // A new source starts without the old error; the next poll tells.
    setStockError(null)
    return watchQuotes(feed.split(','), finnhubKey, stockSource, setQuote, setFeedStatus, setStockError)
    // yahooExtra: main routes by it, so the first poll after switching must see it.
  }, [feed, finnhubKey, stockSource, yahooExtra])
}
