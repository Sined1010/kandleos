import type { Quote } from '../../../shared/types'

/**
 * Extra price line for US stocks outside the regular session: the pre-market or after-hours price, or – when the chart
 * already shows those candles – the regular close. Null when the quote has no extended-hours price.
 */
export function sessionLine(quote: Quote | undefined, extended: boolean): { price: number; kind: 'pre' | 'post' | 'close' } | null {
  if (!quote?.ext) return null
  return extended ? { price: quote.price, kind: 'close' } : { price: quote.ext.price, kind: quote.ext.phase }
}
