import { CalendarClock } from 'lucide-react'
import { useMemo } from 'react'
import { unseen } from '../../../shared/events'
import { t } from '../../../shared/i18n'
import { openEvents, useEventsData } from '../services/events'
import { useEventsUi } from '../store/eventsUi'
import { useStore } from '../store/useStore'

/** Ids of this symbol's important events the user has not seen. */
export function useUnseen(symbol: string): string[] {
  const on = useStore((s) => s.eventsOn)
  const seen = useStore((s) => s.eventsSeen[symbol])
  const loadedFor = useEventsData((s) => s.symbol)
  const events = useEventsData((s) => s.events)
  return useMemo(() => (on && loadedFor === symbol ? unseen(events, seen) : []), [on, loadedFor, symbol, events, seen])
}

/** Switches Events on (loads them, shows the markers, opens the tab) or off (no markers, no requests). */
export function toggleEvents(): void {
  const s = useStore.getState()
  if (!s.eventsOn) {
    s.setEventsOn(true)
    openEvents()
    return
  }
  s.setEventsOn(false)
  useEventsUi.setState({ side: 'watchlist', selected: null, hovered: null, jump: null })
}

/** Chip in the chart legend: switches Events on and off; a yellow number blinks while important events are unseen. */
export default function EventsButton() {
  const symbol = useStore((s) => s.symbol)
  const on = useStore((s) => s.eventsOn)
  const count = useUnseen(symbol).length
  return (
    <button
      onClick={toggleEvents}
      aria-pressed={on}
      title={on ? t('Events ausschalten') : t('Events einschalten')}
      className={`pointer-events-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${on ? 'bg-brand text-white shadow-glow' : 'bg-line text-slate-200 hover:text-white'}`}
    >
      <CalendarClock size={12} />
      {t('Events')}
      {count > 0 && <span className="animate-pulse rounded bg-amber-500 px-1 text-[10px] font-bold text-black">{count}</span>}
    </button>
  )
}
