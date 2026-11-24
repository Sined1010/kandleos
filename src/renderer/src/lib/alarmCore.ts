// Checking price alarms while KandleOS is open, the same on PC and phone. What differs (where alarms live, how to
// load bars, how to notify, the phone's background check) comes in as `deps`, so this file runs without the window.
import { checkedAfter, hit, isArmed, type Alarm } from '../../../shared/alarms.ts'
import type { Knot } from '../../../shared/lineAlarm.ts'

export interface AlarmDeps {
  alarms(): Alarm[]
  update(fn: (alarms: Alarm[]) => Alarm[]): void
  /** Whether there is a price source for the alarm's symbol. */
  checkable(a: Alarm): boolean
  /** 5-minute bars of the symbol; `stale` set = only a saved copy (offline). */
  loadBars(symbol: string): Promise<{ candles: { time: number; high: number; low: number }[]; stale?: unknown }>
  notify(a: Alarm): Promise<void>
  /** Phone: take over what the background check already reported, before reporting it again. */
  collect(): Promise<void>
  /** Line alarms only: where the line runs (lib/lineAlarms.ts); `until` = the drawing's alarm end. */
  knotsFor?(a: Alarm, now: number): { knots: Knot[]; until?: number } | 'missing'
}

export function createAlarmWatch(deps: AlarmDeps) {
  const firing = new Set<string>()
  const armedNow = (id: string) => deps.alarms().find((x) => x.id === id && isArmed(x))
  /** Fixed alarms: no table. Line alarms: the table, or null when the drawing is not here (then nothing is checked). */
  const tableOf = (a: Alarm, now: number) => {
    if (!a.line) return { knots: undefined, until: undefined }
    const t = deps.knotsFor?.(a, now) ?? 'missing'
    return t === 'missing' ? null : t
  }

  /** Marks the alarm reached and notifies, once, even when several checks hit it at the same moment. */
  async function fire(a: Alarm, at: { time: number; price: number }): Promise<void> {
    if (firing.has(a.id)) return
    firing.add(a.id)
    try {
      await deps.collect()
      if (!armedNow(a.id)) return
      deps.update((list) =>
        list.map((x) => (x.id === a.id && isArmed(x) ? { ...x, triggeredAt: at.time, triggeredPrice: at.price, checkedUntil: at.time } : x))
      )
      await deps.notify({ ...a, triggeredAt: at.time, triggeredPrice: at.price })
    } finally {
      firing.delete(a.id)
    }
  }

  return {
    fire,
    /** A live price (seconds): fires every armed alarm of the symbol it reaches. */
    async onPrice(symbol: string, price: number, time: number): Promise<void> {
      const due = deps.alarms().filter((a) => a.symbol === symbol && isArmed(a))
      await Promise.all(
        due.map((a) => {
          const table = tableOf(a, time)
          const h = table && hit({ ...a, checkedUntil: time }, [{ time, high: price, low: price }], table.knots)
          return h ? fire(a, h) : undefined
        })
      )
    },
    /** Bars since the last check, so a spike while KandleOS was closed still counts. */
    async catchUp(): Promise<void> {
      for (const a of deps.alarms().filter((x) => isArmed(x) && deps.checkable(x))) {
        try {
          if (!tableOf(a, Math.floor(Date.now() / 1000))) continue
          const { candles, stale } = await deps.loadBars(a.symbol)
          if (stale) continue
          // Read again: the alarm may have fired, been re-armed or deleted while the bars loaded.
          const fresh = armedNow(a.id)
          if (!fresh) continue
          const table = tableOf(fresh, Math.floor(Date.now() / 1000))
          if (!table) continue
          const h = hit(fresh, candles, table.knots)
          if (h) await fire(fresh, h)
          else if (candles.length) {
            // The newest bar may still move, so it is looked at again next time.
            const last = candles[candles.length - 1].time
            // Past the line's end without a touch: run out, quietly. The end of a year-ahead table is no end.
            const ran = table.until !== undefined && last > table.until ? table.until : undefined
            deps.update((list) =>
              list.map((x) => (x.id === a.id ? { ...x, checkedUntil: checkedAfter(x, last), ...(ran !== undefined && { expiredAt: ran }) } : x))
            )
          }
        } catch {
          // offline or source error: tried again on the next catch-up
        }
      }
    }
  }
}
