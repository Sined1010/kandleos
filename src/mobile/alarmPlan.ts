import type { Alarm } from '../shared/alarms.ts'
import { isCrypto, stockRoute, type StockSource } from '../shared/types.ts'

/** Where the background check asks for an alarm's bars (Android: AlarmFetch.java). */
export type AlarmSource = { source: 'binance' | 'yahoo' | 'alpaca'; providerSymbol: string }

/** Same routing as the chart (stockRoute); without a usable source the alarm shows "cannot be checked". */
export function planAlarm(
  a: Alarm,
  s: { stockSource: StockSource | null; yahooExtra: boolean; alpacaKeys: boolean }
): AlarmSource | { skip: 'source' } {
  if (isCrypto(a.symbol)) return { source: 'binance', providerSymbol: a.symbol }
  const route = stockRoute(s.stockSource, s.yahooExtra, a.symbol)
  if (route === 'yahoo') return { source: 'yahoo', providerSymbol: a.symbol }
  if (route === 'alpaca' && s.alpacaKeys) return { source: 'alpaca', providerSymbol: a.symbol.replace('-', '.') }
  return { skip: 'source' }
}
