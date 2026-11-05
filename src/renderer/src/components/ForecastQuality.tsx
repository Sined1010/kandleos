import { Gauge, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { summaryKey, type SummaryRow } from '../../../shared/archive'
import type { BacktestResult } from '../../../shared/forecast'
import { locale, msg, t } from '../../../shared/i18n'
import { tfLabel, type Timeframe } from '../../../shared/types'
import { useStore } from '../store/useStore'
import type { ForecastResult } from './ForecastInfo'

const pct = (v: number, digits = 0) => `${(v * 100).toLocaleString(locale(), { maximumFractionDigits: digits })} %`
// Fewer cases than this in a chance group say nothing yet.
const MIN_CASES = 5
// Below this many independent forecasts the archive's figures are a first impression only.
const FEW_INDEPENDENT = 10

/** The archive's running totals for this symbol, candle size and forecast length; null when none yet. */
export function useSummary(symbol: string, timeframe: Timeframe, steps: number, refresh: unknown): SummaryRow | null {
  const [row, setRow] = useState<SummaryRow | null>(null)
  const key = summaryKey({ symbol, timeframe, steps: Array(steps) })
  useEffect(() => {
    let live = true
    window.api.archive
      .summary(key)
      .then((r) => live && setRow(r[key] ?? null))
      .catch(() => live && setRow(null))
    return () => {
      live = false
    }
  }, [key, refresh])
  return row
}

/** Share of real closes in a range against the share it should hold. */
function Band({ label, value, target }: { label: string; value: number; target: number }) {
  return (
    <div className="mt-1.5">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums text-slate-200">{pct(value)}</span>
      </div>
      <div className="relative mt-0.5 h-1.5 rounded bg-line">
        <div className="absolute inset-y-0 left-0 rounded bg-accent" style={{ width: `${Math.min(100, value * 100)}%` }} />
        <div className="absolute -inset-y-1 w-0.5 bg-slate-200" style={{ left: `${target * 100}%` }} title={t('Soll: {p}', { p: pct(target) })} />
      </div>
    </div>
  )
}

const GROUPS = [msg('unter 40 %'), msg('40–60 %'), msg('über 60 %')]

/** "Stimmt Chance ↑?": per group the chance the model gave and how often the close really rose. */
function ChanceTable({ groups }: { groups: { cases: number; said: number; rose: number }[] }) {
  return (
    <table className="mt-1 w-full text-left">
      <thead className="text-[11px] text-muted">
        <tr>
          <th className="py-0.5 font-normal">{t('KI sagte')}</th>
          <th className="py-0.5 font-normal">{t('Ø Chance')}</th>
          <th className="py-0.5 font-normal">{t('Kurs stieg')}</th>
          <th className="py-0.5 text-right font-normal">{t('Fälle')}</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g, i) => (
          <tr key={GROUPS[i]} className="border-t border-line">
            <td className="py-0.5">{t(GROUPS[i])}</td>
            {g.cases < MIN_CASES ? (
              <td colSpan={2} className="py-0.5 text-muted">
                {g.cases ? t('zu wenige') : '–'}
              </td>
            ) : (
              <>
                <td className="py-0.5 tabular-nums">{pct(g.said)}</td>
                <td className="py-0.5 tabular-nums text-slate-200">{pct(g.rose)}</td>
              </>
            )}
            <td className="py-0.5 text-right tabular-nums">{g.cases}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Orange only as a warning: "unchanged" was closer than the model. */
function VersusUnchanged({ error, naive }: { error: number; naive: number }) {
  if (!(naive > 0)) return null
  const skill = 1 - error / naive
  return skill >= 0 ? (
    <p className="mt-1.5">{t('{p} genauer als „unverändert“', { p: pct(skill) })}</p>
  ) : (
    <p className="mt-1.5 text-orange-400">{t('{p} ungenauer als „unverändert“', { p: pct(-skill) })}</p>
  )
}

function CheckTab({ check }: { check: BacktestResult | null | 'pending' }) {
  if (check === 'pending') return <p className="animate-pulse text-muted">{t('Prüfe frühere Prognosen …')}</p>
  if (!check) return <p className="text-muted">{t('Für einen Rückblick muss vor dem Prognosezeitraum noch genug Historie liegen.')}</p>
  return (
    <>
      <p>
        {t('{n} frühere Prognosen über je {steps} Kerzen, jede mit dem echten Verlauf danach verglichen.', { n: check.runs, steps: check.steps })}
      </p>
      <p className="mt-3 text-slate-200">{t('Wie oft lag der echte Kurs im Bereich?')}</p>
      <Band label={t('50 %-Bereich')} value={check.inside50} target={0.5} />
      <Band label={t('80 %-Bereich')} value={check.inside80} target={0.8} />
      <Band label={t('90 %-Bereich')} value={check.inside90} target={0.9} />
      <p className="mt-3 text-slate-200">{t('Stimmt „Chance ↑“?')}</p>
      <ChanceTable groups={check.chance} />
      <p className="mt-3 text-slate-200">{t('Kalibrierung geprüft')}</p>
      {check.calibration ? (
        <p className="mt-1">
          {t('80 %-Bereich an den jüngeren {n} Rückblicken: ohne Kalibrierung {raw}, kalibriert {calibrated} (Faktor {f}, nur aus den älteren berechnet).', {
            n: Math.floor(check.runs / 2),
            raw: pct(check.calibration.raw),
            f: check.calibration.factor.toLocaleString(locale(), { maximumFractionDigits: 2 }),
            calibrated: pct(check.calibration.calibrated)
          })}
        </p>
      ) : (
        <p className="mt-1 text-muted">{t('Wird ab 10 Rückblicken geprüft.')}</p>
      )}
      <p className="mt-3 text-slate-200">{t('Genauigkeit')}</p>
      <p className="mt-1">
        {t('Ø Abweichung {error} · Richtung {hits}/{runs} richtig', { error: pct(check.error, 1), hits: check.direction, runs: check.runs })}
      </p>
      <VersusUnchanged error={check.error} naive={check.naiveError} />
    </>
  )
}

function ArchiveTab({ row, label }: { row: SummaryRow | null; label: string }) {
  const archiving = useStore((s) => s.forecastRun.archive)
  if (!row)
    return (
      <>
        <p className="text-muted">
          {t('Noch keine Prognose für {label} abgerechnet. Das geschieht, sobald ihr Zeitraum vorbei ist – beim Öffnen des Werts oder beim App-Start.', { label })}
        </p>
        {!archiving && <p className="mt-2 text-orange-400">{t('Archivieren ist ausgeschaltet (Prognose-Einstellungen).')}</p>}
      </>
    )
  const n = row.settled
  const avg = (v: number) => v / n
  return (
    <>
      <p>{t('{n} deiner Prognosen abgerechnet, davon {k} unabhängig (Zeiträume ohne Überschneidung).', { n, k: row.independent })}</p>
      {row.independent < FEW_INDEPENDENT && <p className="mt-1 text-muted">{t('Noch zu wenige für eine sichere Aussage.')}</p>}
      <p className="mt-3 text-slate-200">{t('Wie oft lag der echte Kurs im Bereich (wie angezeigt)?')}</p>
      <Band label={t('50 %-Bereich')} value={avg(row.sum.shown.in50)} target={0.5} />
      <Band label={t('80 %-Bereich')} value={avg(row.sum.shown.in80)} target={0.8} />
      <Band label={t('90 %-Bereich')} value={avg(row.sum.shown.in90)} target={0.9} />
      {Math.abs(row.sum.shown.in80 - row.sum.raw.in80) > 1e-9 && (
        <p className="mt-1 text-muted">{t('Ohne Kalibrierung: 80 %-Bereich {p}', { p: pct(avg(row.sum.raw.in80)) })}</p>
      )}
      <p className="mt-3 text-slate-200">{t('Stimmt „Chance ↑“?')}</p>
      <ChanceTable groups={row.chance.map((g) => ({ cases: g.cases, said: g.cases ? g.said / g.cases : 0, rose: g.cases ? g.rose / g.cases : 0 }))} />
      <p className="mt-3 text-slate-200">{t('Genauigkeit')}</p>
      <p className="mt-1">{t('Ø Abweichung {error} · Richtung {p} richtig', { error: pct(avg(row.sum.err), 1), p: pct(avg(row.sum.dir)) })}</p>
      <VersusUnchanged error={row.sum.err} naive={row.sum.naive} />
    </>
  )
}

/** Side panel "Prognose-Qualität": the check behind the shown forecast, and the archive's record so far. */
export default function ForecastQuality({ open, symbol, timeframe, result, onClose }: {
  open: boolean
  symbol: string
  timeframe: Timeframe
  result: ForecastResult | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<'check' | 'archive'>('check')
  const steps = result?.steps.length ?? 0
  const row = useSummary(symbol, timeframe, steps, open)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  const label = `${symbol} · ${tfLabel(timeframe)}`
  const tabClass = (on: boolean) => `rounded-md px-2.5 py-1 ${on ? 'bg-brand text-white shadow-glow' : 'text-muted hover:text-white'}`
  return (
    <aside
      className={`absolute inset-y-0 right-0 z-20 w-[400px] flex-col border-l border-line bg-panel/95 text-xs shadow-2xl shadow-black/50 backdrop-blur ${open ? 'flex' : 'hidden'}`}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={t('Prognose-Qualität')}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Gauge size={16} className="text-accent" />
        <span className="font-semibold text-white">{t('Prognose-Qualität')}</span>
        <span className="text-muted">{label}</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-muted hover:bg-line hover:text-white" aria-label={t('Schließen')}>
          <X size={15} />
        </button>
      </div>
      <div className="flex gap-1 px-3 pt-3" role="tablist">
        <button role="tab" aria-selected={tab === 'check'} onClick={() => setTab('check')} className={tabClass(tab === 'check')}>
          {t('Rückblick')}
        </button>
        <button role="tab" aria-selected={tab === 'archive'} onClick={() => setTab('archive')} className={tabClass(tab === 'archive')}>
          {t('Bilanz')}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-slate-300">
        {!result ? (
          <p className="text-muted">{t('Erst eine KI-Prognose berechnen.')}</p>
        ) : tab === 'check' ? (
          <CheckTab check={result.check} />
        ) : (
          <ArchiveTab row={row} label={`${label} · ${t('{n} Schritte', { n: steps })}`} />
        )}
        <p className="mt-4 text-muted">{t('Vergangene Treffsicherheit ist keine Garantie für die Zukunft.')}</p>
      </div>
    </aside>
  )
}
