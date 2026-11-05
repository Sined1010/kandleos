// Chronos-2 for the TradingAgents analysis: the daily forecast as a framed text for the market analyst only,
// the weighting line it is asked to write, and a fixed comparison with the agents' decision (no language model).
import type { Decision, Rating } from './agents.ts'
import { probabilityAbove, Q, trend, type ChanceGroup } from './forecast.ts'
import { SYMBOL_RE } from './types.ts'

/** What the analysis saw of Chronos: the daily forecast's last step, how reliable it was, and the text sent. */
export interface ChronosSnapshot {
  /** Symbol the forecast ran on (the Binance pair for crypto, while TradingAgents uses the Yahoo symbol). */
  pair: string
  /** Time of the last daily bar. */
  asOf: number
  base: number
  steps: number
  /** The 21 quantiles of the last step as shown (calibrated when switched on). */
  end: number[]
  factor: number | null
  /** skill = 1 - error / naiveError: below 0 the model was less accurate than "unchanged". */
  check: { runs: number; inside80: number; skill: number; chance: ChanceGroup[] } | null
  record: { settled: number; independent: number; inside80: number } | null
  block: string
  appVersion: string
}

/** Why an analysis ran without Chronos. */
export type ChronosSkip = { skipped: 'history' | 'load' | 'model' | 'declined' }

export const BLOCK_LIMIT = 4000

const SKIPS = ['history', 'load', 'model', 'declined'] as const
const fin = (v: unknown, min = -Infinity, max = Infinity): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Checks what the window sends and what a backup holds; undefined when it is not a valid snapshot or skip. */
export function parseChronos(v: unknown): ChronosSnapshot | ChronosSkip | undefined {
  if (!obj(v)) return undefined
  if ('skipped' in v) return SKIPS.includes(v.skipped) ? { skipped: v.skipped } : undefined
  const share = (x: unknown) => fin(x, 0, 1)
  const chanceOk = (g: unknown) => obj(g) && fin(g.from, 0, 1) && fin(g.to, 0, 1) && fin(g.cases, 0) && share(g.said) && share(g.rose)
  const c = v.check
  const r = v.record
  const ok =
    typeof v.pair === 'string' &&
    SYMBOL_RE.test(v.pair) &&
    fin(v.asOf, 0) &&
    fin(v.base, 0) &&
    v.base > 0 &&
    Number.isInteger(v.steps) &&
    v.steps >= 1 &&
    v.steps <= 64 &&
    Array.isArray(v.end) &&
    v.end.length === 21 &&
    v.end.every((x: unknown) => fin(x, 0) && (x as number) > 0) &&
    (v.factor === null || fin(v.factor, 0.1, 10)) &&
    (c === null || (obj(c) && Number.isInteger(c.runs) && c.runs >= 0 && share(c.inside80) && fin(c.skill, -100, 1) && Array.isArray(c.chance) && c.chance.length === 3 && c.chance.every(chanceOk))) &&
    (r === null || (obj(r) && fin(r.settled, 0) && fin(r.independent, 0) && share(r.inside80))) &&
    typeof v.block === 'string' &&
    v.block.length <= BLOCK_LIMIT &&
    typeof v.appVersion === 'string' &&
    v.appVersion.length <= 20
  if (!ok) return undefined
  const { pair, asOf, base, steps, end, factor, block, appVersion } = v
  return {
    pair, asOf, base, steps, end: [...end], factor,
    check: c && { runs: c.runs, inside80: c.inside80, skill: c.skill, chance: c.chance.map((g: ChanceGroup) => ({ from: g.from, to: g.to, cases: g.cases, said: g.said, rose: g.rose })) },
    record: r && { settled: r.settled, independent: r.independent, inside80: r.inside80 },
    block, appVersion
  }
}

const num = (v: number) => Number(v.toPrecision(6)).toString()
const pct = (v: number) => `${(v * 100).toFixed(1)} %`
const signedPct = (v: number) => `${v >= 0 ? '+' : ''}${pct(v)}`

/**
 * A snapshot that fails the checks (a quantile at or below zero after a crash, an extreme calibration factor)
 * becomes "without Chronos": the analysis then runs with a notice instead of being refused.
 */
export const chronosOrSkip = (v: unknown): ChronosSnapshot | ChronosSkip => parseChronos(v) ?? { skipped: 'model' }

/** The block appended to the market analyst's instrument context (English; the agents read English prompts). */
export function chronosBlock(s: Omit<ChronosSnapshot, 'block' | 'appVersion'>): string {
  const e = s.end
  const day = new Date(s.asOf * 1000).toISOString().slice(0, 10)
  const lines = [
    '## Statistical price forecast (Chronos-2) – context for the market analysis only',
    'Source: Chronos-2, a statistical time-series model run locally by KandleOS. It knows past closes only –',
    'no news, fundamentals, sentiment or indicators.',
    `Instrument: ${s.pair}, daily candles, data as of ${day}, last close ${num(s.base)}.`,
    `Forecast for the next ${s.steps} trading days: median ${num(e[Q.median])} (${signedPct(e[Q.median] / s.base - 1)}), ` +
      `80 % range ${num(e[Q.p10])} to ${num(e[Q.p90])} (${signedPct(e[Q.p10] / s.base - 1)} to ${signedPct(e[Q.p90] / s.base - 1)})` +
      (s.factor ? `, ranges calibrated ×${s.factor.toFixed(2)} from its backtests` : '') +
      `. Chance of a higher close at the end: ${pct(probabilityAbove(e, s.base))}.`
  ]
  if (s.check) {
    const c = s.check
    const groups = c.chance
      .filter((g) => g.cases >= 5)
      .map((g) => `when it gave ${g.from === 0 ? 'below 40 %' : g.to >= 1 ? 'above 60 %' : '40–60 %'} (avg. ${pct(g.said)}), the price rose in ${pct(g.rose)} of ${g.cases} cases`)
    lines.push(
      `Track record on this instrument: ${c.runs} backtests of ${s.steps} days each; the real close was inside the 80 % range ` +
        `${pct(c.inside80)} of the time (should be 80 %); it was ${pct(Math.abs(c.skill))} ${c.skill >= 0 ? 'more' : 'less'} accurate ` +
        `than simply assuming the price stays unchanged.` + (groups.length ? ` Chance check: ${groups.join('; ')}.` : '')
    )
  } else lines.push('Track record: no backtest – too little daily history to check this model on this instrument.')
  lines.push(
    s.record
      ? `Archive of real past forecasts: ${s.record.settled} settled, ${s.record.independent} independent, real close inside the 80 % range ${pct(s.record.inside80)}.`
      : 'Archive of real past forecasts: none yet.',
    'How to use it: this is weak evidence, not proof. Weigh it against your own indicators, and give it little weight',
    'when its track record is poor (less accurate than "unchanged", ranges too narrow, chance not borne out).',
    'Whenever you mention the forecast, mention its track record with it.',
    'Add exactly one line to your report, after your analysis – keep this line in English, label and level as written:',
    'CHRONOS-2 WEIGHTING: LOW|MEDIUM|HIGH – <one sentence why, in the report language>'
  )
  return lines.join('\n').slice(0, BLOCK_LIMIT)
}

const LEVELS: Record<string, 'low' | 'medium' | 'high'> = {
  low: 'low', medium: 'medium', high: 'high', niedrig: 'low', gering: 'low', mittel: 'medium', hoch: 'high'
}

/** The market analyst's weighting line; the last one counts, wherever it stands. Null when missing. */
export function readWeighting(report: string): { level: 'low' | 'medium' | 'high'; reason: string } | null {
  const re = /CHRONOS-2[\s-]*(?:WEIGHTING|GEWICHTUNG)[\s:*]*(LOW|MEDIUM|HIGH|NIEDRIG|GERING|MITTEL|HOCH)\b[\s*]*[-–—:]?\s*(.*)$/gim
  let last: RegExpExecArray | null = null
  for (let m = re.exec(report); m; m = re.exec(report)) last = m
  return last ? { level: LEVELS[last[1].toLowerCase()], reason: last[2].replace(/\*+/g, '').trim() } : null
}

export interface Comparison {
  direction: 'agree' | 'contradict' | 'neutral'
  chronos: 'up' | 'down' | 'flat'
  /** Where the price target lies in the fan at the end, and Chronos' chance of a close above it. */
  target: { zone: 'below' | 'in90' | 'in80' | 'in50' | 'above'; above: number } | null
  /** Chronos' chance of a close below the stop at the end (not whether it is touched on the way). */
  stop: { below: number } | null
}

const RATING_DIRECTION: Record<Rating, 'up' | 'down' | 'flat'> = {
  Buy: 'up', Overweight: 'up', Hold: 'flat', Underweight: 'down', Sell: 'down'
}

/** Fixed comparison of the agents' decision with the daily forecast. */
export function compareWithChronos(s: ChronosSnapshot, d: Pick<Decision, 'rating' | 'priceTarget' | 'stopLoss'>): Comparison {
  const e = s.end
  const chronos = trend(probabilityAbove(e, s.base))
  const agents = d.rating ? RATING_DIRECTION[d.rating] : 'flat'
  const direction = agents === 'flat' || chronos === 'flat' ? 'neutral' : agents === chronos ? 'agree' : 'contradict'
  const zoneOf = (t: number): NonNullable<Comparison['target']>['zone'] =>
    t < e[Q.p05] ? 'below' : t > e[Q.p95] ? 'above' : t >= e[Q.p25] && t <= e[Q.p75] ? 'in50' : t >= e[Q.p10] && t <= e[Q.p90] ? 'in80' : 'in90'
  return {
    direction,
    chronos,
    target: d.priceTarget ? { zone: zoneOf(d.priceTarget), above: probabilityAbove(e, d.priceTarget) } : null,
    stop: d.stopLoss ? { below: 1 - probabilityAbove(e, d.stopLoss) } : null
  }
}
