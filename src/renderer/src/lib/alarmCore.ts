// Checking price alarms while KandleOS is open, the same on PC and phone. What differs (where alarms live, how to
// load bars, how to notify, the phone's background check) comes in as `deps`, so this file runs without the window.
import { checkedAfter, hit, type Alarm } from '../../../shared/alarms.ts'

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
}

export function createAlarmWatch(deps: AlarmDeps) {
  const firing = new Set<string>()
  const armedNow = (id: string) => deps.alarms().find((x) => x.id === id && x.triggeredAt === undefined)

  /** Marks the alarm reached and notifies, once, even when several checks hit it at the same moment. */
  async function fire(a: Alarm, at: { time: number; price: number }): Promise<void> {
    if (firing.has(a.id)) return
    firing.add(a.id)
    try {
      await deps.collect()
      if (!armedNow(a.id)) return
      deps.update((list) =>
        list.map((x) => (x.id === a.id && x.triggeredAt === undefined ? { ...x, triggeredAt: at.time, triggeredPrice: at.price, checkedUntil: at.time } : x))
      )
      await deps.notify(a)
    } finally {
      firing.delete(a.id)
    }
  }

  return {
    fire,
    /** A live price (seconds): fires every armed alarm of the symbol it reaches. */
    async onPrice(symbol: string, price: number, time: number): Promise<void> {
      const due = deps.alarms().filter((a) => a.symbol === symbol && a.triggeredAt === undefined)
      await Promise.all(
        due.filter((a) => hit({ ...a, checkedUntil: time }, [{ time, high: price, low: price }])).map((a) => fire(a, { time, price: a.price }))
      )
    },
    /** Bars since the last check, so a spike while KandleOS was closed still counts. */
    async catchUp(): Promise<void> {
      for (const a of deps.alarms().filter((x) => x.triggeredAt === undefined && deps.checkable(x))) {
        try {
          const { candles, stale } = await deps.loadBars(a.symbol)
          if (stale) continue
          // Read again: the alarm may have fired, been re-armed or deleted while the bars loaded.
          const fresh = armedNow(a.id)
          if (!fresh) continue
          const h = hit(fresh, candles)
          if (h) await fire(fresh, h)
          else if (candles.length) {
            // The newest bar may still move, so it is looked at again next time.
            const last = candles[candles.length - 1].time
            deps.update((list) => list.map((x) => (x.id === a.id ? { ...x, checkedUntil: checkedAfter(x, last) } : x)))
          }
        } catch {
          // offline or source error: tried again on the next catch-up
        }
      }
    }
  }
}
