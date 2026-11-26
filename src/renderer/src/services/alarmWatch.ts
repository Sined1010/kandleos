// Price alarms on the PC: checked while KandleOS runs (also hidden in the notification area), reported as a system
// notification. The rule is lib/alarmCore.ts, shared with the phone; alarms sync between both (shared/sync.ts).
import { alarmClock, isArmed, type Alarm } from '../../../shared/alarms'
import { t } from '../../../shared/i18n'
import { planAlarm } from '../../../mobile/alarmPlan'
import { createAlarmWatch, type AlarmNote } from '../lib/alarmCore'
import { formatPrice } from '../lib/format'
import { knotsFor, lineLabel } from '../lib/lineAlarms'
import { fetchCandles } from './marketData'
import { useQuotes, useStore } from '../store/useStore'

/** Notification title: the price reached, or which line was touched. */
export function alarmTitle(a: Alarm): string {
  const { names, drawings } = useStore.getState()
  const name = names[a.symbol] ?? a.symbol
  return a.line ? t('{name} · {line} berührt', { name, line: lineLabel(a, drawings) }) : t('{name} hat {price} erreicht', { name, price: formatPrice(a.price) })
}

/**
 * Notification text: for a line, the price where it was touched (`price` given = a template for Android); for a box,
 * whether its entry was never touched or target and stop fell in one bar.
 */
export function alarmBody(a: Alarm, price?: string, note?: AlarmNote): string {
  if (!a.line) return t('Kurs-Alarm von KandleOS')
  const p = price ?? formatPrice(a.triggeredPrice ?? a.price)
  if (note === 'no-entry' && a.box) return t('bei {price} · Einstieg {entry} wurde vorher nicht erreicht', { price: p, entry: formatPrice(a.box.entry) })
  if (note === 'same-bar') return t('bei {price} · Ziel und Stop in derselben Kerze', { price: p })
  return t('bei {price}', { price: p })
}

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
    loadBars: (symbol) => fetchCandles(symbol, '5m', useStore.getState().finnhubKey),
    notify: async (a, note) => window.api.notify(alarmTitle(a), alarmBody(a, undefined, note)),
    collect: async () => {},
    knotsFor: (a, now) => knotsFor(a, useStore.getState().drawings, now)
  })
  const off = useQuotes.subscribe((q) => {
    for (const sym of new Set(useStore.getState().alarms.filter(isArmed).map((a) => a.symbol))) {
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
