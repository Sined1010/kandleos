import { locale } from '../../../shared/i18n.ts'

export const formatPrice = (p: number): string =>
  p.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: p < 1 ? 6 : p < 10 ? 4 : 2 })

/** "+1.23%" style change, as in the watchlist. */
export const formatChange = (pct: number): string => `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`

/** Error text from the main process without Electron's "Error invoking remote method 'x': Error: " prefix. */
export const ipcError = (e: unknown): string => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
