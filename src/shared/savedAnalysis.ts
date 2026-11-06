// A saved TradingAgents analysis from outside this device: a backup file (main/backupFormat.ts) or, on the phone,
// the paired PC (mobile/api.ts). Rebuilt from known fields only, so nothing broken gets stored or shown.
import type { SavedAnalysis } from '../main/agents'
import { parseStructured, PROVIDERS, type ProviderId } from './agents.ts'
import { parseChronos } from './chronosLink.ts'
import { SYMBOL_RE } from './types.ts'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** A saved analysis rebuilt from known fields only; null if it does not look like one. */
export function checkAnalysis(v: unknown): SavedAnalysis | null {
  if (!isObject(v)) return null
  const { id, symbol, ticker, date, createdAt, durationSec, provider, deepModel, quickModel, analysts, rating, reports, stats } = v
  const ok =
    typeof id === 'string' &&
    // Becomes the file name: only the format runAgents itself uses.
    /^\d{4}-\d{2}-\d{2}_\d{1,16}$/.test(id) &&
    typeof symbol === 'string' &&
    SYMBOL_RE.test(symbol) &&
    str(ticker, 40) &&
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    num(createdAt) &&
    num(durationSec) &&
    PROVIDERS.some((p) => p.id === provider) &&
    str(deepModel, 80) &&
    str(quickModel, 80) &&
    Array.isArray(analysts) &&
    analysts.length <= 20 &&
    analysts.every((a) => str(a, 40)) &&
    str(rating, 40) &&
    isObject(reports) &&
    Object.entries(reports).every(([k, r]) => k.length <= 40 && str(r, 500_000)) &&
    isObject(stats) &&
    num(stats.calls) &&
    num(stats.tokensIn) &&
    num(stats.tokensOut)
  if (!ok) return null
  return {
    id,
    symbol,
    ticker,
    date,
    createdAt,
    durationSec,
    provider: provider as ProviderId,
    deepModel,
    quickModel,
    analysts: analysts as string[],
    rating,
    reports: { ...(reports as Record<string, string>) },
    stats: { calls: stats.calls as number, tokensIn: stats.tokensIn as number, tokensOut: stats.tokensOut as number },
    // Since the Chronos link: optional, checked one by one; a broken one drops only that field.
    ...(parseChronos(v.chronos) && { chronos: parseChronos(v.chronos) }),
    ...(parseStructured(v.structured) && { structured: parseStructured(v.structured) })
  }
}

/** Only the analyses that pass checkAnalysis, at most `max`; anything but a list gives none. */
export const checkAnalyses = (v: unknown, max = 10_000): SavedAnalysis[] =>
  Array.isArray(v) ? v.slice(0, max).map(checkAnalysis).filter((a): a is SavedAnalysis => a !== null) : []
