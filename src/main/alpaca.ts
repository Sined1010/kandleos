import { app, safeStorage } from 'electron'
import { readFileSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { aggregate } from '../shared/candles'
import { t } from '../shared/i18n'
import { phaseAt } from '../shared/market'
import { cleanName } from '../shared/names'
import { TF_SECONDS, type Candle, type CandleData, type Quote, type SearchResult, type Timeframe } from '../shared/types'

// Alpaca's market data API with the user's own free key: US stocks and ETFs. The free plan serves all US
// exchanges (SIP) up to 15 minutes ago and real-time data from the IEX exchange only.
const DATA = 'https://data.alpaca.markets/v2'
const ZONE = 'America/New_York'

// Keys stay in the main process, encrypted for this OS user like the other keys; the window only learns
// whether they are set.
const keyFile = (): string => join(app.getPath('userData'), 'alpaca-key.bin')
const plainKeyFile = (): string => join(app.getPath('userData'), 'alpaca-key.json')
type Keys = { id: string; secret: string }
let cached: Keys | null | undefined

function keys(): Keys | null {
  if (cached !== undefined) return cached
  try {
    cached = JSON.parse(safeStorage.decryptString(readFileSync(keyFile())))
  } catch {
    try {
      cached = JSON.parse(readFileSync(plainKeyFile(), 'utf8'))
    } catch {
      cached = null
    }
  }
  return cached ?? null
}

export const alpacaHasKeys = (): boolean => !!keys()

const KEY_RE = /^[A-Za-z0-9]{10,80}$/

async function request(url: string, k: Keys | null = keys()): Promise<any> {
  if (!k) throw new Error(t('Kein Alpaca-Key hinterlegt. In den Einstellungen eintragen.'))
  const res = await fetch(url, {
    headers: { 'APCA-API-KEY-ID': k.id, 'APCA-API-SECRET-KEY': k.secret },
    signal: AbortSignal.timeout(15_000)
  })
  if (res.status === 401 || res.status === 403) throw new Error(t('Alpaca: API-Key ungültig'))
  if (res.status === 429) throw new Error(t('Alpaca: Anfragelimit erreicht, gleich erneut versuchen'))
  if (!res.ok) throw new Error(`Alpaca HTTP ${res.status}`)
  return res.json()
}

/** Checks and saves the key pair (empty values remove it). Returns null if it works, else the reason. */
export async function setAlpacaKeys(idArg: unknown, secretArg: unknown): Promise<string | null> {
  const id = typeof idArg === 'string' ? idArg.trim() : ''
  const secret = typeof secretArg === 'string' ? secretArg.trim() : ''
  if (!id && !secret) {
    await rm(keyFile(), { force: true })
    await rm(plainKeyFile(), { force: true })
    cached = null
    return null
  }
  if (!KEY_RE.test(id) || !KEY_RE.test(secret)) return t('Ungültiges Key-Format')
  try {
    await request(`${DATA}/stocks/snapshots?symbols=AAPL&feed=iex`, { id, secret })
  } catch (e) {
    return (e as Error).name === 'TimeoutError' ? t('Alpaca nicht erreichbar') : (e as Error).message
  }
  await rm(keyFile(), { force: true })
  await rm(plainKeyFile(), { force: true })
  const json = JSON.stringify({ id, secret })
  if (safeStorage.isEncryptionAvailable()) await writeFile(keyFile(), safeStorage.encryptString(json))
  // shortcut: without an OS keyring (some Linux setups) the keys are plain text readable only by this user.
  else await writeFile(plainKeyFile(), json, { mode: 0o600 })
  cached = { id, secret }
  return null
}

/** Alpaca writes share classes with a dot (BRK.B), Yahoo with a dash (BRK-B). */
const ticker = (symbol: string) => symbol.replace('-', '.')

/** Indices, futures, currencies and foreign listings (^GSPC, GC=F, EURUSD=X, SAP.DE) are not on Alpaca. */
export function alpacaKnows(symbol: string): boolean {
  return !/[\^=]/.test(symbol) && !/\.[A-Z]{2,}$/.test(symbol)
}

function notListed(symbol: string): Error {
  return new Error(
    t('{symbol} gibt es bei Alpaca nicht: Alpaca liefert nur US-Aktien und ETFs. Indizes, Rohstoffe und ausländische Börsen gibt es mit Yahoo Finance (Einstellungen).', { symbol })
  )
}

const TIMEFRAME: Record<Timeframe, string> = {
  '1m': '1Min',
  '5m': '5Min',
  '15m': '15Min',
  '30m': '30Min',
  '1h': '1Hour',
  '2h': '2Hour',
  '4h': '4Hour',
  '1D': '1Day',
  '1W': '1Week',
  '1M': '1Month',
  '3M': '3Month',
  '6M': '6Month',
  '12M': '12Month'
}
// Days of history per candle size, about as much as the other sources deliver.
const DAYS: Record<Timeframe, number> = {
  '1m': 5,
  '5m': 30,
  '15m': 60,
  '30m': 120,
  '1h': 180,
  '2h': 365,
  '4h': 365,
  '1D': 1825,
  '1W': 3650,
  '1M': 18250,
  '3M': 18250,
  '6M': 18250,
  '12M': 18250
}

const toCandle = (b: any): Candle => ({ time: Date.parse(b.t) / 1000, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v })

async function bars(symbol: string, timeframe: string, start: Date, feed: 'sip' | 'iex'): Promise<Candle[]> {
  const out: Candle[] = []
  let page: string | undefined
  // Pages of up to 10,000 bars; a few are plenty for the spans above.
  for (let i = 0; i < 5; i++) {
    const d = await request(
      `${DATA}/stocks/bars?symbols=${encodeURIComponent(symbol)}&timeframe=${timeframe}&start=${start.toISOString()}` +
        `&limit=10000&adjustment=split&feed=${feed}` +
        (page ? `&page_token=${encodeURIComponent(page)}` : '')
    )
    out.push(...(d.bars?.[symbol] ?? []).map(toCandle))
    page = d.next_page_token ?? undefined
    if (!page) break
  }
  return out
}

/**
 * Candles from Alpaca. The free plan's full-market (SIP) data ends 15 minutes ago; for intraday charts the
 * last minutes come from IEX, the one exchange it serves in real time, and live quotes continue from there.
 */
export async function alpacaCandles(symbol: string, tf: Timeframe, extended: boolean): Promise<CandleData> {
  if (!alpacaKnows(symbol)) throw notListed(symbol)
  const s = ticker(symbol)
  const intraday = TF_SECONDS[tf] < 86400
  const start = new Date(Date.now() - DAYS[tf] * 86400_000)
  // Alpaca's hourly bars start on the clock hour and so mix the pre-market into the 9:00 bar. Without
  // extended hours, hours are built from half hours that start with the session at 9:30.
  const hourly = intraday && !extended && TF_SECONDS[tf] >= 3600
  const timeframe = hourly ? '30Min' : TIMEFRAME[tf]
  let candles = await bars(s, timeframe, start, 'sip')
  if (intraday) {
    const last = candles[candles.length - 1]
    const recent = await bars(s, timeframe, new Date(last ? last.time * 1000 : Date.now() - 3600_000), 'iex').catch(
      () => []
    )
    for (const c of recent) {
      const prev = candles[candles.length - 1]
      if (!prev || c.time > prev.time) candles.push(c)
      // The full-market bar stops 15 minutes ago; IEX trades carry it on to now.
      else if (c.time === prev.time)
        Object.assign(prev, { high: Math.max(prev.high, c.high), low: Math.min(prev.low, c.low), close: c.close })
    }
    if (!extended) candles = candles.filter((c) => phaseAt(symbol, ZONE, c.time) === 'open')
  }
  if (!candles.length) throw new Error(t('Keine Kursdaten für {symbol}', { symbol }))
  if (hourly) {
    // Hours from 9:30 (a half-hour offset from the clock), then 2h/4h from those like the other sources.
    candles = aggregate(candles, 3600, 1800)
    if (tf !== '1h') candles = aggregate(candles, TF_SECONDS[tf])
  }
  return { candles, currency: 'USD', timezone: ZONE }
}

const dayOf = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date(t * 1000))

/** Latest prices from IEX (real time on the free plan) with the change against the previous close. */
export async function alpacaQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const listed = symbols.filter(alpacaKnows)
  if (!listed.length) return {}
  const d = await request(`${DATA}/stocks/snapshots?symbols=${listed.map(ticker).map(encodeURIComponent).join(',')}&feed=iex`)
  const out: Record<string, Quote> = {}
  for (const symbol of listed) {
    const snap = d[ticker(symbol)]
    const trade = snap?.latestTrade
    if (!trade?.p) continue
    const time = Date.parse(trade.t) / 1000
    const daily = snap.dailyBar
    const prevDaily = snap.prevDailyBar
    const phase = phaseAt(symbol, ZONE, time)
    if ((phase === 'pre' || phase === 'post') && daily?.c) {
      // Outside the session the regular price is the day bar's close; the trade is the extra price.
      const prev = prevDaily?.c ?? daily.c
      out[symbol] = {
        price: daily.c,
        changePct: (daily.c / prev - 1) * 100,
        time: Date.parse(daily.t) / 1000,
        prevClose: prev,
        timezone: ZONE,
        ext: { phase, price: trade.p, changePct: (trade.p / daily.c - 1) * 100, time }
      }
      continue
    }
    // During the session the day bar is today's, so the previous close is the bar before it.
    const today = daily && dayOf(Date.parse(daily.t) / 1000) === dayOf(time)
    const prev = (today ? prevDaily?.c : daily?.c) ?? trade.p
    out[symbol] = { price: trade.p, changePct: (trade.p / prev - 1) * 100, time, prevClose: prev, timezone: ZONE }
  }
  return out
}

// The asset list (about 12,000 US stocks and ETFs) is loaded once per session for search and names.
let assets: Promise<{ symbol: string; name: string; exchange: string }[]> | null = null

function assetList(): Promise<{ symbol: string; name: string; exchange: string }[]> {
  // Keys of live and paper accounts each work only on their own trading endpoint.
  assets ??= request('https://api.alpaca.markets/v2/assets?status=active&asset_class=us_equity')
    .catch(() => request('https://paper-api.alpaca.markets/v2/assets?status=active&asset_class=us_equity'))
    .then((list: any[]) =>
      list.map((a) => ({ symbol: String(a.symbol), name: cleanName(String(a.name ?? ''), false), exchange: String(a.exchange ?? '') }))
    )
    .catch((e) => {
      assets = null
      throw e
    })
  return assets
}

/** US stocks and ETFs whose symbol or name matches the query; exact symbol first, then symbol prefixes. */
export async function alpacaSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim().toUpperCase()
  const list = await assetList()
  const rank = (a: { symbol: string; name: string }) =>
    a.symbol === q ? 0 : a.symbol.startsWith(q) ? 1 : a.name.toUpperCase().startsWith(q) ? 2 : 3
  return list
    .filter((a) => a.symbol.startsWith(q) || a.name.toUpperCase().includes(q))
    .sort((a, b) => rank(a) - rank(b) || a.symbol.length - b.symbol.length)
    .slice(0, 10)
    .map((a) => ({ symbol: a.symbol.replace('.', '-'), name: a.name, exchange: a.exchange }))
}

export async function alpacaName(symbol: string): Promise<string | null> {
  if (!alpacaKnows(symbol)) return null
  const s = ticker(symbol)
  return (await assetList()).find((a) => a.symbol === s)?.name || null
}
