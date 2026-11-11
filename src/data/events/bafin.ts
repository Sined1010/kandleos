// Directors' dealings of German issuers from BaFin's public database (CSV export, last 12 months).
import type { InsiderDeal, Role } from '../../shared/events.ts'
import { http } from '../http.ts'

export function bafinUrl(isin: string, zeitraum: 0 | 1 | 2): string {
  return (
    'https://portal.mvp.bafin.de/database/DealingsInfo/sucheForm.do?emittentIsin=' + encodeURIComponent(isin) +
    `&emittentName=&meldepflichtigerName=&zeitraum=${zeitraum}&emittentButton=Suche+Emittent&d-4000784-e=1&6578706f7274=1`
  )
}

const ROLES: Record<string, Role> = {
  Vorstand: 'vorstand',
  Aufsichtsrat: 'aufsichtsrat',
  'Sonstige Führungsperson': 'fuehrung',
  'in enger Beziehung': 'nahestehend'
}
const COLUMNS = {
  isin: 'ISIN',
  person: 'Meldepflichtiger',
  role: 'Position / Status',
  instrument: 'Art des Instruments',
  kind: 'Art des Geschäfts',
  price: 'Durchschnittspreis',
  volume: 'Aggregiertes Volumen',
  notified: 'Mitteilungsdatum',
  date: 'Datum des Geschäfts',
  venue: 'Ort des Geschäfts',
  activated: 'Datum der Aktivierung'
}

/** "267.450,00 EUR" → [267450, 'EUR'] */
function amount(s: string): [number | undefined, string | undefined] {
  const m = /^([\d.]+(?:,\d+)?)\s*([A-Z]{3})?$/.exec(s.trim())
  if (!m) return [undefined, undefined]
  return [Number(m[1].replace(/\./g, '').replace(',', '.')), m[2]]
}
/** "26.08.2026 15:34:16" → "2026-08-26" */
const day = (s: string): string | undefined => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(s.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined
}

/**
 * Buys and sells of shares; with `isin` only rows of exactly that ISIN. `hidden` counts that issuer's other rows
 * (derivatives, other dealings), so the list can say what it leaves out. Throws when the text is not BaFin's CSV.
 */
export function parseBafin(csv: string, isin?: string): { deals: InsiderDeal[]; hidden: number } {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/)
  const head = lines[0].split(';')
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, name]) => [k, head.indexOf(name)])) as Record<keyof typeof COLUMNS, number>
  if (Object.values(col).some((i) => i < 0)) throw new Error('BaFin: unexpected answer (no CSV)')
  const out: InsiderDeal[] = []
  let hidden = 0
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const c = line.split(';')
    const get = (k: keyof typeof COLUMNS) => (c[col[k]] ?? '').trim()
    if (isin && get('isin') !== isin) continue
    const side = get('kind') === 'Kauf' ? 'buy' : get('kind') === 'Verkauf' ? 'sell' : undefined
    if (!side || get('instrument') !== 'Aktie') {
      hidden++
      continue
    }
    const date = day(get('date'))
    const published = day(get('activated')) ?? day(get('notified'))
    if (!date || !published) continue
    const [price, priceCur] = amount(get('price'))
    const [volume, volumeCur] = amount(get('volume'))
    const deal: InsiderDeal = { source: 'BaFin', person: get('person'), side, date, published, venue: get('venue') }
    const role = ROLES[get('role')]
    const currency = volumeCur ?? priceCur
    if (role) deal.role = role
    if (price) deal.price = price
    if (volume !== undefined) deal.volume = volume
    if (price && volume !== undefined) deal.shares = Math.round(volume / price)
    if (currency) deal.currency = currency
    out.push(deal)
  }
  return { deals: out, hidden }
}

export type CsvLoader = (url: string) => Promise<string>

let load: CsvLoader = async (url) => {
  const res = await http(url, { headers: { 'User-Agent': 'KandleOS' }, timeoutMs: 12_000 })
  if (!res.ok) throw new Error(`BaFin HTTP ${res.status}`)
  return res.text()
}

/** The PC reads BaFin through Electron's net.fetch: Node's fetch rejects the server's malformed headers. */
export function setCsvLoader(fn: CsvLoader): void {
  load = fn
}

/** zeitraum: 0 = all (12 months), 1 = last week, 2 = last month; '' as ISIN asks for every issuer (later radar). */
export async function bafinDeals(isin: string, zeitraum: 0 | 1 | 2 = 0): Promise<{ deals: InsiderDeal[]; hidden: number }> {
  return parseBafin(await load(bafinUrl(isin, zeitraum)), isin || undefined)
}
