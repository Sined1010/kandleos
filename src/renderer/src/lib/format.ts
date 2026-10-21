export const formatPrice = (p: number): string =>
  p.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: p < 1 ? 6 : p < 10 ? 4 : 2 })

/** "+1.23%" style change, as in the watchlist. */
export const formatChange = (pct: number): string => `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
