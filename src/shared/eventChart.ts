// Where events sit in the chart: bar dates in the exchange's zone, the bar of each event, the markers per bar,
// short amounts for the marker text and the price change since a deal.
import { barZone, wall } from './calendar.ts'
import type { ChartEvent } from './events.ts'
import { locale, t } from './i18n.ts'

/** Calendar day of every bar in the exchange's zone (barZone decides between date labels and session stamps). */
export function candleDates(times: number[], timeZone: string): string[] {
  const zone = barZone(times, timeZone)
  return times.map((time) => wall(time, zone).date)
}

/** Index of the bar an event belongs to, -1 when it lies before the first loaded bar. */
export function candleIndex(dates: string[], times: number[], e: { date: string; time?: number }, intraday: boolean): number {
  if (e.time !== undefined && intraday) return times.findLastIndex((time) => time <= e.time!)
  const i = dates.findIndex((d) => d >= e.date)
  if (i === -1) return dates.length - 1
  return dates[i] === e.date ? i : i - 1
}

export interface CandleMark {
  time: number
  /** Index of the bar in the loaded candles. */
  index: number
  side: 'buy' | 'sell' | 'mixed'
  count: number
  big: boolean
  text: string
  ids: string[]
}

/**
 * One mark per bar with insider deals (no transfers, clusters, filings or news), oldest bar first. Text: the amount,
 * with several deals "3× 1,2 Mio €" (the count alone when currencies differ or buys and sells mix).
 */
export function candleMarks(events: ChartEvent[], dates: string[], times: number[], intraday: boolean): CandleMark[] {
  const byBar = new Map<number, ChartEvent[]>()
  for (const e of events) {
    if (e.kind !== 'insider') continue
    const i = candleIndex(dates, times, e, intraday)
    if (i >= 0) byBar.set(i, [...(byBar.get(i) ?? []), e])
  }
  return [...byBar.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, list]) => {
      const sides = new Set(list.map((e) => e.side))
      const deals = list.map((e) => e.deal!)
      const currencies = new Set(deals.map((d) => d.currency))
      const sum = deals.every((d) => d.volume !== undefined) ? deals.reduce((a, d) => a + d.volume!, 0) : undefined
      const amount = sides.size === 1 && currencies.size === 1 && sum !== undefined ? shortMoney(sum, deals[0].currency) : ''
      return {
        time: times[i],
        index: i,
        side: sides.size > 1 ? 'mixed' : list[0].side!,
        count: list.length,
        big: list.some((e) => e.big || e.inCluster),
        text: list.length > 1 ? `${list.length}× ${amount}`.trim() : amount,
        ids: list.map((e) => e.id)
      }
    })
}

/**
 * Stacking of the badges in the chart (marker design A). Each badge hangs on a stem from its candle (`y`: the wick's
 * end in pixels; below the bar for buys, `above` for the rest). Going from left to right, a badge that would touch one
 * already placed takes the first level further out where it fits; the check uses the real boxes, as neighbouring
 * candles differ in height. Beyond `max` levels it becomes a dot (-1), which only happens when zoomed far out.
 * Levels come back in input order.
 */
export function stackLevels(items: { x: number; y: number; w: number; above: boolean; strong: boolean }[], h = 20, gap = 4, max = 3): number[] {
  const out = new Array<number>(items.length)
  const placed: { l: number; r: number; t: number; b: number }[] = []
  const box = (i: (typeof items)[number], level: number) => {
    const stem = stemLength(i.strong, level)
    const t = i.above ? i.y - stem - h : i.y + stem
    return { l: i.x - i.w / 2, r: i.x + i.w / 2, t, b: t + h }
  }
  const hits = (a: ReturnType<typeof box>) => placed.some((p) => a.l < p.r + gap && p.l < a.r + gap && a.t < p.b + gap && p.t < a.b + gap)
  for (const k of items.map((_, n) => n).sort((a, b) => items[a].x - items[b].x)) {
    let level = 0
    while (level <= max && hits(box(items[k], level))) level++
    if (level > max) {
      out[k] = -1
      continue
    }
    placed.push(box(items[k], level))
    out[k] = level
  }
  return out
}

/** Length of a badge's stem from its candle: longer for heavy deals (big or in a cluster) and for each level out. */
export function stemLength(strong: boolean, level: number): number {
  return (strong ? 26 : 14) + level * 24
}

/** "267 T€", "2,26 Mio €", "416 T HKD"; English "267K €", "2.26M €". */
export function shortMoney(v: number, currency?: string): string {
  const cur = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency ? ' ' + currency : ''
  // 999,500 and up would round to "1.000 T€"
  const text =
    v >= 999_500
      ? t('{n} Mio {cur}', { n: (v / 1e6).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }), cur })
      : t('{n} T{cur}', { n: Math.round(v / 1000).toLocaleString(locale()), cur })
  return text.replace(/ {2,}/g, ' ').trim()
}

/** Change from the deal price to the last price; undefined unless the price lies within lo..hi (2 % slack). */
export function sinceChange(price: number | undefined, lo: number, hi: number, last: number): number | undefined {
  if (!price || price <= 0 || price < lo * 0.98 || price > hi * 1.02) return undefined
  return last / price - 1
}
