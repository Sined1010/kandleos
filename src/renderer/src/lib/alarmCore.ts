// Checking price alarms while KandleOS is open, the same on PC and phone. What differs (where alarms live, how to
// load bars, how to notify, the phone's background check) comes in as `deps`, so this file runs without the window.
import { checkedAfter, hit, isArmed, type Alarm } from '../../../shared/alarms.ts'
import { pairWinner, partnerOf, scanBox, settlePairs } from '../../../shared/boxAlarm.ts'
import type { Knot } from '../../../shared/lineAlarm.ts'

/** Extra line for a position box's notification: entry never touched, or target and stop in one bar. */
export type AlarmNote = 'no-entry' | 'same-bar'

export interface AlarmDeps {
  alarms(): Alarm[]
  update(fn: (alarms: Alarm[]) => Alarm[]): void
  /** Whether there is a price source for the alarm's symbol. */
  checkable(a: Alarm): boolean
  /** 5-minute bars of the symbol; `stale` set = only a saved copy (offline). */
  loadBars(symbol: string): Promise<{ candles: { time: number; high: number; low: number }[]; stale?: unknown }>
  notify(a: Alarm, note?: AlarmNote): Promise<void>
  /** Phone: take over what the background check already reported, before reporting it again. */
  collect(): Promise<void>
  /** Line alarms only: where the line runs (lib/lineAlarms.ts); `until` = the drawing's alarm end. */
  knotsFor?(a: Alarm, now: number): { knots: Knot[]; until?: number } | 'missing'
}

/** Seconds since a box's last check after which a live price no longer decides it alone (catch-up runs every 5 min). */
const BOX_TICK_GAP = 15 * 60

const withEntry = (a: Alarm, entryAt: number | undefined): Alarm =>
  a.box && entryAt !== undefined && a.box.entryAt === undefined ? { ...a, box: { ...a.box, entryAt } } : a

export function createAlarmWatch(deps: AlarmDeps) {
  const firing = new Set<string>()
  // The last live price per symbol, to see a box's entry crossed between two of them.
  const lastPrice = new Map<string, number>()
  const armedNow = (id: string) => deps.alarms().find((x) => x.id === id && isArmed(x))
  /** Fixed alarms: no table. Line alarms: the table, or null when the drawing is not here (then nothing is checked). */
  const tableOf = (a: Alarm, now: number) => {
    if (!a.line) return { knots: undefined, until: undefined }
    const t = deps.knotsFor?.(a, now) ?? 'missing'
    return t === 'missing' ? null : t
  }

  /**
   * Marks the alarm reached and notifies, once, even when several checks hit it at the same moment. A box's other
   * side is switched off with it (settlePairs).
   */
  async function fire(a: Alarm, at: { time: number; price: number }, entryAt?: number, note?: AlarmNote): Promise<void> {
    if (firing.has(a.id)) return
    firing.add(a.id)
    try {
      await deps.collect()
      if (!armedNow(a.id)) return
      const reached = (x: Alarm): Alarm => ({ ...withEntry(x, entryAt), triggeredAt: at.time, triggeredPrice: at.price, checkedUntil: at.time })
      deps.update((list) => settlePairs(list.map((x) => (x.id === a.id && isArmed(x) ? reached(x) : x))))
      await deps.notify(reached(a), note)
    } finally {
      firing.delete(a.id)
    }
  }

  /** Where the next check starts, and a run-out end, after bars up to the newest one without a hit. */
  const checked = (table: { until?: number }, candles: { time: number }[]) => {
    const last = candles[candles.length - 1].time
    // Past the line's end without a touch: run out, quietly. The end of a year-ahead table is no end.
    const ran = table.until !== undefined && last > table.until ? table.until : undefined
    return (x: Alarm): Alarm => ({ ...x, checkedUntil: checkedAfter(x, last), ...(ran !== undefined && { expiredAt: ran }) })
  }

  /** A box's target and stop against the same bars: the earlier hit (the stop on a tie) decides. */
  async function catchUpBox(a: Alarm, done: Set<string>): Promise<void> {
    const pid = partnerOf(a, deps.alarms())?.id
    done.add(a.id)
    if (pid) done.add(pid)
    if (!tableOf(a, Math.floor(Date.now() / 1000))) return
    const { candles, stale } = await deps.loadBars(a.symbol)
    if (stale) return
    // Read again: either side may have fired, been re-armed or deleted while the bars loaded.
    const fresh = armedNow(a.id)
    if (!fresh) return
    const table = tableOf(fresh, Math.floor(Date.now() / 1000))
    if (!table) return
    const other = pid ? armedNow(pid) : undefined
    // Bars after the alarm end decide nothing (a line alarm's table ends there; the Android check stops there too).
    const inTime = table.until === undefined ? candles : candles.filter((c) => c.time <= table.until!)
    const mine = scanBox(fresh, inTime)
    const theirs = other ? scanBox(other, inTime) : { hit: null }
    const [target, stop] = fresh.line!.part === 'target' ? [mine.hit, theirs.hit] : [theirs.hit, mine.hit]
    const won = pairWinner(target, stop)
    if (won) {
      const [w, r] = won === fresh.line!.part ? [fresh, mine] : [other!, theirs as typeof mine]
      // Either side may have seen the entry (they can be armed at different times).
      const seen = [mine.entryAt, theirs.entryAt].filter((t): t is number => t !== undefined).sort((x, y) => x - y)[0]
      const note: AlarmNote | undefined = target && stop && target.time === stop.time ? 'same-bar' : seen === undefined ? 'no-entry' : undefined
      return fire(w, r.hit!, seen, note)
    }
    if (!candles.length) return
    const next = checked(table, candles)
    const entryAt = mine.entryAt ?? theirs.entryAt
    deps.update((list) => list.map((x) => (x.id === fresh.id || x.id === other?.id ? next(withEntry(x, entryAt)) : x)))
  }

  return {
    fire,
    /** A live price (seconds): fires every armed alarm of the symbol it reaches. */
    async onPrice(symbol: string, price: number, time: number): Promise<void> {
      // Two live prices on either side of a box's entry: it was touched in between.
      const prev = lastPrice.get(symbol)
      lastPrice.set(symbol, price)
      const crossed = (a: Alarm) =>
        prev !== undefined && a.symbol === symbol && !!a.box && a.box.entryAt === undefined && isArmed(a) && (prev - a.box.entry) * (price - a.box.entry) <= 0
      if (deps.alarms().some(crossed)) deps.update((list) => list.map((x) => (crossed(x) ? withEntry(x, time) : x)))
      // A waiting box before its entry is left to the bars (catchUp), and so is any box after a gap (sleep, start): the
      // missed bars may hold the other side's hit first.
      const due = deps
        .alarms()
        .filter(
          (a) =>
            a.symbol === symbol &&
            isArmed(a) &&
            // Without a price source no catch-up moves checkedUntil on: there the gap rule would lock it for good.
            !(a.box && ((a.box.wait && a.box.entryAt === undefined) || (deps.checkable(a) && time - (a.checkedUntil ?? a.createdAt) > BOX_TICK_GAP)))
        )
      await Promise.all(
        due.map((a) => {
          const table = tableOf(a, time)
          const h = table && hit({ ...a, checkedUntil: time }, [{ time, high: price, low: price }], table.knots)
          if (!h) return undefined
          // Either side may have seen the entry (they can be armed at different times).
          const seen = a.box ? (a.box.entryAt ?? partnerOf(a, deps.alarms())?.box?.entryAt) : undefined
          return fire(a, h, seen, a.box && seen === undefined ? 'no-entry' : undefined)
        })
      )
    },
    /** Bars since the last check, so a spike while KandleOS was closed still counts. */
    async catchUp(): Promise<void> {
      const done = new Set<string>()
      for (const a of deps.alarms().filter((x) => isArmed(x) && deps.checkable(x))) {
        if (done.has(a.id)) continue
        try {
          if (a.box) {
            await catchUpBox(a, done)
            continue
          }
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
            const next = checked(table, candles)
            deps.update((list) => list.map((x) => (x.id === a.id ? next(x) : x)))
          }
        } catch {
          // offline or source error: tried again on the next catch-up
        }
      }
    }
  }
}
