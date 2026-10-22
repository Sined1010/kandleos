import { Moon, Sunrise } from 'lucide-react'
import { useEffect, useState } from 'react'
import { timeZoneForSymbol } from '../../../shared/calendar'
import { locale, msg, t } from '../../../shared/i18n'
import { marketStatus, type Phase } from '../../../shared/market'
import { isCrypto, type Quote } from '../../../shared/types'
import { formatChange, formatPrice } from '../lib/format'

const PHASE: Record<Phase, [dot: string, label: string]> = {
  open: ['bg-up', msg('Geöffnet')],
  pre: ['bg-amber-400', msg('Vorbörse')],
  post: ['bg-amber-400', msg('Nachbörse')],
  break: ['bg-amber-400', msg('Pause')],
  closed: ['bg-muted', msg('Geschlossen')]
}

/** Local time of the next phase change: "15:30" today, "Mo 15:30" this week, else with the date. */
function when(sec: number): string {
  const at = new Date(sec * 1000)
  const now = new Date()
  const time = at.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  if (at.toDateString() === now.toDateString()) return time
  if (sec * 1000 - now.getTime() < 6 * 86_400_000) return `${at.toLocaleDateString(locale(), { weekday: 'short' })} ${time}`
  return `${at.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' })} ${time}`
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
  const dot = PHASE[status.phase][0]
  const label = t(PHASE[status.phase][1])
  const { next } = status
  const detail = isCrypto(symbol)
    ? '24/7'
    : status.holiday
      ? t('Feiertag')
      : next &&
        (next.phase === 'closed'
          ? t('bis {time}', { time: when(next.time) })
          : next.phase === 'open'
            ? t('öffnet {time}', { time: when(next.time) })
            : t('{phase} ab {time}', { phase: t(PHASE[next.phase][1]), time: when(next.time) }))
  const title = isCrypto(symbol)
    ? t('Kryptobörsen handeln rund um die Uhr.')
    : t('Handelszeiten der Börse (Zeitzone {zone}), Uhrzeiten in deiner Ortszeit.', { zone: zone ?? t('unbekannt') }) +
      (next
        ? '\n' +
          t('Nächster Wechsel: {time}', {
            time: new Date(next.time * 1000).toLocaleString(locale(), { dateStyle: 'full', timeStyle: 'short' })
          })
        : '') +
      '\n' +
      t('Regelzeiten mit Feiertagen; Sonderhandelstage können abweichen.')
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
      className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md bg-line px-1.5 py-0.5 font-medium text-slate-200"
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

type Ext = NonNullable<Quote['ext']>
const EXT_LABEL: Record<Ext['phase'], string> = { pre: msg('Vorbörse'), post: msg('Nachbörse') }

/** Sun for pre-market, moon for after-hours prices. */
export function ExtIcon({ phase, size = 10 }: { phase: Ext['phase']; size?: number }) {
  const Icon = phase === 'pre' ? Sunrise : Moon
  return <Icon size={size} className={phase === 'pre' ? 'text-amber-300' : 'text-indigo-300'} aria-label={t(EXT_LABEL[phase])} />
}

export const extTitle = (ext: Ext): string =>
  t('{phase}: {price} ({change} zum regulären Schlusskurs), Stand {time}', {
    phase: t(EXT_LABEL[ext.phase]),
    price: formatPrice(ext.price),
    change: formatChange(ext.changePct),
    time: new Date(ext.time * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  })

/** Regular price and change for the chart legend, plus the pre-/after-market price when there is one. */
export function QuoteChip({ quote }: { quote?: Quote }) {
  if (!quote) return null
  const color = (pct: number) => (pct >= 0 ? 'text-up' : 'text-down')
  return (
    <span className="pointer-events-auto inline-flex items-center gap-2 tabular-nums">
      <span title={t('Regulärer Kurs und Veränderung zum Vortag')}>
        <span className="font-medium text-slate-200">{formatPrice(quote.price)}</span>{' '}
        <span className={color(quote.changePct)}>{formatChange(quote.changePct)}</span>
      </span>
      {quote.ext && (
        <span className="inline-flex items-center gap-1" title={extTitle(quote.ext)}>
          <ExtIcon phase={quote.ext.phase} size={12} />
          <span className="text-muted">{t(EXT_LABEL[quote.ext.phase])}</span>
          <span className="font-medium text-slate-200">{formatPrice(quote.ext.price)}</span>
          <span className={color(quote.ext.changePct)}>{formatChange(quote.ext.changePct)}</span>
        </span>
      )}
    </span>
  )
}
