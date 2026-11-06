// Price alarms on the PC: checked while KandleOS runs (also hidden in the notification area), reported as a system
// notification. The rule is lib/alarmCore.ts, shared with the phone; alarms sync between both (shared/sync.ts).
import { alarmClock, type Alarm } from '../../../shared/alarms'
import { t } from '../../../shared/i18n'
import { planAlarm } from '../../../mobile/alarmPlan'
import { createAlarmWatch } from '../lib/alarmCore'
import { formatPrice } from '../lib/format'
import { loadCandles } from './marketData'
import { useQuotes, useStore } from '../store/useStore'

export const alarmTitle = (a: Alarm): string =>
  t('{name} hat {price} erreicht', { name: useStore.getState().names[a.symbol] ?? a.symbol, price: formatPrice(a.price) })

const CATCH_UP_MS = 5 * 60 * 1000

/** Live prices against the armed alarms, and a catch-up over the last bars at start and every 5 minutes. */
export function startPcAlarmWatch(): () => void {
  let alpacaKeys = false
  const watch = createAlarmWatch({
    alarms: () => useStore.getState().alarms,
    update: (fn) => useStore.setState((s) => ({ alarms: fn(s.alarms) })),
    checkable: (a) => {
      const s = useStore.getState()
      return !('skip' in planAlarm(a, { stockSource: s.stockSource, yahooExtra: s.yahooExtra, alpacaKeys }))
    },
    loadBars: (symbol) => loadCandles(symbol, '5m', useStore.getState().finnhubKey),
    notify: async (a) => window.api.notify(alarmTitle(a), t('Kurs-Alarm von KandleOS')),
    collect: async () => {}
  })
  const off = useQuotes.subscribe((q) => {
    for (const sym of new Set(useStore.getState().alarms.filter((a) => a.triggeredAt === undefined).map((a) => a.symbol))) {
      const quote = q.quotes[sym]
      if (quote) void watch.onPrice(sym, quote.price, alarmClock(quote.time))
    }
  })
  const catchUp = async () => {
    alpacaKeys = await window.api.alpacaHasKeys()
    await watch.catchUp()
  }
  void catchUp()
  const id = setInterval(() => void catchUp(), CATCH_UP_MS)
  return () => {
    off()
    clearInterval(id)
  }
}
