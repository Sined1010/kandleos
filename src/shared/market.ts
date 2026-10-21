// Whether a market is trading right now, from fixed trading hours per exchange plus the holiday and
// early-close rules in calendar.ts. Times are wall-clock seconds after midnight in the exchange's zone.
import { earlyClose, fromWall, isHoliday, nextDate, wall, weekday } from './calendar.ts'
import { isCrypto } from './types.ts'

export type Phase = 'open' | 'pre' | 'post' | 'break' | 'closed'

export interface MarketStatus {
  phase: Phase
  /** Closed on a weekday because of an exchange holiday. */
  holiday?: boolean
  /** When the phase changes next (unix seconds) and to what; missing for markets that never close. */
  next?: { time: number; phase: Phase }
}

interface Hours {
  open: number
  close: number
  /** Extended hours before and after the regular session (US only). */
  pre?: number
  post?: number
  /** Midday break of Asian exchanges. */
  lunch?: [number, number]
}

const h = (hours: number, minutes = 0) => hours * 3600 + minutes * 60
const EU: Hours = { open: h(9), close: h(17, 30) }

// shortcut: regular sessions of the main exchanges per Yahoo time zone; add a zone here to get a status for it.
const EXCHANGES: Record<string, Hours> = {
  'America/New_York': { open: h(9, 30), close: h(16), pre: h(4), post: h(20) },
  'America/Toronto': { open: h(9, 30), close: h(16) },
  'Europe/Berlin': EU, // XETRA
  'Europe/London': { open: h(8), close: h(16, 30) },
  'Europe/Paris': EU,
  'Europe/Amsterdam': EU,
  'Europe/Brussels': EU,
  'Europe/Lisbon': { open: h(8), close: h(16, 30) },
  'Europe/Madrid': EU,
  'Europe/Rome': EU,
  'Europe/Vienna': EU,
  'Europe/Zurich': EU,
  'Asia/Tokyo': { open: h(9), close: h(15, 30), lunch: [h(11, 30), h(12, 30)] },
  'Asia/Hong_Kong': { open: h(9, 30), close: h(16), lunch: [h(12), h(13)] },
  'Asia/Shanghai': { open: h(9, 30), close: h(15), lunch: [h(11, 30), h(13)] },
  'Asia/Kolkata': { open: h(9, 15), close: h(15, 30) },
  'Australia/Sydney': { open: h(10), close: h(16) }
}

// German regional exchanges (Frankfurt, Munich, Stuttgart, ...) trade far longer than XETRA.
const GERMAN_FLOORS = new Set(['F', 'MU', 'SG', 'BE', 'DU', 'HM', 'HA'])

interface Schedule {
  zone: string
  phase: (date: string, sec: number) => Phase
  /** Seconds of day at which the phase may change on that date. */
  edges: (date: string) => number[]
}

function exchange(zone: string, hours: Hours): Schedule {
  const today = (date: string): Hours | null => {
    if (weekday(date) % 6 === 0 || isHoliday(zone, date)) return null
    const early = earlyClose(zone, date)
    // After an early close the US evening session ends four hours later, as on a normal day.
    return early === undefined ? hours : { ...hours, close: early, post: hours.post && early + h(4) }
  }
  return {
    zone,
    phase: (date, sec) => {
      const d = today(date)
      if (!d) return 'closed'
      if (d.lunch && sec >= d.lunch[0] && sec < d.lunch[1]) return 'break'
      if (sec >= d.open && sec < d.close) return 'open'
      if (d.pre !== undefined && sec >= d.pre && sec < d.open) return 'pre'
      if (d.post !== undefined && sec >= d.close && sec < d.post) return 'post'
      return 'closed'
    },
    edges: (date) => {
      const d = today(date)
      return d ? [d.pre, d.open, ...(d.lunch ?? []), d.close, d.post].filter((s) => s !== undefined) : []
    }
  }
}

// CME Globex (futures, GC=F): Sunday 18:00 to Friday 17:00 New York time, with a break 17:00-18:00 on weekdays.
// shortcut: CME holiday sessions are not modelled.
const FUTURES: Schedule = {
  zone: 'America/New_York',
  phase: (date, sec) => {
    const wd = weekday(date)
    if (wd === 6 || (wd === 0 && sec < h(18)) || (wd === 5 && sec >= h(17))) return 'closed'
    return wd !== 0 && sec >= h(17) && sec < h(18) ? 'break' : 'open'
  },
  edges: () => [h(17), h(18)]
}

// Currencies (EURUSD=X) trade around the clock from Sunday 17:00 to Friday 17:00 New York time.
const FOREX: Schedule = {
  zone: 'America/New_York',
  phase: (date, sec) => {
    const wd = weekday(date)
    return wd === 6 || (wd === 0 && sec < h(17)) || (wd === 5 && sec >= h(17)) ? 'closed' : 'open'
  },
  edges: () => [h(17)]
}

function scheduleFor(symbol: string, timeZone: string | undefined): Schedule | null {
  if (symbol.endsWith('=F')) return FUTURES
  if (symbol.endsWith('=X')) return FOREX
  if (!timeZone) return null
  const suffix = /\.([A-Z]{1,2})$/.exec(symbol)?.[1]
  if (suffix && GERMAN_FLOORS.has(suffix)) return exchange(timeZone, { open: h(8), close: h(22) })
  const hours = EXCHANGES[timeZone]
  return hours ? exchange(timeZone, hours) : null
}

/** Session phase of a symbol at time `t` (unix seconds); null when its exchange hours are unknown. */
export function phaseAt(symbol: string, timeZone: string | undefined, t: number): Phase | null {
  if (isCrypto(symbol)) return 'open'
  const s = scheduleFor(symbol, timeZone)
  if (!s) return null
  const { date, sec } = wall(t, s.zone)
  return s.phase(date, sec)
}

/** Trading status of a symbol at `now` (unix seconds); null when its exchange hours are unknown. */
export function marketStatus(symbol: string, timeZone: string | undefined, now = Date.now() / 1000): MarketStatus | null {
  if (isCrypto(symbol)) return { phase: 'open' }
  const s = scheduleFor(symbol, timeZone)
  if (!s) return null
  const { date, sec } = wall(now, s.zone)
  const phase = s.phase(date, sec)
  const holiday = phase === 'closed' && weekday(date) % 6 !== 0 && isHoliday(s.zone, date)
  // The next change is at one of the coming days' session edges (or a midnight); two weeks cover any closure.
  for (let d = date, i = 0; i < 14; d = nextDate(d), i++) {
    for (const edge of [0, ...s.edges(d)]) {
      const time = fromWall(d, edge, s.zone)
      if (time <= now) continue
      const after = s.phase(d, edge)
      if (after !== phase) return { phase, holiday, next: { time, phase: after } }
    }
  }
  return { phase, holiday }
}
