import { X } from 'lucide-react'
import type { ChartEvent } from '../shared/events'
import { t } from '../shared/i18n'
import { EventStack } from '../renderer/src/components/EventsPanel'
import { useBack } from './useBack'

/**
 * Phone: the events of a tapped bar (or of the entry chosen in the list), in a card at the bottom of the chart, where
 * the PC shows its hover box. "Alle Events" opens the sheet; back or × closes the card.
 */
export default function EventCard(p: { events: ChartEvent[]; day: string; bottom: number; right: number; onAll(): void; onClose(): void }) {
  useBack('event-card', true, p.onClose)
  return (
    <div
      className="absolute left-2 z-30 space-y-1.5 rounded-xl border border-line bg-panel/95 px-3 py-2 text-xs shadow-2xl shadow-black/50 backdrop-blur"
      style={{ bottom: p.bottom, right: p.right }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button onClick={p.onClose} aria-label={t('Schließen')} className="mobile-icon absolute -right-1 -top-1">
        <X size={16} />
      </button>
      <EventStack events={p.events} day={p.day} />
      <button onClick={p.onAll} className="min-h-11 w-full rounded-lg bg-line px-3 font-medium text-slate-200">
        {t('Alle Events')}
      </button>
    </div>
  )
}
