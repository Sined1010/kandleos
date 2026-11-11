// Insider dealings, 8-K filings and company news of US listings from Finnhub (the user's own key).
// Checked with the user's free-plan key on 2026-11-11: other exchanges answer 403, `currency` is always empty,
// and there is no 100-row cap per call (TEAM: 842 rows for a year).
import type { Filing, InsiderDeal, NewsItem } from '../../shared/events.ts'
import { alpacaKnows } from '../../shared/types.ts'
import { http } from '../http.ts'

const API = 'https://finnhub.io/api/v1'

async function getJson(path: string, key: string): Promise<any> {
  // The key travels in the header only; a redirect would carry it along, so it is not followed.
  const res = await http(API + path, { headers: { 'X-Finnhub-Token': key }, redirect: 'manual', timeoutMs: 10_000 })
  if (!res.ok) throw new Error(`finnhub.io HTTP ${res.status}`)
  return res.json()
}

const day = (daysAgo: number): string => new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10)
// Finnhub writes share classes with a dot (BRK.B), Yahoo with a dash (BRK-B).
const sym = (symbol: string): string => encodeURIComponent(symbol.replace('-', '.'))
const span = (days: number): string => `&from=${day(days)}&to=${day(0)}`
const pos = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined)
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
// The window opens https links only.
const https = (v: unknown): string | undefined => text(v)?.replace(/^http:\/\//, 'https://').match(/^https:\/\/\S+$/)?.[0]
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Buys (P) and sells (S) only; `usd`: a row without a currency is in US dollars (US listings). */
export function finnhubDeals(rows: unknown, usd: boolean): InsiderDeal[] {
  if (!Array.isArray(rows)) return []
  const out: InsiderDeal[] = []
  for (const r of rows) {
    if (!r || typeof r !== 'object' || r.isDerivative === true) continue
    const change = typeof r.change === 'number' ? r.change : 0
    const side = r.transactionCode === 'P' && change > 0 ? 'buy' : r.transactionCode === 'S' && change < 0 ? 'sell' : undefined
    const person = text(r.name)
    const date = text(r.transactionDate)?.slice(0, 10)
    const published = text(r.filingDate)?.slice(0, 10)
    if (!side || !person || !date || !published || !DAY_RE.test(date) || !DAY_RE.test(published)) continue
    const shares = Math.abs(change)
    const price = pos(r.transactionPrice)
    // Finnhub sends currency as '' – empty counts as missing.
    const currency = text(r.currency) ?? (usd ? 'USD' : undefined)
    const deal: InsiderDeal = { source: 'Finnhub', person, side, date, published, shares }
    if (price) Object.assign(deal, { price, volume: shares * price })
    if (currency) deal.currency = currency
    if (typeof r.share === 'number' && Number.isFinite(r.share)) deal.holdingAfter = r.share
    out.push(deal)
  }
  return out
}

/** Answers of this size may be cut off by Finnhub (none seen so far: TEAM 842 rows in one call). */
export const FINNHUB_ROW_CAP = 1000

export async function finnhubInsider(symbol: string, key: string): Promise<{ deals: InsiderDeal[]; truncated: boolean; hidden: number }> {
  const body = await getJson(`/stock/insider-transactions?symbol=${sym(symbol)}${span(365)}`, key)
  const rows: unknown[] = Array.isArray(body?.data) ? body.data : []
  const deals = finnhubDeals(rows, alpacaKnows(symbol))
  // Rows left out: option exercises, awards, gifts, tax withholding, derivatives.
  return { deals, truncated: rows.length >= FINNHUB_ROW_CAP, hidden: rows.length - deals.length }
}

export async function finnhubFilings(symbol: string, key: string): Promise<Filing[]> {
  const body = await getJson(`/stock/filings?symbol=${sym(symbol)}&form=8-K${span(365)}`, key)
  if (!Array.isArray(body)) return []
  const out: Filing[] = []
  for (const f of body) {
    const date = text(f?.filedDate)?.slice(0, 10)
    const url = https(f?.filingUrl) ?? https(f?.reportUrl)
    if (f?.form === '8-K' && date && DAY_RE.test(date) && url) out.push({ form: '8-K', date, url })
  }
  return out
}

export async function finnhubNews(symbol: string, key: string): Promise<NewsItem[]> {
  const body = await getJson(`/company-news?symbol=${sym(symbol)}${span(30)}`, key)
  if (!Array.isArray(body)) return []
  const out: NewsItem[] = []
  for (const n of body) {
    const headline = text(n?.headline)
    const url = https(n?.url)
    if (headline && url && typeof n.datetime === 'number' && Number.isFinite(n.datetime)) out.push({ time: n.datetime, headline, source: text(n.source) ?? '', url })
  }
  return out.sort((a, b) => b.time - a.time).slice(0, 50)
}
