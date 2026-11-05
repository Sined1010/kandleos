// Price alarms: "tell me when AAPL reaches 230". The same rule runs in the app and in the Android
// background check (android/.../AlarmCheck.java), so keep both in step. Times are in seconds.

export interface Alarm {
  id: string
  symbol: string
  /** Fires when a bar's high reaches `price` (above) or its low falls to it (below). */
  op: 'above' | 'below'
  price: number
  createdAt: number
  triggeredAt?: number
  triggeredPrice?: number
  /** Bars before this time are already checked. */
  checkedUntil?: number
}

/** The direction follows from where the price is now; at the current price there is nothing to wait for. */
export function newAlarm(symbol: string, price: number, current: number, now = Math.floor(Date.now() / 1000)): Alarm | 'at-price' {
  if (price === current) return 'at-price'
  return { id: crypto.randomUUID(), symbol, op: price > current ? 'above' : 'below', price, createdAt: now }
}

/** First bar since the last check that reached the alarm price; bars starting earlier do not count. */
export function hit(a: Alarm, bars: { time: number; high: number; low: number }[]): { time: number; price: number } | null {
  if (a.triggeredAt !== undefined) return null
  const from = a.checkedUntil ?? a.createdAt
  const bar = bars.find((b) => b.time >= from && (a.op === 'above' ? b.high >= a.price : b.low <= a.price))
  return bar ? { time: bar.time, price: a.price } : null
}

/**
 * Where the next check starts after looking at bars up to `newest` (the newest bar may still move, so it is
 * looked at again). Never moves back: bars from before the alarm was set (Friday's last bar, seen on Saturday)
 * must not count.
 */
export const checkedAfter = (a: Alarm, newest: number): number => Math.max(a.checkedUntil ?? a.createdAt, newest)

export interface NativeTrigger {
  id: string
  triggeredAt: number
  triggeredPrice: number
  checkedUntil: number
}

/** Takes in what the background check found; the earliest trigger wins, so applying it again changes nothing. */
export function mergeTriggered(local: Alarm[], native: NativeTrigger[]): Alarm[] {
  return local.map((a) => {
    const n = native.find((x) => x.id === a.id)
    // A trigger from before the alarm was armed again belongs to the old round.
    if (!n || (a.triggeredAt === undefined && n.triggeredAt < (a.checkedUntil ?? a.createdAt))) return a
    const earlier = a.triggeredAt === undefined || n.triggeredAt < a.triggeredAt
    return {
      ...a,
      ...(earlier ? { triggeredAt: n.triggeredAt, triggeredPrice: n.triggeredPrice } : {}),
      checkedUntil: Math.max(a.checkedUntil ?? 0, n.checkedUntil)
    }
  })
}
