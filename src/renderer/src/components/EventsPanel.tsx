// The Events list of the open symbol: insider dealings, clusters, transfers, 8-K filings and news, newest first.
// PC: a tab of the right bar; phone: a sheet of its own (`page`). The chart side is EventLayer.tsx.
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { shortMoney } from '../../../shared/eventChart'
import { delayDays, summary, type ChartEvent, type SourceNote } from '../../../shared/events'
import { locale, t } from '../../../shared/i18n'
import { TF_SECONDS } from '../../../shared/types'
import { formatPrice } from '../lib/format'
import { useEventsData } from '../services/events'
import { useEventsUi } from '../store/eventsUi'
import { useStore } from '../store/useStore'
import { toggleEvents } from './EventsButton'

const roleText = (role: string | undefined): string | undefined =>
  role === 'vorstand' ? t('Vorstand') : role === 'aufsichtsrat' ? t('Aufsichtsrat') : role === 'fuehrung' ? t('Führungskraft') : role === 'nahestehend' ? t('nahestehend') : undefined

const day = (date: string, year = false): string =>
  new Date(date + 'T12:00:00Z').toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', ...(year && { year: '2-digit' }), timeZone: 'UTC' })
const percent = (v: number): string => `${v >= 0 ? '+' : ''}${(v * 100).toLocaleString(locale(), { maximumFractionDigits: 0 })} %`
let jumps = 0
const BAFIN_CREDIT = '© Bundesanstalt für Finanzdienstleistungsaufsicht / www.bafin.de'
export const jumpTo = (id: string): void => useEventsUi.setState({ jump: { id, n: ++jumps } })

/** Coloured label of an entry: buys green, sells red, everything else neutral. */
export function EventTag({ e }: { e: ChartEvent }) {
  const [text, color] =
    e.kind === 'filing' ? [t('8-K'), 'bg-line text-slate-300']
    : e.kind === 'news' ? [t('News'), 'bg-line text-slate-300']
    : e.kind === 'transfer' ? [t('Übertragung'), 'bg-line text-slate-300']
    : e.side === 'sell' ? [t('VERK.'), 'bg-red-500/20 text-red-400']
    : [t('KAUF'), 'bg-emerald-500/20 text-emerald-400']
  return <span className={`shrink-0 rounded px-1 text-[10px] font-semibold ${color}`}>{text}</span>
}

/** The lines of one entry, shared by the list and the chart's hover box. */
export function EventLines({ e, since }: { e: ChartEvent; since?: number }) {
  if (e.kind === 'cluster') {
    return (
      <>
        <p className="text-slate-200">{t('Cluster: {n} Insider kaufen binnen 5 Tagen', { n: e.persons ?? 0 })}</p>
        {e.volume !== undefined && <p className="text-muted">{t('zusammen {sum}', { sum: shortMoney(e.volume, e.currency) })}</p>}
      </>
    )
  }
  if (e.kind === 'filing' || e.kind === 'news') {
    return (
      <p className="text-slate-200">
        <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline" onClick={(ev) => ev.stopPropagation()}>
          {e.kind === 'filing' ? t('8-K-Meldung bei der SEC') : e.title}
        </a>
        {e.origin && <span className="ml-1 text-[10px] text-muted">{e.origin}</span>}
      </p>
    )
  }
  const d = e.deal!
  const facts = [
    d.person,
    d.source === 'Finnhub' ? t('Rolle unbekannt') : roleText(d.role),
    d.shares !== undefined
      ? d.source === 'BaFin' ? t('ca. {n} Stk.', { n: d.shares.toLocaleString(locale()) }) : t('{n} Stk.', { n: d.shares.toLocaleString(locale()) })
      : undefined,
    d.price !== undefined ? `${formatPrice(d.price)} ${d.currency ?? ''}`.trim() : undefined,
    d.volume !== undefined ? shortMoney(d.volume, d.currency) : undefined
  ].filter(Boolean)
  const context = [
    e.nth === 1 ? t('Erster Kauf dieser Person im Zeitraum') : e.nth ? t('{n}. Kauf dieser Person im Zeitraum', { n: e.nth }) : undefined,
    e.holdingPct !== undefined
      ? e.side === 'buy' ? t('stockt Bestand um {p} % auf', { p: e.holdingPct.toLocaleString(locale()) }) : t('verkauft {p} % des Bestands', { p: e.holdingPct.toLocaleString(locale()) })
      : undefined,
    since !== undefined ? t('Kurs seitdem {p}', { p: percent(since) }) : undefined
  ].filter(Boolean)
  const delay = delayDays(d.date, d.published)
  return (
    <>
      {e.kind === 'transfer' && <p className="text-slate-200">{t('Übertragung außerhalb der Börse')}</p>}
      <p className={e.kind === 'transfer' ? 'text-muted' : 'text-slate-200'}>{facts.join(' · ')}</p>
      {e.kind === 'insider' && context.length > 0 && <p className="text-muted">{context.join(' · ')}</p>}
      <p className="text-[10px] text-muted">
        {delay === 0
          ? t('Geschäft {a} · am selben Tag öffentlich', { a: day(d.date) })
          : delay === 1
            ? t('Geschäft {a} · öffentlich seit {b} (1 Tag später)', { a: day(d.date), b: day(d.published) })
            : t('Geschäft {a} · öffentlich seit {b} ({n} Tage später)', { a: day(d.date), b: day(d.published), n: delay })}
      </p>
    </>
  )
}

/** Entries in the hover box and the phone card; weekly and monthly bars can gather many more (the rest are in the list). */
const STACK_MAX = 3

/** The events of one bar: its day, up to three entries and how many more there are (PC hover box, phone card). */
export function EventStack({ events, day }: { events: ChartEvent[]; day: string }) {
  const since = useEventsUi((s) => s.since)
  return (
    <>
      <p className="font-medium text-slate-200">
        {day}
        {events.some((e) => e.inCluster) && <span className="block font-normal text-emerald-400">{t('Cluster-Kauf')}</span>}
      </p>
      {events.slice(0, STACK_MAX).map((e) => (
        <div key={e.id} className="space-y-0.5">
          <EventTag e={e} />
          <EventLines e={e} since={since[e.id]} />
        </div>
      ))}
      {events.length > STACK_MAX && <p className="text-muted">{t('+ {n} weitere – in der Liste', { n: events.length - STACK_MAX })}</p>}
      {events[0]?.deal && <p className="text-[10px] text-muted">{t('Quelle: {source}', { source: events[0].deal.source })}</p>}
    </>
  )
}

/** Why the list is empty or incomplete, one line per reason. */
function noteText(n: SourceNote): string {
  switch (n.state) {
    case 'no-key': return t('Mit einem kostenlosen Finnhub-Key siehst du hier Insider-Käufe und -Verkäufe, 8-K-Meldungen und Firmen-News zu diesem Wert.')
    case 'no-source': return t('Für diese Börse gibt es keine offene Quelle.')
    case 'home': return t('Insider-Daten gibt es beim Heimat-Wert.')
    case 'error': return t('{source} ist gerade nicht erreichbar.', { source: n.source ?? '' })
    case 'truncated': return t('Die Liste kann unvollständig sein (sehr viele Meldungen).')
    case 'via-pc': return n.reason === 'unknown-op' ? t('Insider-Daten kommen über den gekoppelten PC – bitte KandleOS am PC aktualisieren.') : t('Insider-Daten kommen über den gekoppelten PC.')
    case 'no-isin': return t('ISIN unbekannt – BaFin-Daten nicht abrufbar.')
  }
}

function Entry({ e, page, onJump }: { e: ChartEvent; page?: boolean; onJump?(): void }) {
  const ref = useRef<HTMLDivElement>(null)
  const { selected, since, loaded } = useEventsUi(useShallow((s) => ({ selected: s.selected === e.id, since: s.since[e.id], loaded: !!s.loaded[e.id] })))
  const intraday = useStore((s) => TF_SECONDS[s.timeframe] < 86400)
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  const choose = () => {
    useEventsUi.setState({ selected: e.id })
    if (!loaded) return
    jumpTo(e.id)
    onJump?.()
  }
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={choose}
      onKeyDown={(k) => k.key === 'Enter' && choose()}
      onMouseEnter={page ? undefined : () => useEventsUi.setState({ hovered: e.id })}
      onMouseLeave={page ? undefined : () => useEventsUi.setState((s) => (s.hovered === e.id ? { hovered: null } : s))}
      className={`cursor-pointer space-y-0.5 border-b border-line px-3 py-2 hover:bg-line/40 ${page ? 'min-h-12' : ''} ${selected ? 'outline outline-1 -outline-offset-1 outline-accent' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="tabular-nums text-muted">{day(e.date, true)}</span>
        <EventTag e={e} />
      </div>
      <EventLines e={e} since={since} />
      {selected && !loaded && intraday && (
        <button
          onClick={(ev) => {
            ev.stopPropagation()
            useStore.getState().setTimeframe('1D')
            jumpTo(e.id)
            onJump?.()
          }}
          className="mt-1 rounded bg-line px-1.5 py-0.5 text-[11px] text-slate-200 hover:text-white"
        >
          {t('Auf Tageskerzen wechseln')}
        </button>
      )}
    </div>
  )
}

export default function EventsPanel({ page, onJump }: { page?: boolean; onJump?(): void }) {
  const { state, result, events, error } = useEventsData()
  const filters = useStore((s) => s.eventFilters)
  const setFilter = useStore((s) => s.setEventFilter)
  const on = useStore((s) => s.eventsOn)
  // US listings open with Alpaca or Yahoo; with crypto only there is nothing to open.
  const adr = useStore((s) => s.stockSource !== 'none') ? result?.adr : undefined
  const intraday = useStore((s) => TF_SECONDS[s.timeframe] < 86400)
  // Redraw once a minute so "as of n min. ago" stays true.
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(timer)
  }, [])

  const notes = [...new Set((result?.notes ?? []).filter((n) => n.state !== 'no-key').map(noteText))]
  // Only Finnhub's listings (US, also Chinese ADRs) ask for a key; German shares and crypto never get here.
  const noKey = result?.notes.find((n) => n.state === 'no-key')
  const notPaired = result?.notes.some((n) => n.state === 'via-pc' && n.reason === 'not-paired')
  const insiderOk = !!result?.source && !result.notes.some((n) => n.part === 'insider' && n.state === 'error')
  const sum = summary(events, new Date().toISOString().slice(0, 10))
  const amount = (volume?: number) => (volume !== undefined ? ` (${shortMoney(volume, sum.currency)})` : '')
  const list = events.filter((e) => filters[e.group])
  const box = page ? 'h-5 w-5' : ''

  if (!on) {
    return (
      <div className="space-y-2 px-3 py-3 text-xs text-muted">
        <p>{t('Events sind aus.')}</p>
        <button onClick={toggleEvents} className={`rounded bg-brand px-2 py-1 font-medium text-white shadow-glow hover:brightness-110 ${page ? 'min-h-11 px-4' : ''}`}>
          {t('Events einschalten')}
        </button>
      </div>
    )
  }
  return (
    <div className="text-xs">
      <div className="space-y-1 border-b border-line px-3 py-2">
        {insiderOk && (
          <p className="font-medium text-slate-200">
            {t('12 Monate: {buys} · {sells}', {
              buys: (sum.buys === 1 ? t('1 Kauf') : t('{n} Käufe', { n: sum.buys })) + amount(sum.buyVolume),
              sells: (sum.sells === 1 ? t('1 Verkauf') : t('{n} Verkäufe', { n: sum.sells })) + amount(sum.sellVolume)
            })}
          </p>
        )}
        {result && (
          <p className="text-[10px] text-muted">
            {t('Stand: vor {n} Min.', { n: Math.max(0, Math.round((Date.now() / 1000 - result.fetchedAt) / 60)) })} ·{' '}
            {t('Geschäfte der letzten Tage können noch fehlen (BaFin meist 0–5 Tage, USA bis 2 Handelstage).')}
          </p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
          {(
            [
              ['insider', t('Insider')],
              ['filings', t('Meldungen')],
              ['news', t('News')]
            ] as const
          ).map(([group, label]) => (
            <label key={group} className={`flex cursor-pointer items-center gap-1 ${page ? 'min-h-12' : ''}`}>
              <input type="checkbox" className={box} checked={filters[group]} onChange={(e) => setFilter(group, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
        {page && (
          <button onClick={toggleEvents} className="min-h-11 rounded-lg bg-line px-3 text-slate-200">
            {t('Events ausschalten')}
          </button>
        )}
        {intraday && <p className="text-[10px] text-amber-400/90">{t('Marker nur für die geladenen Tage – Tageskerzen zeigen alle.')}</p>}
      </div>

      {state === 'loading' && !result && <p className="px-3 py-3 text-muted">{t('Lade Events …')}</p>}
      {state === 'error' && <p className="px-3 py-3 text-down">{error}</p>}
      {noKey && (
        <div className="space-y-2 border-b border-line px-3 py-2 text-muted">
          <p>{noteText(noKey)}</p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('kandleos:settings', { detail: 'finnhub-key' }))}
            className={`rounded bg-brand px-2 py-1 font-medium text-white shadow-glow hover:brightness-110 ${page ? 'min-h-11 px-4' : ''}`}
          >
            {t('Finnhub-Key eintragen')}
          </button>
        </div>
      )}
      {notes.map((n) => (
        <p key={n} className="border-b border-line px-3 py-2 text-muted">
          {n}
        </p>
      ))}
      {notPaired && (
        <div className="border-b border-line px-3 py-2">
          <button
            onClick={() => window.dispatchEvent(new Event('kandleos:pair'))}
            className={`rounded bg-brand px-2 py-1 font-medium text-white shadow-glow hover:brightness-110 ${page ? 'min-h-11 px-4' : ''}`}
          >
            {t('Mit PC koppeln')}
          </button>
        </div>
      )}
      {/* Only where the SEC requires Form 4 (shared/events.ts NO_US_INSIDERS); it does not promise deals in the period. */}
      {adr && (
        <div className="space-y-2 border-b border-line px-3 py-2 text-muted">
          <p>{t('Beim US-Wert {symbol} ({exchange}) melden Vorstände ihre Geschäfte seit März 2026 bei der SEC.', { symbol: adr.symbol, exchange: adr.exchange })}</p>
          <button
            onClick={() => {
              useStore.getState().setSymbol(adr.symbol)
              onJump?.()
            }}
            className={`rounded bg-line px-2 py-1 font-medium text-slate-200 hover:text-white ${page ? 'min-h-11 px-4' : ''}`}
          >
            {t('{symbol} öffnen', { symbol: adr.symbol })}
          </button>
        </div>
      )}
      {/* Say what the list shows and why it may be empty: the source has more filings than buys and sells. */}
      {insiderOk && !events.some((e) => e.kind === 'insider') && (
        <p className="border-b border-line px-3 py-2 text-muted">
          {result?.source === 'BaFin'
            ? t('Keine gemeldeten Käufe oder Verkäufe von Aktien in den letzten 12 Monaten. Melden müssen nur Führungskräfte und ihnen nahestehende Personen, seit 2026 erst ab 50.000 € im Jahr.')
            : t('Keine Käufe oder Verkäufe an der Börse in den letzten 12 Monaten.')}
        </p>
      )}
      {insiderOk && !!result?.hidden && (
        <p className="border-b border-line px-3 py-2 text-[10px] text-muted">
          {t('Ausgeblendete Meldungen ohne Kauf oder Verkauf von Aktien: {n} (z. B. Optionsausübungen, Zuteilungen, Schenkungen, Derivate).', { n: result.hidden })}
        </p>
      )}
      {list.map((e) => (
        <Entry key={e.id} e={e} page={page} onJump={onJump} />
      ))}
      {insiderOk && result && (
        <p className="px-3 py-2 text-[10px] text-muted">
          {/* BaFin's terms ask for this exact credit; it stays German in both languages. */}
          {t('Quelle: {source}', { source: result.source === 'BaFin' ? BAFIN_CREDIT : result.source ?? '' })}
          {result.via === 'pc' && <> · {t('über den gekoppelten PC')}</>}
          {result.source === 'BaFin' && <> · {t('Ohne Gewähr für Vollständigkeit.')}</>}
        </p>
      )}
    </div>
  )
}
