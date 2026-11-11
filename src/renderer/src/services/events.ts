// Loads the events of the open symbol and keeps them for the list and the chart (not persisted).
// No useStore and nothing that touches `window` on import, so this file loads under node --test.
import { create } from 'zustand'
import { timeZoneForSymbol } from '../../../shared/calendar.ts'
import { buildEvents, importantIds, type ChartEvent, type EventsResult } from '../../../shared/events.ts'
import { ipcError } from '../lib/format.ts'
import { useEventsUi } from '../store/eventsUi.ts'

export const useEventsData = create<{
  symbol: string
  state: 'idle' | 'loading' | 'ready' | 'error'
  result: EventsResult | null
  events: ChartEvent[]
  error: string
}>(() => ({ symbol: '', state: 'idle', result: null, events: [], error: '' }))

/** Where the seen ids live (useStore in the app; App.tsx connects it). */
let seenStore: { get(symbol: string): string[] | undefined; mark(symbol: string, ids: string[]): void } = { get: () => undefined, mark: () => {} }
export function setSeenStore(s: typeof seenStore): void {
  seenStore = s
}

let latest = 0

/** Nothing to note as seen: no source for this symbol, or its insider part failed or waits for a key. */
const insiderMissing = (r: EventsResult): boolean =>
  !r.source ||
  r.notes.some((n) => n.part === 'insider' && (n.state === 'error' || n.state === 'no-key' || n.state === 'via-pc'))

/** Loads the events of a symbol; a result for a symbol that is no longer the current one is dropped. */
export async function loadEvents(symbol: string, key: string, fetch = (s: string, k: string) => window.api.events(s, k)): Promise<void> {
  const run = ++latest
  // A refresh of the same symbol keeps the old entries until the new ones are there (no flicker every 15 min).
  const same = useEventsData.getState().symbol === symbol
  useEventsData.setState({ symbol, state: 'loading', error: '', ...(!same && { result: null, events: [] }) })
  try {
    const result = await fetch(symbol, key)
    if (run !== latest) return
    const events = buildEvents(result, timeZoneForSymbol(symbol) ?? 'UTC')
    // First visit: old buys must not blink. Not when the insider part failed or needs a key: its buys come later.
    if (!insiderMissing(result) && (seenStore.get(symbol) === undefined || useEventsUi.getState().side === 'events')) seenStore.mark(symbol, importantIds(events))
    useEventsData.setState({ state: 'ready', result, events })
  } catch (e) {
    if (run === latest) useEventsData.setState({ state: 'error', result: null, events: [], error: ipcError(e) })
  }
}

/** Opens the Events tab and notes everything important as seen. */
export function openEvents(): void {
  useEventsUi.setState({ side: 'events' })
  // The Watchlist sits outside the fullscreen chart: leave fullscreen so the tab shows.
  if (globalThis.document?.fullscreenElement) void document.exitFullscreen()
  const { symbol, state, events, result } = useEventsData.getState()
  if (state === 'ready' && result && !insiderMissing(result)) seenStore.mark(symbol, importantIds(events))
}
