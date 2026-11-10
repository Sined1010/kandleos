// Forecast archive: every shown forecast is kept and later settled against the real closes, so KandleOS can
// say how well its forecasts did, not only what they said. Pure functions; main stores, the window settles.
import { barZone, periodIndex, periodStart, wall } from './calendar.ts'
import { probabilityAbove, Q, scaleBands } from './forecast.ts'
import { SYMBOL_RE, TF_MONTHS, TF_SECONDS, TIMEFRAMES, type Candle, type CandleProvider, type Timeframe } from './types.ts'

export interface ArchiveEntry {
  id: string
  symbol: string
  timeframe: Timeframe
  /** Source of the bars; settling asks the same one, so the bars are stamped alike. */
  provider: CandleProvider
  /** Pre-market and after-hours bars were part of the chart. */
  extended: boolean
  /** Exchange time zone, for trading days. */
  timeZone: string
  createdAt: number
  /** Time and close of the last bar the forecast started from. */
  baseTime: number
  base: number
  /** Expected bar times of the steps (from the trading calendar, so only a guess for daily and longer bars). */
  times: number[]
  /** Per step the model's 21 quantiles, uncalibrated. */
  steps: number[][]
  /** Calibration factor the ranges were shown with, null when not calibrated. */
  factor: number | null
  /** Made by the automatic refresh rather than a click. */
  auto: boolean
  appVersion: string
}

export interface Bands {
  in50: number
  in80: number
  in90: number
}

export interface Settlement {
  id: string
  /** Shares of real closes inside each range: as the model gave them and as they were shown. */
  hits: { raw: Bands; shown: Bands }
  /** Mean absolute deviation of the median, and of "unchanged", as a share of the close. */
  err: number
  naive: number
  /** Chance of a higher close at the last step as shown, and whether the close really ended higher. */
  up: number
  rose: boolean
  /** The median got the direction from the base to the last step right. */
  dir: boolean
  /** Steps that could be compared (holidays drop out). */
  steps: number
  /** Last expected bar time: where this forecast's span ends. */
  end: number
}

/** Running sums per symbol, candle size and forecast length; averages are sum / settled. */
export interface SummaryRow {
  key: string
  settled: number
  /** Forecasts whose spans do not overlap, counted greedily from the oldest. */
  independent: number
  lastIndependentEnd: number
  sum: { err: number; naive: number; dir: number; raw: Bands; shown: Bands }
  /** Below 40 %, 40–60 %, above 60 % (as trend()): cases, summed chance, closes that rose. */
  chance: { cases: number; said: number; rose: number }[]
}

const PROVIDERS: CandleProvider[] = ['binance', 'alpaca', 'yahoo', 'finnhub']
const CHANCE_EDGES = [0.4, 0.6]
// More missing target bars than this and the forecast waits (e.g. the source changed); after 30 days it is dropped.
const MAX_MISSING = 0.2
const GIVE_UP = 30 * 86400

export const summaryKey = (e: { symbol: string; timeframe: Timeframe; steps: unknown[] }): string =>
  `${e.symbol}|${e.timeframe}|${e.steps.length}`

// The calendar's cached formatter: one per candle would be built thousands of times per settle run.
const dayParts = (time: number, timeZone: string): [number, number, number] => {
  const [y, m, d] = wall(time, timeZone).date.split('-').map(Number)
  return [y, m, d]
}

/** When the forecast's last bar closes: for month-based bars the next calendar period, a month is not 30 days. */
export function closesAt(e: Pick<ArchiveEntry, 'times' | 'timeframe' | 'timeZone'>): number {
  const end = e.times[e.times.length - 1]
  const months = TF_MONTHS[e.timeframe]
  if (!months) return end + TF_SECONDS[e.timeframe]
  const zone = barZone(e.times, e.timeZone)
  return periodStart(periodIndex(end, months, zone) + 1, months, zone)
}

/**
 * The candle a time belongs to, so differently stamped bars of one candle compare equal (Yahoo stamps the
 * running bar with the current time and daily bars at the session open): the trading day for daily bars, the
 * week's Monday for weekly ones, the period for month-based ones, otherwise the bar-size slot.
 */
export function slotOf(time: number, tf: Timeframe, timeZone: string): number {
  const months = TF_MONTHS[tf]
  if (!months && TF_SECONDS[tf] < 86400) return Math.floor(time / TF_SECONDS[tf])
  const [y, m, d] = dayParts(time, timeZone)
  if (months) return Math.floor((y * 12 + m - 1) / months)
  if (tf === '1W') {
    const monday = new Date(Date.UTC(y, m - 1, d - ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7)))
    return monday.getUTCFullYear() * 10000 + (monday.getUTCMonth() + 1) * 100 + monday.getUTCDate()
  }
  return y * 10000 + m * 100 + d
}

type Span = Pick<ArchiveEntry, 'timeframe' | 'timeZone' | 'baseTime' | 'times'>

/**
 * Whether a forecast goes into the archive, given the ones already there for the same key: one per candle; an
 * automatic refresh only once its span no longer overlaps an archived one (overlapping ones add little news).
 */
export function shouldArchive(e: Span & Pick<ArchiveEntry, 'auto'>, previous: Span[]): boolean {
  const slot = slotOf(e.baseTime, e.timeframe, e.timeZone)
  if (previous.some((p) => slotOf(p.baseTime, p.timeframe, p.timeZone) === slot)) return false
  return !e.auto || previous.every((p) => e.baseTime >= p.times[p.times.length - 1])
}

const inside = (real: number, q: number[], lo: number, hi: number) => real >= q[lo] && real <= q[hi]

/** More than 30 days past its last bar: a forecast still open then is dropped, even if its source keeps failing. */
export const givenUp = (e: Pick<ArchiveEntry, 'times' | 'timeframe' | 'timeZone'>, now: number): boolean =>
  now - closesAt(e) > GIVE_UP

/**
 * End of the section that settling asks for: just past the last target bar, but never in the future, which main
 * refuses (for 3-month bars "two bars on" lies half a year ahead).
 */
export const settleBefore = (e: Pick<ArchiveEntry, 'times' | 'timeframe'>, now: number): number =>
  Math.min(e.times[e.times.length - 1] + 2 * TF_SECONDS[e.timeframe], Math.floor(now))

/** Compares an archived forecast with the real bars; 'pending' until they are all there (or given up on). */
export function settleEntry(e: ArchiveEntry, candles: Candle[], now: number): Settlement | 'pending' | 'unsettleable' {
  if (now < closesAt(e)) return 'pending'
  const real = new Map<number, number>()
  for (const c of candles) real.set(slotOf(c.time, e.timeframe, e.timeZone), c.close)
  const shown = e.factor ? scaleBands(e.steps, e.factor) : e.steps
  const idx = e.times.map((_, i) => i).filter((i) => real.has(slotOf(e.times[i], e.timeframe, e.timeZone)))
  if (!idx.length || 1 - idx.length / e.times.length > MAX_MISSING) return givenUp(e, now) ? 'unsettleable' : 'pending'
  const zero = (): Bands => ({ in50: 0, in80: 0, in90: 0 })
  const raw = zero()
  const sh = zero()
  let err = 0
  let naive = 0
  for (const i of idx) {
    const r = real.get(slotOf(e.times[i], e.timeframe, e.timeZone))!
    for (const [b, q] of [[raw, e.steps[i]], [sh, shown[i]]] as const) {
      if (inside(r, q, Q.p25, Q.p75)) b.in50++
      if (inside(r, q, Q.p10, Q.p90)) b.in80++
      if (inside(r, q, Q.p05, Q.p95)) b.in90++
    }
    err += Math.abs(e.steps[i][Q.median] - r) / r
    naive += Math.abs(e.base - r) / r
  }
  const share = (b: Bands): Bands => ({ in50: b.in50 / idx.length, in80: b.in80 / idx.length, in90: b.in90 / idx.length })
  const last = idx[idx.length - 1]
  const lastReal = real.get(slotOf(e.times[last], e.timeframe, e.timeZone))!
  return {
    id: e.id,
    hits: { raw: share(raw), shown: share(sh) },
    err: err / idx.length,
    naive: naive / idx.length,
    up: probabilityAbove(shown[last], e.base),
    rose: lastReal > e.base,
    dir: Math.sign(e.steps[last][Q.median] - e.base) === Math.sign(lastReal - e.base),
    steps: idx.length,
    end: e.times[e.times.length - 1]
  }
}

/** Adds a settlement to its row; entries must be added oldest `baseTime` first for the independent count. */
export function addToSummary(rows: Record<string, SummaryRow>, e: ArchiveEntry, s: Settlement): void {
  const key = summaryKey(e)
  const bands = (): Bands => ({ in50: 0, in80: 0, in90: 0 })
  const row = (rows[key] ??= {
    key,
    settled: 0,
    independent: 0,
    lastIndependentEnd: 0,
    sum: { err: 0, naive: 0, dir: 0, raw: bands(), shown: bands() },
    chance: [0, 1, 2].map(() => ({ cases: 0, said: 0, rose: 0 }))
  })
  row.settled++
  if (e.baseTime >= row.lastIndependentEnd) {
    row.independent++
    row.lastIndependentEnd = s.end
  }
  row.sum.err += s.err
  row.sum.naive += s.naive
  row.sum.dir += s.dir ? 1 : 0
  for (const k of ['in50', 'in80', 'in90'] as const) {
    row.sum.raw[k] += s.hits.raw[k]
    row.sum.shown[k] += s.hits.shown[k]
  }
  const g = row.chance[s.up < CHANCE_EDGES[0] ? 0 : s.up <= CHANCE_EDGES[1] ? 1 : 2]
  g.cases++
  g.said += s.up
  g.rose += s.rose ? 1 : 0
}

/** Six significant digits: finer than any quote, and the archive stays small. */
export const roundSig = (v: number, digits = 6): number => Number(v.toPrecision(digits))

const finite = (v: unknown, min = -Infinity, max = Infinity): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

const validZone = (z: unknown): z is string => {
  if (typeof z !== 'string' || z.length > 64) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: z })
    return true
  } catch {
    return false
  }
}

/** Checks an entry from the window or a backup file before main stores it. */
export function parseEntry(v: unknown): ArchiveEntry | null {
  if (!v || typeof v !== 'object') return null
  const e = v as Record<string, unknown>
  const times = e.times
  const steps = e.steps
  const ok =
    typeof e.id === 'string' &&
    /^[A-Za-z0-9_-]{1,64}$/.test(e.id) &&
    typeof e.symbol === 'string' &&
    SYMBOL_RE.test(e.symbol) &&
    TIMEFRAMES.includes(e.timeframe as Timeframe) &&
    PROVIDERS.includes(e.provider as CandleProvider) &&
    typeof e.extended === 'boolean' &&
    typeof e.auto === 'boolean' &&
    validZone(e.timeZone) &&
    finite(e.createdAt, 0) &&
    finite(e.baseTime, 0) &&
    finite(e.base, 0) &&
    (e.base as number) > 0 &&
    Array.isArray(times) &&
    times.length >= 1 &&
    times.length <= 64 &&
    times.every((t, i) => finite(t, 0) && (i === 0 || t > times[i - 1])) &&
    Array.isArray(steps) &&
    steps.length === times.length &&
    steps.every((q) => Array.isArray(q) && q.length === 21 && q.every((x) => finite(x) && x > 0)) &&
    (e.factor === null || finite(e.factor, 0.1, 10)) &&
    typeof e.appVersion === 'string' &&
    e.appVersion.length <= 20
  if (!ok) return null
  const { id, symbol, timeframe, provider, extended, timeZone, createdAt, baseTime, base, factor, auto, appVersion } = e
  return { id, symbol, timeframe, provider, extended, timeZone, createdAt, baseTime, base, times, steps, factor, auto, appVersion } as ArchiveEntry
}
