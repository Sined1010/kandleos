// Exchange trading calendar: session times in the exchange's own time zone (so DST shifts are right) and
// the public holidays of the main markets, keyed by the IANA time zone Yahoo reports for each exchange.

type Market = 'US' | 'DE' | 'UK' | 'EURONEXT' | 'CH'

// shortcut: other markets (Tokyo, Hong Kong, ...) get correct DST but no holidays; add rules here when needed.
const MARKETS: Record<string, Market> = {
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'Europe/Berlin': 'DE',
  'Europe/London': 'UK',
  'Europe/Paris': 'EURONEXT',
  'Europe/Amsterdam': 'EURONEXT',
  'Europe/Brussels': 'EURONEXT',
  'Europe/Lisbon': 'EURONEXT',
  'Europe/Zurich': 'CH'
}

// Yahoo/Finnhub market suffixes, for when the data source names no exchange time zone (Finnhub candles).
const SUFFIX_ZONES: Record<string, string> = {
  DE: 'Europe/Berlin',
  F: 'Europe/Berlin',
  MU: 'Europe/Berlin',
  DU: 'Europe/Berlin',
  HA: 'Europe/Berlin',
  HM: 'Europe/Berlin',
  SG: 'Europe/Berlin',
  BE: 'Europe/Berlin',
  L: 'Europe/London',
  PA: 'Europe/Paris',
  AS: 'Europe/Amsterdam',
  BR: 'Europe/Brussels',
  LS: 'Europe/Lisbon',
  MI: 'Europe/Rome',
  MC: 'Europe/Madrid',
  VI: 'Europe/Vienna',
  SW: 'Europe/Zurich',
  TO: 'America/Toronto',
  T: 'Asia/Tokyo',
  HK: 'Asia/Hong_Kong',
  AX: 'Australia/Sydney'
}

/** Exchange time zone from a ticker (SIE.DE, VOD.L); plain tickers and futures (GC=F) trade in New York. */
export function timeZoneForSymbol(symbol: string): string | undefined {
  const suffix = /\.([A-Z]{1,2})$/.exec(symbol)?.[1]
  if (suffix) return SUFFIX_ZONES[suffix]
  // An index (^GDAXI, ^N225) belongs to whichever exchange computes it; no safe guess.
  return symbol.startsWith('^') ? undefined : 'America/New_York'
}

/** Easter Sunday as [month 1-12, day] (anonymous Gregorian algorithm). */
export function easter(y: number): [number, number] {
  const a = y % 19
  const b = Math.floor(y / 100)
  const c = y % 100
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1]
}

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const iso = (dt: Date) => dt.toISOString().slice(0, 10)
const addDays = (dt: Date, n: number) => new Date(dt.getTime() + n * 86_400_000)
const isWeekend = (dt: Date) => dt.getUTCDay() % 6 === 0

/** n-th weekday `wd` (0 = Sunday) of a month; n = -1 means the last one. */
function nth(y: number, m: number, wd: number, n: number): Date {
  if (n > 0) {
    const first = day(y, m, 1)
    return addDays(first, ((wd - first.getUTCDay() + 7) % 7) + (n - 1) * 7)
  }
  const last = day(y, m + 1, 0)
  return addDays(last, -((last.getUTCDay() - wd + 7) % 7))
}

/** US rule: a Saturday holiday is observed on Friday, a Sunday one on Monday. */
const usObserved = (dt: Date) => (dt.getUTCDay() === 6 ? addDays(dt, -1) : dt.getUTCDay() === 0 ? addDays(dt, 1) : dt)

/** UK rule: weekend holidays move to the next weekday that is not already a holiday. */
function ukObserved(dates: Date[]): Date[] {
  const taken = new Set<string>()
  return dates.map((dt) => {
    while (isWeekend(dt) || taken.has(iso(dt))) dt = addDays(dt, 1)
    taken.add(iso(dt))
    return dt
  })
}

function holidays(market: Market, y: number): Date[] {
  const [em, ed] = easter(y)
  const sunday = day(y, em, ed)
  const goodFriday = addDays(sunday, -2)
  const easterMonday = addDays(sunday, 1)
  switch (market) {
    case 'US':
      return [
        // NYSE stays open on the Friday before a New Year's Day that falls on a Saturday.
        ...(day(y, 1, 1).getUTCDay() === 6 ? [] : [usObserved(day(y, 1, 1))]),
        nth(y, 1, 1, 3), // Martin Luther King Jr. Day
        nth(y, 2, 1, 3), // Presidents' Day
        goodFriday,
        nth(y, 5, 1, -1), // Memorial Day
        usObserved(day(y, 6, 19)), // Juneteenth
        usObserved(day(y, 7, 4)),
        nth(y, 9, 1, 1), // Labor Day
        nth(y, 11, 4, 4), // Thanksgiving
        usObserved(day(y, 12, 25))
      ]
    case 'DE':
      return [day(y, 1, 1), goodFriday, easterMonday, day(y, 5, 1), day(y, 12, 24), day(y, 12, 25), day(y, 12, 26), day(y, 12, 31)]
    case 'UK':
      return [
        ...ukObserved([day(y, 1, 1)]),
        goodFriday,
        easterMonday,
        nth(y, 5, 1, 1), // Early May bank holiday
        nth(y, 5, 1, -1), // Spring bank holiday
        nth(y, 8, 1, -1), // Summer bank holiday
        ...ukObserved([day(y, 12, 25), day(y, 12, 26)])
      ]
    case 'EURONEXT':
      return [day(y, 1, 1), goodFriday, easterMonday, day(y, 5, 1), day(y, 12, 25), day(y, 12, 26)]
    case 'CH':
      return [
        day(y, 1, 1),
        day(y, 1, 2),
        goodFriday,
        easterMonday,
        day(y, 5, 1),
        addDays(sunday, 39), // Ascension
        addDays(sunday, 50), // Whit Monday
        day(y, 8, 1),
        day(y, 12, 24),
        day(y, 12, 25),
        day(y, 12, 26),
        day(y, 12, 31)
      ]
  }
}

const holidayCache = new Map<string, Set<string>>()

/** Whether the exchange in `timeZone` is closed for a holiday on `date` (YYYY-MM-DD). */
export function isHoliday(timeZone: string, date: string): boolean {
  const market = MARKETS[timeZone]
  if (!market) return false
  const key = market + date.slice(0, 4)
  let set = holidayCache.get(key)
  if (!set) holidayCache.set(key, (set = new Set(holidays(market, +date.slice(0, 4)).map(iso))))
  return set.has(date)
}

const formats = new Map<string, Intl.DateTimeFormat>()

/** Wall-clock date and second of day of a UTC timestamp in a time zone. */
function wall(t: number, timeZone: string): { date: string; sec: number } {
  let f = formats.get(timeZone)
  if (!f) {
    const opts = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' } as const
    formats.set(timeZone, (f = new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', ...opts })))
  }
  const p = Object.fromEntries(f.formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, sec: +p.hour * 3600 + +p.minute * 60 + +p.second }
}

const dateSeconds = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000

/** UTC timestamp of a wall-clock time in a time zone, respecting that day's DST offset. */
function fromWall(date: string, sec: number, timeZone: string): number {
  const naive = dateSeconds(date) + sec
  let t = naive
  // Two rounds settle the offset even when the first guess lands on the other side of a DST switch.
  for (let i = 0; i < 2; i++) {
    const w = wall(t, timeZone)
    t = naive - (dateSeconds(w.date) + w.sec - t)
  }
  return t
}

const weekday = (date: string) => new Date(dateSeconds(date) * 1000).getUTCDay()
const nextDate = (date: string) => iso(new Date((dateSeconds(date) + 86_400) * 1000))

/**
 * Timestamps of the next `count` bars on the exchange's trading calendar: trading weekdays and session times
 * as seen in the history (in the exchange's own time zone, so DST is handled), minus exchange holidays.
 * Markets without gaps (crypto) and weekly bars are evenly spaced.
 */
export function futureTimes(times: number[], seconds: number, count: number, timeZone = 'UTC'): number[] {
  const last = times[times.length - 1]
  const even = () => Array.from({ length: count }, (_, i) => last + (i + 1) * seconds)
  // The calendar comes from the bars before the last one: Yahoo stamps the live bar with the current time.
  const history = times.slice(0, -1)
  const gappy = history.some((t, i) => i > 0 && t - history[i - 1] > seconds)
  if (seconds >= 604800 || !gappy) return even()
  // Finnhub stamps daily bars at 00:00 UTC as a plain date label; read in New York time that would be 20:00
  // of the previous day. Such bars are dated in UTC, Yahoo's session-time stamps in the exchange zone.
  const dateLabels = seconds >= 86400 && times.every((t) => t % 86400 === 0)
  const zone = dateLabels ? 'UTC' : timeZone
  const walls = history.map((t) => wall(t, zone))
  const weekdays = new Set(walls.map((w) => weekday(w.date)))
  const end = wall(last, zone)
  // Daily bars keep the last bar's wall-clock time; intraday bars use every time of day the session has.
  const slots = seconds >= 86400 ? [end.sec] : [...new Set(walls.map((w) => w.sec))].sort((a, b) => a - b)
  const out: number[] = []
  for (let date = end.date, guard = 0; out.length < count && guard < 4000; date = nextDate(date), guard++) {
    if (!weekdays.has(weekday(date)) || isHoliday(timeZone, date)) continue
    for (const s of slots) {
      const t = fromWall(date, s, zone)
      if (t > last && out.length < count) out.push(t)
    }
  }
  return out.length === count ? out : even()
}
