import { useEffect, useState } from 'react'
import { timeZoneForSymbol } from '../../../shared/calendar'
import { marketStatus, type Phase } from '../../../shared/market'
import { isCrypto } from '../../../shared/types'

const PHASE: Record<Phase, [dot: string, label: string]> = {
  open: ['bg-up', 'Geöffnet'],
  pre: ['bg-amber-400', 'Vorbörse'],
  post: ['bg-amber-400', 'Nachbörse'],
  break: ['bg-amber-400', 'Pause'],
  closed: ['bg-muted', 'Geschlossen']
}

/** Local time of the next phase change: "15:30" today, "Mo 15:30" this week, else with the date. */
function when(t: number): string {
  const at = new Date(t * 1000)
  const now = new Date()
  const time = at.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  if (at.toDateString() === now.toDateString()) return time
  if (t * 1000 - now.getTime() < 6 * 86_400_000) return `${at.toLocaleDateString('de-DE', { weekday: 'short' })} ${time}`
  return `${at.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${time}`
}

/** Re-renders every 30 s, so a status flips at the bell without a reload. */
function useTick(): void {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])
}

/** Status, short detail ("bis 22:00") and tooltip for a symbol, or null when its trading hours are unknown. */
function describe(symbol: string, timeZone: string | undefined) {
  const zone = timeZone ?? timeZoneForSymbol(symbol)
  const status = marketStatus(symbol, zone)
  if (!status) return null
  const [dot, label] = PHASE[status.phase]
  const { next } = status
  const detail = isCrypto(symbol)
    ? '24/7'
    : status.holiday
      ? 'Feiertag'
      : next &&
        (next.phase === 'closed'
          ? `bis ${when(next.time)}`
          : next.phase === 'open'
            ? `öffnet ${when(next.time)}`
            : `${PHASE[next.phase][1]} ab ${when(next.time)}`)
  const title = isCrypto(symbol)
    ? 'Kryptobörsen handeln rund um die Uhr.'
    : `Handelszeiten der Börse (Zeitzone ${zone ?? 'unbekannt'}), Uhrzeiten in deiner Ortszeit.` +
      (next ? `\nNächster Wechsel: ${new Date(next.time * 1000).toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' })}` : '') +
      '\nRegelzeiten mit Feiertagen; Sonderhandelstage können abweichen.'
  return { dot, label, detail, title }
}

/** Open/closed badge for the chart legend; `timeZone` is the exchange zone reported with the candles. */
export default function MarketBadge({ symbol, timeZone }: { symbol: string; timeZone?: string }) {
  useTick()
  const d = describe(symbol, timeZone)
  if (!d) return null
  return (
    <span
      title={d.title}
      className="pointer-events-auto ml-2 inline-flex items-center gap-1.5 rounded bg-line px-1.5 py-0.5 font-medium text-slate-200"
    >
      <span className={`h-2 w-2 rounded-full ${d.dot}`} aria-hidden />
      {d.label}
      {d.detail && <span className="font-normal text-muted">· {d.detail}</span>}
    </span>
  )
}

/** Small status dot for list rows; the tooltip spells the status out. */
export function MarketDot({ symbol, timeZone }: { symbol: string; timeZone?: string }) {
  useTick()
  const d = describe(symbol, timeZone)
  if (!d) return null
  return (
    <span
      title={`${d.label}${d.detail ? ` · ${d.detail}` : ''}\n${d.title}`}
      aria-label={d.label}
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${d.dot}`}
    />
  )
}
