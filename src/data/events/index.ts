// The events of one symbol from the source that serves it, kept for a while so switching back and forth is free.
// The sources come in as dependencies, so this file loads under node --test (see symbolEvents.ts for the app's).
import type { EventsResult, Filing, InsiderDeal, NewsItem, SourceNote } from '../../shared/events.ts'
import { adrMayReport, eventRoute } from '../../shared/events.ts'
import { t } from '../../shared/i18n.ts'
import { SYMBOL_RE } from '../../shared/types.ts'
import { wikidataIsin, xetraIds } from '../isin.ts'

export interface EventDeps {
  isin(symbol: string): Promise<string | undefined>
  bafin(isin: string): Promise<{ deals: InsiderDeal[]; hidden: number; via?: 'pc' }>
  insider(symbol: string, key: string): Promise<{ deals: InsiderDeal[]; truncated: boolean; hidden: number }>
  filings(symbol: string, key: string): Promise<Filing[]>
  news(symbol: string, key: string): Promise<NewsItem[]>
  /** The US listing (NYSE/Nasdaq) of a company listed elsewhere, from Wikidata. */
  adr?(symbol: string): Promise<{ symbol: string; exchange: string } | undefined>
  /** Unix seconds. */
  now(): number
}

const GOOD_SECONDS = 15 * 60
const ERROR_SECONDS = 60

/**
 * ISIN of a `.DE`/`.F` listing for BaFin: the Xetra list, and Wikidata only when the list lacks the symbol.
 * Unlike securityIds (which reports "none" when a source fails), a failed source throws, so the list says
 * "BaFin is not reachable" and tries again in a minute instead of "no open source".
 */
export async function germanIsin(symbol: string, lookups = { xetra: xetraIds, wikidata: wikidataIsin }): Promise<string | undefined> {
  const [, base, suffix] = /^(.+)\.(DE|F)$/.exec(symbol) ?? []
  if (!base) return undefined
  return (await lookups.xetra(base))?.isin ?? (await lookups.wikidata(base, suffix))
}

/** Undefined when `p` takes longer than `ms`. */
async function within<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let late!: (v: undefined) => void
  const timeout = new Promise<undefined>((ok) => (late = ok))
  const timer = setTimeout(late, ms)
  try {
    return await Promise.race([p, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export function createSymbolEvents(deps: EventDeps): (symbol: unknown, key: unknown) => Promise<EventsResult> {
  const cache = new Map<string, { at: number; seconds: number; result: Promise<EventsResult> }>()

  async function load(symbol: string, key: string): Promise<EventsResult> {
    const r: EventsResult = { deals: [], filings: [], news: [], notes: [], fetchedAt: deps.now() }
    const fail = (part: SourceNote['part'], source: 'BaFin' | 'Finnhub') => (e: unknown) => {
      console.warn(`events ${symbol}: ${(e as Error)?.message}`)
      r.notes.push({ part, state: 'error', source })
    }
    // A German listing needs its ISIN; a lookup that fails or hangs (the Xetra list is 5 MB) is an error worth
    // retrying in a minute, not "no open source".
    let isin: string | undefined
    if (/\.(DE|F)$/.test(symbol)) {
      const found = await within(deps.isin(symbol).then((v) => ({ v }), () => null), 10_000)
      if (!found) {
        r.source = 'BaFin'
        fail('insider', 'BaFin')(new Error('ISIN lookup failed'))
        return r
      }
      isin = found.v
    }
    // A German listing whose ISIN is not known: BaFin cannot be asked (not "no open source" for the exchange).
    if (/\.(DE|F)$/.test(symbol) && !isin) {
      r.notes.push({ part: 'insider', state: 'no-isin', source: 'BaFin' })
      return r
    }
    const route = eventRoute(symbol, isin)
    if (route === 'bafin') {
      r.source = 'BaFin'
      await deps.bafin(isin!).then(
        ({ deals, hidden, via }) => void Object.assign(r, { deals, hidden }, via && { via }),
        // The phone reads BaFin through its paired PC when its own request fails; without the PC it says so.
        (e) => {
          if ((e as Error)?.name !== 'PcNeeded') return fail('insider', 'BaFin')(e)
          const msg = (e as Error).message
          const reason = msg === 'unknown-op' ? 'unknown-op' : msg === 'not-paired' || msg === 'removed' ? 'not-paired' : 'offline'
          r.notes.push({ part: 'insider', state: 'via-pc', source: 'BaFin', reason })
        }
      )
    } else if (route === 'finnhub' && !key) {
      r.notes.push({ part: 'insider', state: 'no-key' }, { part: 'filings', state: 'no-key' }, { part: 'news', state: 'no-key' })
    } else if (route === 'finnhub') {
      r.source = 'Finnhub'
      const [insider, filings, news] = await Promise.allSettled([deps.insider(symbol, key), deps.filings(symbol, key), deps.news(symbol, key)])
      if (insider.status === 'fulfilled') {
        r.deals = insider.value.deals
        r.hidden = insider.value.hidden
        if (insider.value.truncated) r.notes.push({ part: 'insider', state: 'truncated', source: 'Finnhub' })
      } else fail('insider', 'Finnhub')(insider.reason)
      if (filings.status === 'fulfilled') r.filings = filings.value
      else fail('filings', 'Finnhub')(filings.reason)
      if (news.status === 'fulfilled') r.news = news.value
      else fail('news', 'Finnhub')(news.reason)
    } else {
      r.notes.push({ part: 'insider', state: route === 'home' ? 'home' : 'no-source' })
      // An exchange listing without a source may have a US listing whose insiders report there (Toyota → TM).
      // A failing or slow lookup gives no hint rather than a wrong one.
      if (route === 'none' && deps.adr && adrMayReport(symbol)) {
        const adr = await within(deps.adr(symbol).catch(() => undefined), 10_000)
        if (adr) r.adr = adr
      }
    }
    return r
  }

  return (symbolArg, keyArg) => {
    if (typeof symbolArg !== 'string' || !SYMBOL_RE.test(symbolArg)) {
      return Promise.reject(new Error(t('Ungültiges Symbol: {symbol}', { symbol: String(symbolArg) })))
    }
    const key = typeof keyArg === 'string' && /^[A-Za-z0-9]{1,64}$/.test(keyArg) ? keyArg : ''
    const id = `${symbolArg}|${key ? 1 : 0}`
    const now = deps.now()
    const hit = cache.get(id)
    if (hit && now - hit.at < hit.seconds) return hit.result
    for (const [k, e] of cache) if (now - e.at >= e.seconds) cache.delete(k)
    // The promise is kept, so two calls at once fetch only once.
    const entry = { at: now, seconds: GOOD_SECONDS, result: load(symbolArg, key) }
    cache.set(id, entry)
    entry.result.then(
      (r) => void (r.notes.some((n) => n.state === 'error' || n.state === 'via-pc') && (entry.seconds = ERROR_SECONDS)),
      () => cache.delete(id)
    )
    return entry.result
  }
}
