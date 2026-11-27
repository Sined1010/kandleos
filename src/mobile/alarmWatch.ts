import { App as CapApp } from '@capacitor/app'
import { alarmClock, isArmed, type Alarm } from '../shared/alarms'
import { partnerOf } from '../shared/boxAlarm'
import { createAlarmWatch, type AlarmNote } from '../renderer/src/lib/alarmCore'
import { knotsFor } from '../renderer/src/lib/lineAlarms'
import { alarmBody, alarmTitle } from '../renderer/src/services/alarmWatch'
import { fetchCandles } from '../renderer/src/services/marketData'
import { storeStopped, useQuotes, useStore } from '../renderer/src/store/useStore'
import { planAlarm } from './alarmPlan'
import { KandleNative, type NativeAlarm } from './native'

const armed = () => useStore.getState().alarms.filter(isArmed)
/** Android wants an int id per notification; one per alarm, so a repeat replaces instead of stacking. */
export const notificationId = (id: string) => parseInt(id.replace(/-/g, '').slice(0, 7), 16)
/** The "reached" notification, whichever device saw the price. */
export const notifyAlarm = (a: Alarm, note?: AlarmNote) =>
  KandleNative.showNotification({ id: notificationId(a.id), title: alarmTitle(a), body: alarmBody(a, undefined, note) }).catch(() => {})

/** What the background check found; merged first, so an alarm it already reported is not reported again. */
async function collectNative(): Promise<void> {
  // A session that saves nothing would take the hits and lose them; they stay with the background check.
  if (storeStopped()) return
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
  loadBars: (symbol, from) => fetchCandles(symbol, '5m', useStore.getState().finnhubKey, false, undefined, from),
  notify: notifyAlarm,
  collect: collectNative,
  knotsFor: (a, now) => knotsFor(a, useStore.getState().drawings, now)
})

/** The armed alarms go to the Android background check (AlarmWorker / AlarmService). */
async function syncNative(): Promise<void> {
  // The store could not be read: its alarms are unknown here, so the background check keeps the ones it has.
  if (storeStopped()) return
  await collectNative()
  const s = useStore.getState()
  alpacaKeys = await window.api.alpacaHasKeys()
  const now = Math.floor(Date.now() / 1000)
  const alarms: NativeAlarm[] = armed().flatMap((a) => {
    const p = planAlarm(a, { stockSource: s.stockSource, yahooExtra: s.yahooExtra, alpacaKeys })
    if ('skip' in p) return []
    const base = { id: a.id, symbol: a.symbol, title: alarmTitle(a), op: a.op, price: a.price, checkedUntil: a.checkedUntil ?? a.createdAt, ...p }
    if (!a.line) return [base]
    // Line alarms: the table the background check reads, and the text it fills in ({price} = where it was touched).
    const table = knotsFor(a, s.drawings, now)
    if (table === 'missing' || !table.knots.length) return []
    const line = { ...base, knots: table.knots, body: alarmBody(a, '{price}') }
    if (!a.box) return [line]
    const pair = partnerOf(a, s.alarms)
    return [
      {
        ...line,
        part: a.line.part as 'target' | 'stop',
        ...(pair && isArmed(pair) && { pair: pair.id }),
        entry: a.box.entry,
        wait: a.box.wait,
        ...(a.box.near && { near: true }),
        ...(a.box.entryAt !== undefined && { entryAt: a.box.entryAt }),
        bodyNoEntry: alarmBody(a, '{price}', 'no-entry')
      }
    ]
  })
  await KandleNative.setAlarms({ alarms, instant: s.instantAlarms }).catch(() => {})
}

// A catch-up writes each alarm on its own; one hand-over after the burst instead of one per write.
let syncTimer: ReturnType<typeof setTimeout> | undefined
function scheduleSync(): void {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = undefined
    void syncNative()
  }, 300)
}
/** Hands over at once what is still waiting (the app goes to the background and may be swiped away). */
function flushSync(): void {
  if (syncTimer === undefined) return
  clearTimeout(syncTimer)
  syncTimer = undefined
  void syncNative()
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
  // Like the PC: bars every 5 minutes while open, so a box (which live prices alone do not decide) still reports.
  const every = setInterval(() => void watch.catchUp(), 5 * 60 * 1000)
  const resume = CapApp.addListener('resume', () => void refresh())
  const pause = CapApp.addListener('pause', flushSync)
  const offSync = useStore.subscribe((s, prev) => {
    // A moved line or a new alarm end changes the table the background check reads.
    const lineMoved = s.drawings !== prev.drawings && s.alarms.some((a) => a.line && s.drawings[a.line.key] !== prev.drawings[a.line.key])
    if (s.alarms !== prev.alarms || s.instantAlarms !== prev.instantAlarms || lineMoved) scheduleSync()
    // An alarm re-armed or deleted (here or on the PC) loses its old "reached" notification: Android would update
    // that one without a sound at the next hit.
    if (s.alarms !== prev.alarms)
      for (const a of prev.alarms)
        if (a.triggeredAt !== undefined && s.alarms.find((x) => x.id === a.id)?.triggeredAt === undefined)
          void KandleNative.cancelNotification({ id: notificationId(a.id) }).catch(() => {})
  })
  return () => {
    off()
    offSync()
    clearInterval(every)
    clearTimeout(syncTimer)
    syncTimer = undefined
    void resume.then((l) => l.remove())
    void pause.then((l) => l.remove())
  }
}
