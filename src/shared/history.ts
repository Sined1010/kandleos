import type { Candle } from './types.ts'

/** Most bars one chart holds; every live tick recomputes them all, so more would make the chart sluggish. */
export const HISTORY_LIMIT = 10_000

/**
 * `older` placed before `current`: bars up to its first, without duplicates, cut to `limit` from the left.
 * A section reaches up to and including the oldest loaded bar: that bar was the first of its own section and
 * may hold only part of its period, while the section's copy is whole, so the copy replaces it.
 */
export function prependOlder(current: Candle[], older: Candle[], limit = HISTORY_LIMIT): Candle[] {
  const first = current.length ? current[0].time : Infinity
  const seen = new Set<number>()
  const add = older
    .filter((c) => c.time <= first && !seen.has(c.time) && seen.add(c.time))
    .sort((a, b) => a.time - b.time)
  const rest = add.length && add[add.length - 1].time === first ? current.slice(1) : current
  return [...add, ...rest].slice(-limit)
}

/** First bucket start at or after `start` on the grid `aggregate(…, seconds, offset)` uses. */
export const firstWhole = (start: number, seconds: number, offset = 0): number =>
  Math.ceil((start - offset) / seconds) * seconds + offset

/**
 * Unix-second span of one history section: `days` back from `before` (the oldest loaded bar) or from now;
 * `days` 0 means all. A source that only keeps `capDays` back is asked one day short of that, since the
 * local clock may be off. Null when nothing is left inside the cap.
 */
export function sectionWindow(days: number, before: number | undefined, now: number, capDays?: number): [number, number] | null {
  const to = before ?? now
  let from = days ? to - days * 86400 : 0
  if (capDays) from = Math.max(from, now - (capDays - 1) * 86400)
  return from < to ? [from, to] : null
}

/** Wait after a failed section before asking again; the chart reports its range on every drag frame. */
export const OLDER_RETRY_MS = 4000

/** Whether the chart may ask for the next older section now (one at a time, not after the end or a recent failure). */
export const mayLoadOlder = (o: { ready: boolean; busy: boolean; done: boolean; retryAt: number }, now: number): boolean =>
  o.ready && !o.busy && !o.done && now >= o.retryAt
