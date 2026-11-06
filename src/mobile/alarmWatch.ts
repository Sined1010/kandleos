import { App as CapApp } from '@capacitor/app'
import { alarmClock } from '../shared/alarms'
import { t } from '../shared/i18n'
import { createAlarmWatch } from '../renderer/src/lib/alarmCore'
import { alarmTitle } from '../renderer/src/services/alarmWatch'
import { loadCandles } from '../renderer/src/services/marketData'
import { useQuotes, useStore } from '../renderer/src/store/useStore'
import { planAlarm } from './alarmPlan'
import { KandleNative, type NativeAlarm } from './native'

const armed = () => useStore.getState().alarms.filter((a) => a.triggeredAt === undefined)
/** Android wants an int id per notification; one per alarm, so a repeat replaces instead of stacking. */
export const notificationId = (id: string) => parseInt(id.replace(/-/g, '').slice(0, 7), 16)

/** What the background check found; merged first, so an alarm it already reported is not reported again. */
async function collectNative(): Promise<void> {
  const { list } = await KandleNative.takeTriggered().catch(() => ({ list: [] }))
  if (list.length) useStore.getState().applyNative(list)
}

let alpacaKeys = false
const watch = createAlarmWatch({
  alarms: () => useStore.getState().alarms,
  update: (fn) => useStore.setState((s) => ({ alarms: fn(s.alarms) })),
  checkable: (a) => {
    const s = useStore.getState()
    return !('skip' in planAlarm(a, { stockSource: s.stockSource, yahooExtra: s.yahooExtra, alpacaKeys }))
  },
  loadBars: (symbol) => loadCandles(symbol, '5m', useStore.getState().finnhubKey),
  notify: (a) => KandleNative.showNotification({ id: notificationId(a.id), title: alarmTitle(a), body: t('Kurs-Alarm von KandleOS') }).catch(() => {}),
  collect: collectNative
})

/** The armed alarms go to the Android background check (AlarmWorker / AlarmService). */
async function syncNative(): Promise<void> {
  await collectNative()
  const s = useStore.getState()
  alpacaKeys = await window.api.alpacaHasKeys()
  const alarms: NativeAlarm[] = armed().flatMap((a) => {
    const p = planAlarm(a, { stockSource: s.stockSource, yahooExtra: s.yahooExtra, alpacaKeys })
    if ('skip' in p) return []
    return [{ id: a.id, symbol: a.symbol, title: alarmTitle(a), op: a.op, price: a.price, checkedUntil: a.checkedUntil ?? a.createdAt, ...p }]
  })
  await KandleNative.setAlarms({ alarms, instant: s.instantAlarms }).catch(() => {})
}

/** What the background check found while the app was closed, then the app's own catch-up. */
async function refresh(): Promise<void> {
  await collectNative()
  alpacaKeys = await window.api.alpacaHasKeys()
  await watch.catchUp()
  await syncNative()
}

/** While the app is open: live prices against the alarms, plus a catch-up on start and on every return. */
export function startAlarmWatch(): () => void {
  const off = useQuotes.subscribe((q) => {
    for (const sym of new Set(armed().map((a) => a.symbol))) {
      const quote = q.quotes[sym]
      if (quote) void watch.onPrice(sym, quote.price, alarmClock(quote.time))
    }
  })
  void refresh()
  const resume = CapApp.addListener('resume', () => void refresh())
  const offSync = useStore.subscribe((s, prev) => {
    if (s.alarms !== prev.alarms || s.instantAlarms !== prev.instantAlarms) void syncNative()
  })
  return () => {
    off()
    offSync()
    void resume.then((l) => l.remove())
  }
}
