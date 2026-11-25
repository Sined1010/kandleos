import { create } from 'zustand'
import type { PatternId } from '../../../shared/patterns'

/** What the pattern layer of the active chart found and which card is open (not persisted). */
export const usePatternsUi = create<{
  /** Patterns at the last finished bars; [] when switched off or none. */
  current: PatternId[]
  /** Card of the group ending at this bar time; pinned = clicked (stays until Esc or a click beside it). */
  open: { time: number; pinned: boolean } | null
  /** Bar times the current patterns' frame spans, for the phone's event card ("Also: …"). */
  span: { from: number; to: number } | null
}>(() => ({ current: [], open: null, span: null }))
