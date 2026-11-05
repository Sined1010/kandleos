import { App as CapApp } from '@capacitor/app'
import { hit, type Alarm } from '../shared/alarms'
import { t } from '../shared/i18n'
import { formatPrice } from '../renderer/src/lib/format'
import { loadCandles } from '../renderer/src/services/marketData'
import { useQuotes, useStore } from '../renderer/src/store/useStore'
import { planAlarm } from './alarmPlan'
import { KandleNative, type NativeAlarm } from './native'

const now = () => Math.floor(Date.now() / 1000)
const armed = () => useStore.getState().alarms.filter((a) => a.triggeredAt === undefined)
/** Android wants an int id per notification; one per alarm, so a repeat replaces instead of stacking. */
const notificationId = (id: string) => parseInt(id.replace(/-/g, '').slice(0, 7), 16)

const titleOf = (a: Alarm) =>
  t('{name} hat {price} erreicht', { name: useStore.getState().names[a.symbol] ?? a.symbol, price: formatPrice(a.price) })
const isArmed = (id: string) => useStore.getState().alarms.some((x) => x.id === id && x.triggeredAt === undefined)
const firing = new Set<string>()

/** What the background check found; merged first, so an alarm it already reported is not reported again. */
async function collectNative(): Promise<void> {
  const { list } = await KandleNative.takeTriggered().catch(() => ({ list: [] }))
  if (list.length) useStore.getState().applyNative(list)
}

async function fire(a: Alarm, at: { time: number; price: number }): Promise<void> {
  if (firing.has(a.id)) return
  firing.add(a.id)
  try {
    await collectNative()
    if (!isArmed(a.id)) return
    useStore.getState().applyNative([{ id: a.id, triggeredAt: at.time, triggeredPrice: at.price, checkedUntil: at.time }])
    await KandleNative.showNotification({ id: notificationId(a.id), title: titleOf(a), body: t('Kurs-Alarm von KandleOS') }).catch(() => {})
  } finally {
    firing.delete(a.id)
  }
}

/** Bars since the last check (5-minute candles), so a spike while the app was closed still counts. */
async function catchUp(): Promise<void> {
  const s = useStore.getState()
  for (const a of armed()) {
    const plan = planAlarm(a, { stockSource: s.stockSource, yahooExtra: s.yahooExtra, alpacaKeys: await window.api.alpacaHasKeys() })
    if ('skip' in plan) continue
    try {
      const { candles, stale } = await loadCandles(a.symbol, '5m', s.finnhubKey)
      if (stale) continue
      // Read again: the alarm may have fired, been re-armed or deleted while the bars loaded.
      const fresh = useStore.getState().alarms.find((x) => x.id === a.id)
      if (!fresh || fresh.triggeredAt !== undefined) continue
      const h = hit(fresh, candles)
      if (h) await fire(fresh, h)
      else if (candles.length) {
        // The newest bar may still move, so it is looked at again next time.
        const last = candles[candles.length - 1].time
        useStore.setState((st) => ({ alarms: st.alarms.map((x) => (x.id === a.id ? { ...x, checkedUntil: last } : x)) }))
      }
    } catch {
      // offline or source error: tried again on the next return to the app
    }
  }
}

/** The armed alarms go to the Android background check (AlarmWorker / AlarmService). */
async function syncNative(): Promise<void> {
  await collectNative()
  const s = useStore.getState()
  const alpacaKeys = await window.api.alpacaHasKeys()
  const alarms: NativeAlarm[] = armed().flatMap((a) => {
    const p = planAlarm(a, { stockSource: s.stockSource, yahooExtra: s.yahooExtra, alpacaKeys })
    if ('skip' in p) return []
    return [{ id: a.id, symbol: a.symbol, title: titleOf(a), op: a.op, price: a.price, checkedUntil: a.checkedUntil ?? a.createdAt, ...p }]
  })
  await KandleNative.setAlarms({ alarms, instant: s.instantAlarms }).catch(() => {})
}

/** What the background check found while the app was closed, then the app's own catch-up. */
async function refresh(): Promise<void> {
  await collectNative()
  await catchUp()
  await syncNative()
}

/** While the app is open: live prices against the alarms, plus a catch-up on start and on every return. */
export function startAlarmWatch(): () => void {
  const off = useQuotes.subscribe((q) => {
    for (const a of armed()) {
      const price = q.quotes[a.symbol]?.price
      if (price === undefined) continue
      const at = now()
      if (hit({ ...a, checkedUntil: at }, [{ time: at, high: price, low: price }])) void fire(a, { time: at, price: a.price })
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
