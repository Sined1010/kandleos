import { create } from 'zustand'

/** How the Events list and the chart talk to each other (not persisted). */
export const useEventsUi = create<{
  /** Which tab the right bar shows (PC). */
  side: 'watchlist' | 'events'
  /** Entry chosen in the list or through its marker; the list scrolls to it. */
  selected: string | null
  /** List entry under the mouse. */
  hovered: string | null
  /** Ask the chart to bring this event's bar into view; `n` makes repeated jumps distinct. */
  jump: { id: string; n: number } | null
  /** Written by the chart: change since the deal per event id, and the ids whose bar is loaded. */
  since: Record<string, number>
  loaded: Record<string, true>
}>(() => ({ side: 'watchlist', selected: null, hovered: null, jump: null, since: {}, loaded: {} }))
