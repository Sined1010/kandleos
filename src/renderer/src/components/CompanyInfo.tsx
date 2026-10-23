import { Building2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { locale, t } from '../../../shared/i18n'
import type { CompanyInfo } from '../../../shared/types'
import { useStore } from '../store/useStore'

const fmt = (v: number | undefined, o: Intl.NumberFormatOptions = {}) =>
  v == null ? undefined : new Intl.NumberFormat(locale(), o).format(v)
/** Amount in the stock's currency; plain number if the source names none Intl knows. */
function money(v: number | undefined, currency: string | undefined, compact = false) {
  const o: Intl.NumberFormatOptions = { notation: compact ? 'compact' : 'standard', maximumFractionDigits: 2 }
  try {
    return fmt(v, { ...o, style: 'currency', currency })
  } catch {
    return fmt(v, o)
  }
}

/** Button next to the symbol: what the company does and its key figures, in a panel below it (stocks only). */
export default function CompanyInfoButton({ symbol }: { symbol: string }) {
  const [open, setOpen] = useState(false)
  // A panel for the previous symbol must not stay open after switching.
  useEffect(() => setOpen(false), [symbol])
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={t('Infos zum Unternehmen')}
        aria-label={t('Infos zum Unternehmen')}
        className={`rounded p-1.5 hover:bg-line hover:text-white ${open ? 'text-white' : 'text-muted'}`}
      >
        <Building2 size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <InfoPanel symbol={symbol} />
        </>
      )}
    </div>
  )
}

function InfoPanel({ symbol }: { symbol: string }) {
  const key = useStore((s) => s.finnhubKey)
  const [info, setInfo] = useState<CompanyInfo | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    window.api.companyInfo(symbol, key).then(
      (i) => active && setInfo(i),
      (e: Error) => active && setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    )
    return () => {
      active = false
    }
  }, [symbol, key])

  const rows: [string, string | undefined][] = info
    ? [
        [t('Marktkapitalisierung'), money(info.marketCap, info.currency, true)],
        [t('Branche'), [info.sector, info.industry].filter(Boolean).join(' · ') || undefined],
        [t('Land'), info.country],
        [t('Börse'), info.exchange],
        [t('Mitarbeiter'), fmt(info.employees)],
        [t('KGV'), fmt(info.pe, { maximumFractionDigits: 1 })],
        [t('Dividendenrendite'), fmt(info.dividendYield, { maximumFractionDigits: 2 })?.concat(' %')],
        [t('Beta'), fmt(info.beta, { maximumFractionDigits: 2 })],
        [
          t('52-Wochen-Spanne'),
          info.low52 != null && info.high52 != null
            ? `${money(info.low52, info.currency)} – ${money(info.high52, info.currency)}`
            : undefined
        ],
        // A plain date; read in UTC so it does not shift by a day.
        [t('Börsengang'), info.ipo && new Date(info.ipo).toLocaleDateString(locale(), { timeZone: 'UTC' })]
      ]
    : []

  return (
    <div
      role="dialog"
      aria-label={t('Infos zum Unternehmen')}
      className="absolute left-0 top-full z-20 mt-1 w-96 rounded-lg border border-line bg-panel/95 p-3 text-xs text-slate-300 shadow-2xl shadow-black/50 backdrop-blur"
    >
      {error ? (
        <p className="text-down">{error}</p>
      ) : !info ? (
        <p className="text-muted">{t('Lade Infos …')}</p>
      ) : (
        <>
          <p className="text-sm font-semibold text-white">
            {info.name ?? symbol} <span className="font-normal text-muted">{symbol}</span>
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {rows
              .filter(([, v]) => v)
              .map(([label, v]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-white">{v}</dd>
                </div>
              ))}
            {info.website && (
              <div className="contents">
                <dt className="text-muted">{t('Website')}</dt>
                <dd className="truncate">
                  <a href={info.website} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    {new URL(info.website).host}
                  </a>
                </dd>
              </div>
            )}
          </dl>
          {info.description && (
            <>
              <p className="mb-1 mt-3 text-[10px] uppercase tracking-wider text-muted">{t('Beschreibung (auf Englisch)')}</p>
              <p className="max-h-40 overflow-y-auto leading-relaxed">{info.description}</p>
            </>
          )}
          <p className="mt-3 text-[10px] text-muted">
            {t('Quelle: {source}', { source: info.source })}
            {info.source === 'Yahoo Finance' && ` · ${t('nur für private Zwecke')}`}
          </p>
        </>
      )}
    </div>
  )
}
