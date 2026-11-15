// Coins moving onto and off crypto exchanges, one number per day (BTC and ETH): from the source's rows to the bars
// under the chart and the unusual days in the Events list. Pure functions; the fetching lives in src/data/events/.
import { cryptoQuoteAsset, isCrypto } from './types.ts'

export type FlowAsset = 'BTC' | 'ETH'

export interface FlowDay {
  /** UTC day, YYYY-MM-DD (the source stamps days at 00:00 UTC, like Binance's daily bars). */
  date: string
  /** Coins sent to exchanges and withdrawn from them that day, and the exchanges' holdings at its end. */
  in: number
  out: number
  supply?: number
}

export interface FlowSeries {
  asset: FlowAsset
  days: FlowDay[]
  /** Who estimates the numbers; shown with its licence (CC BY-NC 4.0: non-commercial use, name the source). */
  source: 'Coin Metrics'
}

/** The coin whose exchange flows a crypto symbol shows (BTCUSDT → BTC, ETHBTC → ETH); none for other coins. */
export function flowAsset(symbol: string): FlowAsset | undefined {
  if (!isCrypto(symbol)) return undefined
  const base = symbol.slice(0, symbol.length - cryptoQuoteAsset(symbol).length)
  return base === 'BTC' || base === 'ETH' ? base : undefined
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const amount = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/**
 * Rows of Coin Metrics' community API (`FlowInExNtv`, `FlowOutExNtv`, `SplyExNtv`, numbers as strings) for one asset:
 * oldest first, one per day; rows without both flows are left out. Anything else gives an empty list.
 */
export function parseCoinMetrics(body: unknown, asset: FlowAsset): FlowDay[] {
  const rows = (body as { data?: unknown } | null)?.data
  if (!Array.isArray(rows)) return []
  const byDay = new Map<string, FlowDay>()
  for (const r of rows) {
    if (!r || typeof r !== 'object' || String((r as { asset?: unknown }).asset).toUpperCase() !== asset) continue
    const date = typeof r.time === 'string' ? r.time.slice(0, 10) : ''
    const inflow = amount(r.FlowInExNtv)
    const outflow = amount(r.FlowOutExNtv)
    if (!DAY_RE.test(date) || inflow === undefined || outflow === undefined) continue
    const supply = amount(r.SplyExNtv)
    byDay.set(date, { date, in: inflow, out: outflow, ...(supply !== undefined && { supply }) })
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Positive: more coins came onto exchanges than left them that day. */
export const netFlow = (d: Pick<FlowDay, 'in' | 'out'>): number => d.in - d.out

export interface UnusualDay {
  day: FlowDay
  net: number
  /** Last earlier day with a larger flow in the same direction; null when there is none in the data. */
  since: string | null
}

/**
 * Days whose net flow is the largest in its direction over the `window` days before it (needs `warmup` days of
 * history first, so "largest in 90 days" always compares with 90 days). No fixed threshold: 1,000 BTC is an everyday
 * amount for one coin and a record for another.
 */
export function unusualDays(days: FlowDay[], window = 90, warmup = window): UnusualDay[] {
  const nets = days.map(netFlow)
  const out: UnusualDay[] = []
  for (let i = warmup; i < days.length; i++) {
    const v = nets[i]
    if (v === 0) continue
    const prev = nets.slice(Math.max(0, i - window), i)
    const record = v > 0 ? prev.every((p) => p < v) : prev.every((p) => p > v)
    if (!record) continue
    let j = i - 1
    while (j >= 0 && (v > 0 ? nets[j] < v : nets[j] > v)) j--
    out.push({ day: days[i], net: v, since: j >= 0 ? days[j].date : null })
  }
  return out
}

export interface BarFlow {
  in: number
  out: number
  supply?: number
  /** The bar holds an unusual day flowing the same way as the bar as a whole. */
  unusual: boolean
}

// The chart asks on every price tick; the unusual days only change with a new series (once a day).
const unusualOf = new WeakMap<FlowDay[], Map<string, number>>()

/**
 * The flows of each bar of daily or longer candles, given the bars' own UTC dates (oldest first): a bar sums the days
 * from its date up to the next bar's date; holdings are those at its last day. A bar that starts before the data, or
 * holds none, gets nothing (a half-filled first week would look small).
 */
export function flowsPerBar(days: FlowDay[], barDates: string[]): (BarFlow | null)[] {
  let unusual = unusualOf.get(days)
  if (!unusual) unusualOf.set(days, (unusual = new Map(unusualDays(days).map((u) => [u.day.date, u.net]))))
  const out: (BarFlow | null)[] = []
  let j = 0
  for (let i = 0; i < barDates.length; i++) {
    const end = barDates[i + 1]
    while (j < days.length && days[j].date < barDates[i]) j++
    if (!days.length || barDates[i] < days[0].date) {
      out.push(null)
      continue
    }
    let bar: BarFlow | null = null
    const odd: number[] = []
    while (j < days.length && (end === undefined || days[j].date < end)) {
      const d = days[j++]
      bar ??= { in: 0, out: 0, unusual: false }
      bar.in += d.in
      bar.out += d.out
      const u = unusual.get(d.date)
      if (u !== undefined) odd.push(u)
      if (d.supply !== undefined) bar.supply = d.supply
    }
    if (bar) bar.unusual = odd.some((u) => Math.sign(u) === Math.sign(netFlow(bar!)))
    out.push(bar)
  }
  return out
}

/** Net flow of the last `n` days and the latest holdings. */
export function flowSummary(days: FlowDay[], n = 30): { net: number; days: number; supply?: number } | null {
  if (!days.length) return null
  const last = days.slice(-n)
  const supply = [...days].reverse().find((d) => d.supply !== undefined)?.supply
  return { net: last.reduce((a, d) => a + netFlow(d), 0), days: last.length, ...(supply !== undefined && { supply }) }
}
