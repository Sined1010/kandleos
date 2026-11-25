// Candlestick patterns: which textbook patterns end at which bar, and (lookBack) how often they were right before
// on the loaded bars of this symbol. Pure functions so the PC and the phone count alike.
import type { Candle } from './types.ts'

export type PatternId =
  | 'hammer'
  | 'shootingStar'
  | 'bullEngulfing'
  | 'bearEngulfing'
  | 'morningStar'
  | 'eveningStar'
  | 'bullHarami'
  | 'bearHarami'
  | 'doji'
  | 'threeSoldiers'
  | 'threeCrows'
export type Dir = 'up' | 'down'
/** Indices into the bars the hit was found in; `dir` is the move the pattern hints at. */
export interface PatternHit {
  id: PatternId
  start: number
  end: number
  dir: Dir
}

export const PATTERN_LEN: Record<PatternId, 1 | 2 | 3> = {
  hammer: 1,
  shootingStar: 1,
  bullEngulfing: 2,
  bearEngulfing: 2,
  morningStar: 3,
  eveningStar: 3,
  bullHarami: 2,
  bearHarami: 2,
  doji: 1,
  threeSoldiers: 3,
  threeCrows: 3
}

/** English in both languages: the names readers find in books and forums. */
export const PATTERN_NAME: Record<PatternId, string> = {
  hammer: 'Hammer',
  shootingStar: 'Shooting Star',
  bullEngulfing: 'Bullish Engulfing',
  bearEngulfing: 'Bearish Engulfing',
  morningStar: 'Morning Star',
  eveningStar: 'Evening Star',
  bullHarami: 'Bullish Harami',
  bearHarami: 'Bearish Harami',
  doji: 'Doji',
  threeSoldiers: 'Three White Soldiers',
  threeCrows: 'Three Black Crows'
}

/** The move a pattern hints at; null = against the trend before (doji). */
const HINT: Record<PatternId, Dir | null> = {
  hammer: 'up',
  shootingStar: 'down',
  bullEngulfing: 'up',
  bearEngulfing: 'down',
  morningStar: 'up',
  eveningStar: 'down',
  bullHarami: 'up',
  bearHarami: 'down',
  doji: null,
  threeSoldiers: 'up',
  threeCrows: 'down'
}

export const TREND_BARS = 5

/** Fell or rose into bar i: its close against the close TREND_BARS earlier. */
export function trendAt(c: Candle[], i: number): Dir | null {
  if (i - TREND_BARS < 0 || i >= c.length) return null
  const d = c[i].close - c[i - TREND_BARS].close
  return d < 0 ? 'down' : d > 0 ? 'up' : null
}

const body = (b: Candle) => Math.abs(b.close - b.open)
const range = (b: Candle) => b.high - b.low
const upper = (b: Candle) => b.high - Math.max(b.open, b.close)
const lower = (b: Candle) => Math.min(b.open, b.close) - b.low
const green = (b: Candle) => b.close > b.open
const red = (b: Candle) => b.close < b.open
const real = (...bs: Candle[]) => bs.every((b) => range(b) > 0)
/** Body of b inside the body of a. */
const inside = (b: Candle, a: Candle) => Math.max(b.open, b.close) <= Math.max(a.open, a.close) && Math.min(b.open, b.close) >= Math.min(a.open, a.close)
const opensIn = (b: Candle, a: Candle) => b.open >= Math.min(a.open, a.close) && b.open <= Math.max(a.open, a.close)
const strong = (b: Candle) => body(b) >= 0.5 * range(b)
/** Open and close almost equal: no real body to engulf or to engulf with. */
const doji = (b: Candle) => body(b) <= 0.1 * range(b)

export const AVG_BARS = 14
/** Average length (high to low) of up to AVG_BARS bars before bar i. */
const avgRange = (c: Candle[], i: number) => {
  const from = Math.max(0, i - AVG_BARS)
  let sum = 0
  for (let k = from; k < i; k++) sum += range(c[k])
  return i > from ? sum / (i - from) : 0
}

/** The shape alone, for the bars ending at i (the trend before is checked by the caller). */
const SHAPE: Record<PatternId, (c: Candle[], i: number) => boolean> = {
  // Only a candle as long as usual: a quiet bar with a small body says nothing (Nison: a doji matters where it stands out).
  doji: (c, i) => real(c[i]) && doji(c[i]) && range(c[i]) >= avgRange(c, i),
  hammer: (c, i) => {
    const b = c[i]
    return real(b) && body(b) > 0.1 * range(b) && lower(b) >= 2 * body(b) && upper(b) <= 0.5 * body(b)
  },
  shootingStar: (c, i) => {
    const b = c[i]
    return real(b) && body(b) > 0.1 * range(b) && upper(b) >= 2 * body(b) && lower(b) <= 0.5 * body(b)
  },
  bullEngulfing: (c, i) => {
    const [a, b] = [c[i - 1], c[i]]
    return real(a, b) && !doji(a) && !doji(b) && red(a) && green(b) && b.open <= a.close && b.close >= a.open && body(b) > body(a)
  },
  bearEngulfing: (c, i) => {
    const [a, b] = [c[i - 1], c[i]]
    return real(a, b) && !doji(a) && !doji(b) && green(a) && red(b) && b.open >= a.close && b.close <= a.open && body(b) > body(a)
  },
  bullHarami: (c, i) => {
    const [a, b] = [c[i - 1], c[i]]
    return real(a, b) && red(a) && strong(a) && green(b) && inside(b, a) && body(b) <= 0.5 * body(a)
  },
  bearHarami: (c, i) => {
    const [a, b] = [c[i - 1], c[i]]
    return real(a, b) && green(a) && strong(a) && red(b) && inside(b, a) && body(b) <= 0.5 * body(a)
  },
  morningStar: (c, i) => {
    const [a, b, d] = [c[i - 2], c[i - 1], c[i]]
    return real(a, b, d) && red(a) && strong(a) && body(b) <= 0.3 * body(a) && green(d) && d.close >= (a.open + a.close) / 2
  },
  eveningStar: (c, i) => {
    const [a, b, d] = [c[i - 2], c[i - 1], c[i]]
    return real(a, b, d) && green(a) && strong(a) && body(b) <= 0.3 * body(a) && red(d) && d.close <= (a.open + a.close) / 2
  },
  threeSoldiers: (c, i) => {
    const [a, b, d] = [c[i - 2], c[i - 1], c[i]]
    return real(a, b, d) && [a, b, d].every((x) => green(x) && strong(x)) && b.close > a.close && d.close > b.close && opensIn(b, a) && opensIn(d, b)
  },
  threeCrows: (c, i) => {
    const [a, b, d] = [c[i - 2], c[i - 1], c[i]]
    return real(a, b, d) && [a, b, d].every((x) => red(x) && strong(x)) && b.close < a.close && d.close < b.close && opensIn(b, a) && opensIn(d, b)
  }
}

const IDS = Object.keys(PATTERN_LEN) as PatternId[]

/** Whether pattern `id` ends at bar i, trend before included; the move it hints at, else null. */
export function patternAt(c: Candle[], id: PatternId, i: number): Dir | null {
  const start = i - PATTERN_LEN[id] + 1
  const trend = trendAt(c, start - 1)
  if (!trend) return null
  const hint = HINT[id]
  if (hint && trend === hint) return null
  if (!SHAPE[id](c, i)) return null
  return hint ?? (trend === 'down' ? 'up' : 'down')
}

/** Every hit ending at or before `last` (the last finished bar), ordered by its end; one pass over the bars. */
export function findPatterns(c: Candle[], last: number): PatternHit[] {
  const hits: PatternHit[] = []
  for (let i = 0; i <= Math.min(last, c.length - 1); i++)
    for (const id of IDS) {
      const dir = patternAt(c, id, i)
      if (dir) hits.push({ id, start: i - PATTERN_LEN[id] + 1, end: i, dir })
    }
  return hits
}

/** The hits shown: those ending on one of the last 3 finished bars. */
export const currentPatterns = (hits: PatternHit[], lastFinished: number): PatternHit[] =>
  hits.filter((h) => h.end <= lastFinished && h.end >= lastFinished - 2)

export const HORIZON = 5
export const MIN_CASES = 10
export type Verdict = 'rare' | 'none' | 'better' | 'worse'
/** n cases; hit = share right after the pattern, base = share right without it (both 0…1). */
export interface LookBack {
  n: number
  hit: number
  base: number
  verdict: Verdict
}

/** Only a distance of about two standard errors counts as better or worse; the base is kept off 0 and 1 so it never is 0. */
export function verdictOf(n: number, hit: number, base: number): Verdict {
  if (n < MIN_CASES) return 'rare'
  const y = Math.min(0.95, Math.max(0.05, base))
  const se = Math.sqrt((y * (1 - y)) / n)
  return hit - base > 2 * se ? 'better' : base - hit > 2 * se ? 'worse' : 'none'
}

const right = (c: Candle[], k: number, dir: Dir) => (dir === 'up' ? c[k + HORIZON].close > c[k].close : c[k + HORIZON].close < c[k].close)

/**
 * How often pattern `id` was right HORIZON bars later, against every bar with the same trend before that did not end
 * that pattern (chosen by the trend, never by the outcome). A case less than HORIZON bars after the last counted one
 * is left out, of the cases and of the base.
 */
export function lookBack(c: Candle[], hits: PatternHit[], id: PatternId, lastFinished: number): LookBack {
  const L = PATTERN_LEN[id]
  const own = hits.filter((h) => h.id === id)
  const ends = new Set(own.map((h) => h.end))
  let n = 0
  let ok = 0
  let lastCounted = -Infinity
  for (const h of own) {
    if (h.end + HORIZON > lastFinished || h.end - lastCounted < HORIZON) continue
    lastCounted = h.end
    n++
    if (right(c, h.end, h.dir)) ok++
  }
  let m = 0
  let baseOk = 0
  for (let k = L + TREND_BARS; k + HORIZON <= lastFinished; k++) {
    if (ends.has(k)) continue
    const trend = trendAt(c, k - L)
    if (!trend) continue
    const hint = HINT[id]
    if (hint && trend === hint) continue
    m++
    if (right(c, k, hint ?? (trend === 'down' ? 'up' : 'down'))) baseOk++
  }
  const hit = n ? ok / n : 0
  const base = m ? baseOk / m : 0
  return { n, hit, base, verdict: verdictOf(n, hit, base) }
}

/**
 * Indices of the bars patterns are read from: with extended hours shown on an intraday chart, the bars the chart shades
 * (pre/post) are skipped; a missing schedule (phase null) keeps the bar, so such exchanges still show patterns.
 */
export function regularBars(c: Candle[], phase: (t: number) => string | null, extended: boolean, intraday: boolean): number[] {
  const all = c.map((_, i) => i)
  if (!extended || !intraday) return all
  return all.filter((i) => {
    const p = phase(c[i].time)
    return p !== 'pre' && p !== 'post'
  })
}

/**
 * When the bars must be read again: their count, the first bar and the closes of the last two (the running one only
 * once finished). Count and last time alone stay equal across a switch between two symbols loaded alike.
 */
export const barsKey = (c: Candle[], lastRunning: boolean): string =>
  `${c.length}|${c[0]?.time}|${c[0]?.close}|${c.at(-2)?.close}|${lastRunning ? '' : c.at(-1)?.close}`

/** The current patterns as one frame: bar times it spans, high and low of the pattern bars, each pattern once (latest). */
export function patternGroup(
  c: Candle[],
  hits: PatternHit[]
): { start: number; end: number; from: number; to: number; hi: number; lo: number; hits: PatternHit[] } | null {
  if (!hits.length) return null
  const latest = new Map<PatternId, PatternHit>()
  for (const h of [...hits].sort((a, b) => a.end - b.end)) latest.set(h.id, h)
  const start = Math.min(...hits.map((h) => h.start))
  const end = Math.max(...hits.map((h) => h.end))
  let hi = -Infinity
  let lo = Infinity
  for (const h of hits) for (let i = h.start; i <= h.end; i++) [hi, lo] = [Math.max(hi, c[i].high), Math.min(lo, c[i].low)]
  return { start, end, from: c[start].time, to: c[end].time, hi, lo, hits: [...latest.values()].sort((a, b) => a.start - b.start) }
}

/**
 * Chart-bar index ranges a frame over regular bars start…end covers: split where shaded pre/post bars lie between
 * two regular bars, so a pattern across the night does not frame the whole night.
 */
export function framePieces(idx: number[], start: number, end: number): [number, number][] {
  const out: [number, number][] = []
  for (let k = start; k <= end; k++) {
    const last = out.at(-1)
    if (last && idx[k] === last[1] + 1) last[1] = idx[k]
    else out.push([idx[k], idx[k]])
  }
  return out
}
