// Insider dealings, filings and news of one symbol: from cleaned source rows to the events the list and the chart
// show. Pure functions; the fetching lives in src/data/events/, the screens in the renderer.
import { wall } from './calendar.ts'
import { alpacaKnows, isCrypto } from './types.ts'

export type Role = 'vorstand' | 'aufsichtsrat' | 'fuehrung' | 'nahestehend'
export interface InsiderDeal {
  source: 'BaFin' | 'Finnhub'
  person: string
  role?: Role
  side: 'buy' | 'sell'
  /** Day of the deal and day it became public, YYYY-MM-DD. */
  date: string
  published: string
  shares?: number
  price?: number
  volume?: number
  currency?: string
  /** BaFin only; '' = outside a trading venue. */
  venue?: string
  /** Finnhub only: shares held after the deal. */
  holdingAfter?: number
}
export interface Filing {
  form: string
  date: string
  url: string
}
export interface NewsItem {
  time: number
  headline: string
  source: string
  url: string
}
export interface SourceNote {
  part: 'insider' | 'filings' | 'news'
  state: 'no-key' | 'no-source' | 'no-isin' | 'home' | 'error' | 'truncated' | 'via-pc'
  /** via-pc: why the PC could not help (not paired, PC app too old, or not reachable). */
  reason?: 'not-paired' | 'unknown-op' | 'offline'
  source?: 'BaFin' | 'Finnhub'
}
export interface EventsResult {
  deals: InsiderDeal[]
  filings: Filing[]
  news: NewsItem[]
  notes: SourceNote[]
  source?: 'BaFin' | 'Finnhub'
  /** Insider rows the source had for this symbol that are no buy or sell of shares (options, awards, gifts …). */
  hidden?: number
  /** Phone: BaFin's data came through the paired PC (its own request failed). */
  via?: 'pc'
  /** No insider source here, but a US listing of the same company (Wikidata). */
  adr?: { symbol: string; exchange: string }
  fetchedAt: number
}

export interface ChartEvent {
  id: string
  kind: 'insider' | 'cluster' | 'transfer' | 'filing' | 'news'
  group: 'insider' | 'filings' | 'news'
  level: 1 | 2 | 3
  date: string
  /** News only (unix seconds). */
  time?: number
  side?: 'buy' | 'sell'
  big?: boolean
  inCluster?: boolean
  deal?: InsiderDeal
  /** Which buy of this person in the window (1 = first). */
  nth?: number
  /** Share of the holding bought or sold, in percent (Finnhub). */
  holdingPct?: number
  /** Cluster: number of buyers and their summed volume (only when all share one currency). */
  persons?: number
  volume?: number
  currency?: string
  /** Filing and news. */
  title?: string
  url?: string
  origin?: string
}

/** Exchange suffixes besides the US for which Finnhub's free plan has usable insider data (Task 1: none, HTTP 403). */
export const FINNHUB_INSIDER_SUFFIXES: string[] = []

/**
 * Yahoo suffixes of exchanges whose issuers' US listings carry no insider filings. Since 18.03.2026 directors and
 * officers of foreign issuers listed in the US file Form 4, but the SEC exempts issuers organized in Canada, Chile,
 * the EEA, South Korea, Switzerland and the UK (order of 05.03.2026, Release 34-104931) and in Australia, India and
 * Singapore (order of 20.05.2026, Release 34-105517). Finnhub agreed on 11.11.2026: NVO, SAP, ASML none; TM, SONY,
 * TSM, BABA with rows. The orders go by the issuer's home country; the exchange suffix stands in for it.
 */
const NO_US_INSIDERS = new Set([
  // EEA
  'DE', 'F', 'BE', 'DU', 'HM', 'HA', 'MU', 'SG', 'PA', 'AS', 'BR', 'MI', 'MC', 'VI', 'LS', 'IR', 'AT', 'WA', 'PR', 'BD',
  'RO', 'CO', 'ST', 'HE', 'OL', 'IC', 'TL', 'RG', 'VS',
  // UK, Switzerland, Canada, Chile, South Korea, Australia, India, Singapore
  'L', 'IL', 'SW', 'TO', 'V', 'CN', 'NE', 'SN', 'KS', 'KQ', 'AX', 'NS', 'BO', 'SI'
])

/** Whether the US listing of a company listed here may carry Form 4 insider filings (see NO_US_INSIDERS). */
export function adrMayReport(symbol: string): boolean {
  const suffix = /\.([A-Z]{1,2})$/.exec(symbol)?.[1]
  return !!suffix && !NO_US_INSIDERS.has(suffix)
}

/** Which source serves the insider dealings of a symbol. */
export function eventRoute(symbol: string, isin: string | undefined): 'bafin' | 'finnhub' | 'home' | 'none' {
  if (isCrypto(symbol) || /[\^=]/.test(symbol)) return 'none'
  if (/\.(DE|F)$/.test(symbol)) return !isin ? 'none' : isin.startsWith('DE') ? 'bafin' : 'home'
  if (alpacaKnows(symbol)) return 'finnhub'
  const suffix = symbol.split('.').at(-1)
  return symbol.includes('.') && FINNHUB_INSIDER_SUFFIXES.includes(suffix!) ? 'finnhub' : 'none'
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const ROLES: Role[] = ['vorstand', 'aufsichtsrat', 'fuehrung', 'nahestehend']
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length <= max ? v : undefined)

/** Drops fields without a value, so results compare as whole objects. */
function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k]
  return o
}

/** Deals from the other device: only well-formed entries survive. */
export function checkDeals(v: unknown): InsiderDeal[] {
  if (!Array.isArray(v)) return []
  const out: InsiderDeal[] = []
  for (const d of v.slice(0, 500)) {
    if (!d || typeof d !== 'object') continue
    const { source, person, side, date, published, role } = d as Record<string, unknown>
    if (source !== 'BaFin' && source !== 'Finnhub') continue
    if (typeof person !== 'string' || !person || person.length > 200) continue
    if (side !== 'buy' && side !== 'sell') continue
    if (typeof date !== 'string' || !DAY_RE.test(date) || typeof published !== 'string' || !DAY_RE.test(published)) continue
    const x = d as Record<string, unknown>
    out.push(clean({
      source, person, side, date, published,
      role: ROLES.includes(role as Role) ? (role as Role) : undefined,
      shares: num(x.shares), price: num(x.price), volume: num(x.volume),
      currency: str(x.currency, 10), venue: str(x.venue, 200), holdingAfter: num(x.holdingAfter)
    }))
  }
  return out
}

const sum = (list: (number | undefined)[]): number | undefined =>
  list.every((n) => n !== undefined) ? list.reduce<number>((a, n) => a + n!, 0) : undefined

/** Holding after the last deal of the day, whatever the order of the rows: the most after buys, the least after sells. */
function holding(g: InsiderDeal[]): number | undefined {
  const h = g.map((d) => d.holdingAfter).filter((v): v is number => v !== undefined)
  return h.length ? (g[0].side === 'buy' ? Math.max(...h) : Math.min(...h)) : undefined
}

/** Rows of one person on one day in one direction become one deal (sums; price = volume ÷ shares). */
export function mergeDeals(deals: InsiderDeal[]): InsiderDeal[] {
  const groups = new Map<string, InsiderDeal[]>()
  for (const d of deals) {
    const k = `${d.source}|${d.date}|${d.person}|${d.side}`
    groups.set(k, [...(groups.get(k) ?? []), d])
  }
  return [...groups.values()].map((g) => {
    if (g.length === 1) return g[0]
    const shares = sum(g.map((d) => d.shares))
    const volume = sum(g.map((d) => d.volume))
    return clean({
      ...g[0],
      shares, volume,
      price: shares && volume !== undefined ? volume / shares : g[0].price,
      published: g.map((d) => d.published).sort().at(-1)!,
      holdingAfter: holding(g)
    })
  })
}

const dayNum = (date: string): number => Date.parse(date + 'T00:00:00Z') / 864e5
const isoDay = (n: number): string => new Date(n * 864e5).toISOString().slice(0, 10)
export const delayDays = (date: string, published: string): number => Math.round(dayNum(published) - dayNum(date))

const isBig = (d: InsiderDeal): boolean => (d.volume ?? 0) >= 100_000 && (d.currency === 'EUR' || d.currency === 'USD')

/** Turns deals, filings and news into list entries, newest first (on one day the cluster before its buys). News get
 * the date of their exchange zone (`timeZone`), like the bars they sit on. */
export function buildEvents(r: Pick<EventsResult, 'deals' | 'filings' | 'news'>, timeZone = 'UTC'): ChartEvent[] {
  const deals = mergeDeals(r.deals)

  // Transfers: a day whose buys and sells sum up to the same amount (within 1 %), or a related party off-venue.
  const transfer = new Set<InsiderDeal>()
  const byDay = new Map<string, InsiderDeal[]>()
  for (const d of deals) byDay.set(d.date, [...(byDay.get(d.date) ?? []), d])
  for (const day of byDay.values()) {
    const total = (side: 'buy' | 'sell') => day.filter((d) => d.side === side).reduce((a, d) => a + (d.volume ?? 0), 0)
    const b = total('buy'), s = total('sell')
    if (b > 0 && s > 0 && Math.abs(b - s) <= 0.01 * Math.max(b, s)) day.forEach((d) => transfer.add(d))
  }
  for (const d of deals) if (d.role === 'nahestehend' && d.venue === '') transfer.add(d)

  // Clusters: from the earliest free buy, all countable buys up to five days later; two or more persons make one.
  const countable = deals
    .filter((d) => d.side === 'buy' && !transfer.has(d) && d.role !== 'nahestehend')
    .sort((a, b) => a.date.localeCompare(b.date))
  const inCluster = new Set<InsiderDeal>()
  const clusters: ChartEvent[] = []
  for (let i = 0; i < countable.length; ) {
    const end = isoDay(dayNum(countable[i].date) + 5)
    let j = i
    while (j < countable.length && countable[j].date <= end) j++
    const window = countable.slice(i, j)
    const persons = new Set(window.map((d) => d.person)).size
    if (persons < 2) {
      i++
      continue
    }
    window.forEach((d) => inCluster.add(d))
    const currencies = new Set(window.map((d) => d.currency))
    const one = currencies.size === 1 ? window[0].currency : undefined
    clusters.push(clean({
      id: `C|${window[0].date}|${persons}`, kind: 'cluster', group: 'insider', level: 3, date: window.at(-1)!.date, side: 'buy',
      persons, volume: one ? sum(window.map((d) => d.volume)) : undefined, currency: one
    } as ChartEvent))
    i = j
  }

  // Which buy of this person: counted over the real buys, oldest first.
  const nth = new Map<InsiderDeal, number>()
  const perPerson = new Map<string, number>()
  for (const d of [...deals].sort((a, b) => a.date.localeCompare(b.date))) {
    if (d.side !== 'buy' || transfer.has(d)) continue
    const n = (perPerson.get(d.person) ?? 0) + 1
    perPerson.set(d.person, n)
    nth.set(d, n)
  }

  const dealEvents = deals.map((d): ChartEvent => {
    if (transfer.has(d)) return { id: `T|${d.date}|${d.person}|${d.side}`, kind: 'transfer', group: 'insider', level: 1, date: d.date, side: d.side, deal: d }
    const big = isBig(d)
    const base = d.side === 'sell' ? d.holdingAfter! + d.shares! : d.holdingAfter! - d.shares!
    const pct = d.holdingAfter !== undefined && d.shares !== undefined && base > 0 ? Math.round((d.shares / base) * 1000) / 10 : undefined
    return clean({
      id: `I|${d.date}|${d.person}|${d.side}`, kind: 'insider', group: 'insider', level: d.side === 'buy' && big ? 3 : 2,
      date: d.date, side: d.side, big: big || undefined, inCluster: inCluster.has(d) || undefined, deal: d,
      nth: nth.get(d), holdingPct: pct
    } as ChartEvent)
  })
  const filings = r.filings.map((f): ChartEvent => ({ id: `F|${f.date}|${f.url}`, kind: 'filing', group: 'filings', level: 2, date: f.date, title: f.form, url: f.url }))
  const news = r.news.map((n): ChartEvent => ({
    id: `N|${n.time}|${n.url}`, kind: 'news', group: 'news', level: 1, date: wall(n.time, timeZone).date,
    time: n.time, title: n.headline, url: n.url, origin: n.source
  }))
  const rank = (e: ChartEvent) => (e.kind === 'cluster' ? 0 : 1)
  return [...clusters, ...dealEvents, ...filings, ...news].sort(
    (a, b) => b.date.localeCompare(a.date) || rank(a) - rank(b) || (b.time ?? 0) - (a.time ?? 0)
  )
}

export const importantIds = (events: ChartEvent[]): string[] => events.filter((e) => e.level === 3).map((e) => e.id)

/**
 * Important events not noted as seen; on the first visit (`seen` unset) nothing is new. A cluster counts as seen
 * when a seen one had at least as many buyers and started up to five days earlier: its first buy may have left the
 * twelve-month window, which changes its id without anything new happening. A grown cluster is new.
 */
export function unseen(events: ChartEvent[], seen: string[] | undefined): string[] {
  if (!seen) return []
  const known = new Set(seen)
  const clusters = seen.filter((s) => s.startsWith('C|')).map((s) => s.split('|'))
  const covered = (id: string) => {
    if (known.has(id)) return true
    if (!id.startsWith('C|')) return false
    const [, first, n] = id.split('|')
    return clusters.some(([, d, m]) => +n <= +m && d <= first && dayNum(first) - dayNum(d) <= 5)
  }
  return importantIds(events).filter((id) => !covered(id))
}

/** Buys and sells of the last twelve months; amounts only when every deal is in one currency. */
export function summary(events: ChartEvent[], today: string): { buys: number; sells: number; buyVolume?: number; sellVolume?: number; currency?: string } {
  const from = isoDay(dayNum(today) - 365)
  const deals = events.filter((e) => e.kind === 'insider' && e.date >= from).map((e) => e.deal!)
  const buys = deals.filter((d) => d.side === 'buy'), sells = deals.filter((d) => d.side === 'sell')
  const currencies = new Set(deals.map((d) => d.currency))
  const currency = currencies.size === 1 ? deals[0].currency : undefined
  return clean({
    buys: buys.length, sells: sells.length, currency,
    buyVolume: currency && buys.length ? sum(buys.map((d) => d.volume)) : undefined,
    sellVolume: currency && sells.length ? sum(sells.map((d) => d.volume)) : undefined
  })
}
