import { http } from './http.ts'

// Securities numbers for the info panel, from open or officially offered sources only: Alpaca's CUSIP for US
// stocks (computed into an ISIN), Deutsche Börse's public list of Xetra instruments, and Wikidata (CC0).

/** ISIN check digit (ISO 6166): letters count as 10–35, then Luhn over the digits, doubling from the right. */
function checkDigit(body: string): number {
  const digits = [...body].map((c) => parseInt(c, 36)).join('')
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = +digits[digits.length - 1 - i]
    if (i % 2 === 0) d = d * 2 > 9 ? d * 2 - 9 : d * 2
    sum += d
  }
  return (10 - (sum % 10)) % 10
}

export const isinValid = (s: string): boolean =>
  /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s) && checkDigit(s.slice(0, 11)) === +s[11]

/** A US ISIN is "US", the CUSIP and a check digit. */
export function isinFromCusip(cusip: unknown): string | undefined {
  if (typeof cusip !== 'string' || !/^[A-Z0-9]{9}$/.test(cusip)) return undefined
  return `US${cusip}${checkDigit('US' + cusip)}`
}

/** A German ISIN holds the WKN: DE + 000 + WKN + check digit (DE0007164600 → 716460). */
export const wknOf = (isin: string): string | undefined => (/^DE000[A-Z0-9]{6}\d$/.test(isin) ? isin.slice(5, 11) : undefined)

export type Ids = { isin: string; wkn?: string }

/** Mnemonic → ISIN and WKN from Deutsche Börse's semicolon-separated "All tradable instruments" file. */
export function parseXetra(text: string): Map<string, Ids> {
  const lines = text.split(/\r?\n/)
  const at = lines.findIndex((l) => l.split(';').includes('ISIN'))
  const out = new Map<string, Ids>()
  if (at < 0) return out
  const head = lines[at].split(';')
  const [iIsin, iWkn, iMn] = ['ISIN', 'WKN', 'Mnemonic'].map((n) => head.indexOf(n))
  for (const line of lines.slice(at + 1)) {
    const c = line.split(';')
    const isin = c[iIsin]?.trim()
    const mn = c[iMn]?.trim()
    if (!mn || !isin || !isinValid(isin)) continue
    // The file pads the six-character WKN with zeros to nine.
    const wkn = c[iWkn]?.trim().slice(-6)
    out.set(mn, { isin, wkn: wkn && /^[A-Z0-9]{6}$/.test(wkn) ? wkn : undefined })
  }
  return out
}

const SITE = 'https://www.cashmarket.deutsche-boerse.com'
const PAGE = SITE + '/cash-en/trading/Tradable-Instruments-Xetra'
// The address holds a hash that may change with the file; the download page names the current one, this is the
// last one seen in case the page cannot be read.
const XETRA = '/resource/blob/1528/ef73eef09b2e8353e17090956eee878b/data/t7-xetr-allTradableInstruments.csv'

/** The file's path on the download page; only a path, so the file always comes from Deutsche Börse's own host. */
export const xetraPath = (html: string): string | undefined =>
  html.match(/\/resource\/blob\/\d+\/[0-9a-f]+\/data\/t7-xetr-allTradableInstruments\.csv/)?.[0]

// shortcut: kept for the session only (about 5 MB once per start); a file cache per week if that proves too much.
let xetra: Promise<Map<string, Ids>> | null = null

async function loadXetra(): Promise<Map<string, Ids>> {
  // An honest name: the public download needs no browser disguise.
  const headers = { 'User-Agent': 'KandleOS' }
  const page = await http(PAGE, { headers, timeoutMs: 10_000 })
    .then((r) => (r.ok ? r.text() : ''))
    .catch(() => '')
  const res = await http(SITE + (xetraPath(page) ?? XETRA), { headers, timeoutMs: 30_000 })
  if (!res.ok) throw new Error(`Deutsche Börse HTTP ${res.status}`)
  return parseXetra(await res.text())
}

function xetraList(): Promise<Map<string, Ids>> {
  xetra ??= loadXetra().catch((e) => {
    // A minute before the next try: on a slow line every search keystroke would start the 5 MB download anew.
    setTimeout(() => (xetra = null), 60_000)
    throw e
  })
  return xetra
}

export const xetraIds = (mnemonic: string): Promise<Ids | undefined> => xetraList().then((m) => m.get(mnemonic))

/** Starts loading the list early, so a WKN search finds it ready; a failure only shows in the search itself. */
export const warmXetra = (): void => void xetraList().catch(() => {})

/** A six-character query with a digit may be a WKN ("716460", "A0RPWH"). */
export const looksLikeWkn = (q: string): boolean => /^(?=.*\d)[A-Z0-9]{6}$/.test(q)

/** ISIN and Xetra symbol (mnemonic) behind a WKN, from the Xetra list (German shares and the ETFs traded on Xetra). */
export const xetraOfWkn = (wkn: string): Promise<{ isin: string; mnemonic: string } | undefined> =>
  xetraList().then((m) => {
    for (const [mnemonic, ids] of m) if (ids.wkn === wkn) return { isin: ids.isin, mnemonic }
  })

// Wikidata items of the exchanges behind Yahoo's suffixes ('' = US). A ticker is only looked up on its own exchange.
const EXCHANGES: Record<string, string[]> = {
  '': ['Q82059', 'Q13677'], // Nasdaq, NYSE
  DE: ['Q151139'],
  F: ['Q151139'],
  PA: ['Q2385849'],
  AS: ['Q478720'],
  BR: ['Q1146518'],
  MI: ['Q936563'],
  MC: ['Q617426'],
  SW: ['Q661834'],
  L: ['Q171240'],
  VI: ['Q698535'],
  CO: ['Q1019983'],
  ST: ['Q1019992'],
  HE: ['Q581755'],
  OL: ['Q909158'],
  TO: ['Q818723'],
  T: ['Q217475'],
  HK: ['Q496672']
}
// Nordic share classes: Yahoo writes NOVO-B, Wikidata "NOVO B".
const NORDIC = new Set(['CO', 'ST', 'HE', 'OL'])

/** A home ticker as Wikidata may write it: Nordic share classes "NOVO B" or plain "NOVO", Hong Kong without zeros. */
export function tickerVariants(ticker: string, suffix: string): string[] {
  const out = [ticker]
  if (NORDIC.has(suffix)) out.push(ticker.replace('-', ' '), ticker.split('-')[0])
  if (suffix === 'HK') out.push(ticker.replace(/^0+/, ''))
  return [...new Set(out)]
}

/**
 * US listings that may carry Form 4 insider filings: foreign issuers listed on NYSE or Nasdaq report since 18.03.2026,
 * OTC ADRs do not. Which home countries are exempt: shared/events.ts NO_US_INSIDERS.
 */
export const ADR_EXCHANGES: Record<string, string> = { Q13677: 'NYSE', Q82059: 'Nasdaq' }

/** The company's one US listing among its Wikidata listings, or none when there is none or more than one. */
export function pickAdr(rows: { ex: string; ticker: string }[]): { symbol: string; exchange: string } | undefined {
  const us = new Map<string, string>()
  for (const { ex, ticker } of rows) {
    const symbol = ticker.trim().toUpperCase().replace('.', '-')
    if (ADR_EXCHANGES[ex] && /^[A-Z]{1,5}(-[A-Z])?$/.test(symbol)) us.set(symbol, ADR_EXCHANGES[ex])
  }
  if (us.size !== 1) return undefined
  const [[symbol, exchange]] = us
  return { symbol, exchange }
}

/**
 * The US listing of a company listed elsewhere (Toyota 7203.T → TM): the same Wikidata item as the home listing,
 * with a current NYSE or Nasdaq listing. Throws when Wikidata fails; the caller then shows no hint.
 */
export async function wikidataAdr(symbol: string): Promise<{ symbol: string; exchange: string } | undefined> {
  const [, base, suffix] = /^(.+)\.([A-Z]{1,2})$/.exec(symbol) ?? []
  const ex = suffix ? EXCHANGES[suffix] : undefined
  if (!ex) return undefined
  const tickers = tickerVariants(base, suffix).map((t) => JSON.stringify(t)).join(' ')
  const q = `SELECT DISTINCT ?ex ?ticker WHERE { VALUES ?home { ${ex.map((e) => 'wd:' + e).join(' ')} } VALUES ?t { ${tickers} }
    ?item p:P414 ?s . ?s pq:P249 ?t ; ps:P414 ?home . FILTER NOT EXISTS { ?s pq:P582 [] }
    ?item p:P414 ?u . ?u ps:P414 ?ex ; pq:P249 ?ticker . FILTER NOT EXISTS { ?u pq:P582 [] } }`
  const res = await http('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), {
    headers: { 'User-Agent': 'KandleOS (https://github.com/Sined1010/kandleos)', Accept: 'application/sparql-results+json' },
    timeoutMs: 10_000
  })
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`)
  const rows: any[] = (await res.json())?.results?.bindings ?? []
  return pickAdr(rows.map((r) => ({ ex: String(r?.ex?.value ?? '').split('/').pop()!, ticker: String(r?.ticker?.value ?? '') })))
}

/**
 * The one ISIN to show, or none: Wikidata lists every ISIN of a company (several share classes, sometimes broken
 * ones), and a wrong number is worse than none. ADRs have their own US ISIN: US listings only take US ISINs,
 * other exchanges leave out an ADR's next to the home one (Nestlé: CH… and US…).
 */
export function pickIsin(found: string[], suffix: string): string | undefined {
  const valid = [...new Set(found)].filter(isinValid)
  const home = valid.filter((s) => !s.startsWith('US'))
  const ok = suffix === '' ? valid.filter((s) => s.startsWith('US')) : home.length ? home : valid
  return ok.length === 1 ? ok[0] : undefined
}

export async function wikidataIsin(ticker: string, suffix: string): Promise<string | undefined> {
  const ex = EXCHANGES[suffix]
  if (!ex) return undefined
  const q = `SELECT DISTINCT ?isin WHERE { VALUES ?ex { ${ex.map((e) => 'wd:' + e).join(' ')} }
    ?item p:P414 ?s . ?s pq:P249 ?t ; ps:P414 ?ex . VALUES ?t { ${tickerVariants(ticker, suffix).map((v) => JSON.stringify(v)).join(' ')} } . ?item wdt:P946 ?isin
    FILTER NOT EXISTS { ?s pq:P582 [] } }` // a listing with an end date is over; its ticker may belong to another company now
  const res = await http('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), {
    // Wikidata asks every client to name itself.
    headers: { 'User-Agent': 'KandleOS (https://github.com/Sined1010/kandleos)', Accept: 'application/sparql-results+json' },
    timeoutMs: 10_000
  })
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`)
  const rows: any[] = (await res.json())?.results?.bindings ?? []
  return pickIsin(rows.map((r) => String(r?.isin?.value ?? '')), suffix)
}
