import { ArrowUp, BrainCircuit, ChevronDown, ChevronRight, Info, Sparkles, TriangleAlert, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { forecastCandles, probabilityAbove, Q, trend, type BacktestResult } from '../../../shared/forecast'
import { locale, msg, t } from '../../../shared/i18n'
import { formatPrice } from '../lib/format'
import { useStore, type ForecastView } from '../store/useStore'

export interface ForecastResult {
  /** Bar times of the forecast steps. */
  times: number[]
  /** Per step the 21 quantile values. */
  steps: number[][]
  /** Median forecast wick lengths above and below the candle body per step, for forecast candles. */
  upperWicks: number[]
  lowerWicks: number[]
  /** Last close the forecast starts from, and its bar time. */
  base: number
  baseTime: number
  /** Backtest against the real past, null when the history is too short for one. */
  check: BacktestResult | null
  /** Factor the ranges were calibrated by (see bandScale), null when not calibrated. */
  bandScale: number | null
  /** The latest backtest's median over the real bars after its cutoff (starting at the cutoff close). */
  backtestPath: { time: number; value: number }[] | null
}

const pct = (v: number, digits = 1) => `${(v * 100).toLocaleString(locale(), { maximumFractionDigits: digits })} %`
const signed = (v: number) => `${v >= 0 ? '+' : ''}${pct(v)}`
// probabilityAbove stays within 1-99 %; at the caps the model says nothing finer.
const chance = (up: number) => (up >= 0.99 ? '≥ 99 %' : up <= 0.01 ? '≤ 1 %' : pct(up, 0))

/** Values of one forecast step, shown next to the crosshair. */
export function ForecastTip({ result, index, x, y, width, height, intraday, candles }: {
  result: ForecastResult
  index: number
  x: number
  y: number
  /** Chart size, to keep the box inside it. */
  width: number
  height: number
  intraday: boolean
  /** Forecast drawn as candles: also show that step's candle. */
  candles: boolean
}) {
  const q = result.steps[index]
  const up = probabilityAbove(q, result.base)
  const date = new Date(result.times[index] * 1000).toLocaleString(locale(), {
    dateStyle: 'medium',
    ...(intraday && { timeStyle: 'short' })
  })
  const range = (lo: number, hi: number) => `${formatPrice(q[lo])} – ${formatPrice(q[hi])}`
  const candle = candles
    ? forecastCandles(result.base, result.steps.map((v) => v[Q.median]), result.upperWicks, result.lowerWicks)[index]
    : null
  const rows: [string, string][] = [
    [t('Median'), `${formatPrice(q[Q.median])} (${signed(q[Q.median] / result.base - 1)})`],
    ...(candle
      ? ([
          [t('Eröffnung'), formatPrice(candle.open)],
          [t('Hoch / Tief'), `${formatPrice(candle.high)} / ${formatPrice(candle.low)}`]
        ] as [string, string][])
      : []),
    [t('50 %-Bereich'), range(Q.p25, Q.p75)],
    [t('80 %-Bereich'), range(Q.p10, Q.p90)],
    [t('90 %-Bereich'), range(Q.p05, Q.p95)],
    [t('Über {price}', { price: formatPrice(result.base) }), chance(up)]
  ]
  const flipX = x > width - 260
  const flipY = y > height - 170
  return (
    <div
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-line bg-panel/95 backdrop-blur px-2.5 py-2 text-xs shadow-2xl shadow-black/50"
      style={{
        left: x,
        top: y,
        transform: `translate(${flipX ? 'calc(-100% - 14px)' : '14px'}, ${flipY ? 'calc(-100% - 14px)' : '14px'})`
      }}
    >
      <p className="mb-1 font-medium text-[#ffd54f]">
        {t('Prognose')} · {date} <span className="font-normal text-muted">({t('Kerze {n}', { n: index + 1 })})</span>
      </p>
      <table className="tabular-nums">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="pr-3 text-muted">{k}</td>
              <td className="text-right text-slate-200">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const HEADLINE = {
  up: msg('Fazit: eher steigend'),
  down: msg('Fazit: eher fallend'),
  flat: msg('Fazit: keine klare Richtung')
}

/** Card under the forecast button: the forecast in plain words, with the backtest below; folds to its headline. */
export function ForecastSummary({ result, intraday, showCheck }: {
  result: ForecastResult
  intraday: boolean
  /** Backtest switched on in the settings. */
  showCheck: boolean
}) {
  // Starts folded each time a forecast is shown.
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState(false)
  const end = result.steps[result.steps.length - 1]
  const up = probabilityAbove(end, result.base)
  const worse = showCheck && result.check !== null && result.check.error > result.check.naiveError
  const date = new Date(result.times[result.times.length - 1] * 1000).toLocaleString(locale(), {
    dateStyle: 'medium',
    ...(intraday && { timeStyle: 'short' })
  })
  return (
    <div className="w-80 rounded-lg border border-line bg-panel/80 px-2.5 py-2 text-xs shadow-2xl shadow-black/50 backdrop-blur">
      {help && <ForecastHelp onClose={() => setHelp(false)} />}
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-left font-semibold text-slate-200 hover:text-white"
      >
        {worse && <TriangleAlert size={13} className="shrink-0 text-orange-400" />}
        <span className="flex-1">{t(HEADLINE[trend(up)])}</span>
        <span
          title={t('Wahrscheinlichkeit für einen höheren Kurs: {p}', { p: chance(up) })}
          className="inline-flex shrink-0 items-center gap-0.5 tabular-nums text-slate-300"
        >
          {t('Chance')}
          <ArrowUp size={12} />
          {chance(up)}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <p className="mt-1 text-slate-300">
            {t('In {n} Kerzen (bis {date}) liegt der Kurs laut KI mit 80 % Wahrscheinlichkeit zwischen {lo} und {hi} ({from} bis {to}).', {
              n: result.steps.length,
              date,
              lo: formatPrice(end[Q.p10]),
              hi: formatPrice(end[Q.p90]),
              from: signed(end[Q.p10] / result.base - 1),
              to: signed(end[Q.p90] / result.base - 1)
            })}
          </p>
          <p className="mt-1 text-slate-300">{t('Wahrscheinlichkeit für einen höheren Kurs: {p}', { p: chance(up) })}</p>
          {worse && (
            <p className="mt-1 text-orange-400">
              {t('Im Rückblick war „Kurs bleibt gleich“ genauer. Diese Prognose mit Vorsicht betrachten.')}
            </p>
          )}
          {showCheck && (
            <div className="mt-2 border-t border-line pt-1">
              <ForecastCheck check={result.check} scale={result.bandScale} />
            </div>
          )}
          <div className="mt-2 flex items-center justify-between gap-2 text-muted">
            <span>{t('Keine Anlageberatung')}</span>
            <button
              onClick={() => setHelp(true)}
              title={t('Begriffe und Einstellungen erklärt')}
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-line hover:text-white"
            >
              <Info size={13} />
              {t('Was bedeutet das?')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** One-line summary of how well the model forecast this chart's own recent past. */
export function ForecastCheck({ check, scale }: { check: BacktestResult | null; scale: number | null }) {
  if (!check)
    return (
      <div className="mt-1 text-muted" title={t('Für einen Rückblick muss vor dem Prognosezeitraum noch genug Historie liegen.')}>
        {t('Rückblick: zu wenig Historie')}
      </div>
    )
  const title =
    t('Das Modell hat {runs}× ab früheren Zeitpunkten je {steps} Kerzen prognostiziert (die jüngste davon grau gepunktet im Chart) und wurde mit dem echten Verlauf verglichen.', { runs: check.runs, steps: check.steps }) +
    '\n' +
    t('Ø Abweichung: mittlerer Abstand des Medians zum echten Schlusskurs.') +
    '\n' +
    t('Im 80 %-Bereich: Anteil echter Kurse innerhalb des 80 %-Fächers – gut kalibriert sind etwa 80 % (im 50 %-Bereich: {in50}, ideal etwa 50 %).', { in50: pct(check.inside50, 0) }) +
    '\n' +
    t('Richtung: ob der Median am Ende richtig über oder unter dem Startkurs lag.') +
    '\n' +
    t('Gegenüber „unverändert“: Backtest mit festem Kurs, also der einfachsten Schätzung, dass der Kurs ab dem früheren Zeitpunkt gleich bleibt. Orange: Diese Schätzung lag näher, die KI-Prognose hat bei diesem Chart also womöglich nichts gebracht.') +
    '\n' +
    t('Vergangene Treffsicherheit ist keine Garantie für die Zukunft.') +
    (scale === null
      ? ''
      : '\n' + t('Bänder kalibriert: Die Unsicherheitsbereiche sind um den Faktor {f} gestreckt (über 1) oder gestaucht (unter 1), damit im Rückblick 80 % der echten Kurse im 80 %-Bereich lagen. Die Werte oben gelten für das unkalibrierte Modell.', { f: scale.toLocaleString(locale(), { maximumFractionDigits: 2 }) }))
  return (
    <div className="pointer-events-auto mt-1 w-fit text-muted" title={title}>
      <span className="text-slate-300">{t('Rückblick:')}</span>{' '}
      {t('Ø Abweichung {error} · im 80 %-Bereich {in80} · Richtung {hits}/{runs} richtig', {
        error: pct(check.error),
        in80: pct(check.inside80, 0),
        hits: check.direction,
        runs: check.runs
      })}
      {check.naiveError > 0 && (
        // Relative to "unchanged": below 0 means the model missed the real closes by more than the start price did.
        <NaiveComparison skill={1 - check.error / check.naiveError} />
      )}
      {scale !== null && (
        <span className="text-amber-200"> · {t('Bänder ×{f} kalibriert', { f: scale.toLocaleString(locale(), { maximumFractionDigits: 2 }) })}</span>
      )}
    </div>
  )
}

function NaiveComparison({ skill }: { skill: number }) {
  const p = pct(Math.abs(skill), 0)
  return skill >= 0 ? (
    <span> · {t('{p} genauer als „unverändert“', { p })}</span>
  ) : (
    <span className="text-orange-400"> · {t('{p} ungenauer als „unverändert“', { p })}</span>
  )
}

const BANDS: [keyof ForecastView, string, string][] = [
  ['band50', msg('50 %-Bereich'), msg('wo der Kurs am wahrscheinlichsten liegt')],
  ['band80', msg('80 %-Bereich'), msg('übliche Schwankung')],
  ['band90', msg('90 %-Bereich'), msg('auch seltene Ausschläge')]
]

/** Row of buttons choosing one value. */
function Segments<V extends string | number>({
  value,
  options,
  onChange
}: {
  value: V
  options: [V, string][]
  onChange: (v: V) => void
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-bg p-0.5 ring-1 ring-line">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`flex-1 rounded-md px-2 py-1 ${value === v ? 'bg-brand text-white shadow-glow' : 'text-muted hover:text-white'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// Glossary for the forecast: [section, [term, explanation][]].
const HELP: [string, [string, string][]][] = [
  [
    msg('Darstellung'),
    [
      [msg('Fazit'), msg('Die Prognose in Worten, neben dem Knopf: Richtung, Spanne des 80 %-Bereichs am Ende und Wahrscheinlichkeit für einen höheren Kurs. „Eher steigend“ über 60 %, „eher fallend“ unter 40 %, dazwischen „keine klare Richtung“. Ein Klick auf die Überschrift klappt die Karte auf.')],
      [msg('Median'), msg('Die mittlere Prognose: Laut Modell liegt der Kurs je zur Hälfte darüber oder darunter. Im Chart die gestrichelte Linie.')],
      [msg('Kerzen'), msg('Zeigt den Median als Kerzen mit der prognostizierten typischen Dochtlänge. Das ist der wahrscheinlichste Verlauf, keine echten Kursschwankungen.')]
    ]
  ],
  [
    msg('Unsicherheitsbereiche'),
    [
      [msg('50 / 80 / 90 %-Bereich'), msg('Mit dieser Wahrscheinlichkeit liegt der Kurs laut Modell im jeweiligen Band. Je weiter in der Zukunft, desto breiter der Fächer.')],
      [msg('Werte beim Überfahren'), msg('Kasten mit Median, Bereichen und der Wahrscheinlichkeit, dass der Kurs über dem aktuellen Kurs liegt.')]
    ]
  ],
  [
    msg('Berechnung'),
    [
      [msg('Prognose-Länge'), msg('Wie viele Kerzen in die Zukunft prognostiziert werden. Je weiter, desto unsicherer. Auto nimmt bis zu 64, je nach vorhandener Historie.')],
      [msg('Rückblick'), msg('Das Modell prognostiziert ab früheren Zeitpunkten und wird mit dem echten Verlauf verglichen. Die jüngste dieser Prognosen ist grau gepunktet im Chart. Mehr Rückblicke sind aussagekräftiger, rechnen aber länger.')],
      [msg('Bänder kalibrieren'), msg('Streckt oder staucht die Bereiche so, dass im Rückblick 80 % der echten Kurse im 80 %-Bereich lagen. Der Median bleibt gleich.')],
      [msg('Automatisch aktualisieren'), msg('Rechnet die Prognose neu, sobald eine neue Kerze beginnt.')]
    ]
  ],
  [
    msg('Werte im Rückblick'),
    [
      [msg('Ø Abweichung'), msg('Mittlerer Abstand des Medians zum echten Schlusskurs, in Prozent des Kurses.')],
      [msg('Im 80 %-Bereich'), msg('Anteil der echten Kurse innerhalb des 80 %-Fächers. Gut sind etwa 80 %; deutlich weniger heißt, die Bereiche sind zu schmal, deutlich mehr, sie sind zu breit.')],
      [msg('Richtung'), msg('Wie oft der Median am Ende richtig über oder unter dem Startkurs lag. Etwa die Hälfte entspricht dem Zufall.')],
      [msg('Gegenüber „unverändert“'), msg('Backtest mit festem Kurs: Ab einem früheren Zeitpunkt wird die KI-Prognose mit der einfachsten Schätzung verglichen, dass der Kurs gleich bleibt. Beispiel: Stand der Kurs damals bei 100 €, lautet die einfache Schätzung für jede folgende Kerze 100 €. Orange: Die einfache Schätzung lag näher am echten Verlauf, die KI-Prognose hat bei diesem Chart also womöglich nichts gebracht. Ohne Farbe: Die KI lag näher, das macht sie aber noch nicht verlässlich.')],
      [msg('Bänder ×… kalibriert'), msg('Faktor, um den die Bereiche gestreckt (über 1) oder gestaucht (unter 1) wurden. Die übrigen Rückblick-Werte gelten für das unkalibrierte Modell.')]
    ]
  ],
  [
    msg('Grenzen'),
    [
      [msg('Was das Modell weiß'), msg('Chronos-2 kennt nur den Kursverlauf, keine Nachrichten, Zahlen oder Stimmung. Bei Kursen schlägt es die Annahme „unverändert“ oft nur knapp oder gar nicht, besonders bei Krypto. Vergangene Treffsicherheit ist keine Garantie, und die Prognose ist keine Anlageberatung.')]
    ]
  ]
]

/** Explains every term and setting of the forecast. Portalled: the settings popover's backdrop blur would trap a fixed overlay. */
function ForecastHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forecast-help-title"
        className="max-h-[85vh] w-[520px] overflow-y-auto rounded-xl border border-line bg-panel/95 p-5 text-xs leading-relaxed text-slate-300 shadow-2xl backdrop-blur"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="forecast-help-title" className="text-base font-semibold text-white">
            {t('KI-Prognose: Begriffe und Einstellungen')}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-white" aria-label={t('Schließen')}>
            <X size={18} />
          </button>
        </div>
        {HELP.map(([section, items]) => (
          <section key={section}>
            <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-muted">{t(section)}</h3>
            <dl className="space-y-1.5">
              {items.map(([term, text]) => (
                <div key={term}>
                  <dt className="font-semibold text-slate-200">{t(term)}</dt>
                  <dd>{t(text)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>,
    document.body
  )
}

/** What a forecast shows and how it is computed; display changes only redraw, the others recompute. */
export function ForecastSettings({ onClose, onOpenAnalysis }: { onClose: () => void; onOpenAnalysis: () => void }) {
  const view = useStore((s) => s.forecastView)
  const set = useStore((s) => s.setForecastView)
  const run = useStore((s) => s.forecastRun)
  const setRun = useStore((s) => s.setForecastRun)
  const check = (key: keyof ForecastView, label: string, hint?: string) => (
    <label key={key} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-bg">
      <input
        type="checkbox"
        checked={view[key] as boolean}
        onChange={(e) => set({ [key]: e.target.checked })}
        className="mt-0.5 accent-accent"
      />
      <span>
        <span className="text-slate-200">{t(label)}</span>
        {hint && <span className="block text-[11px] text-muted">{t(hint)}</span>}
      </span>
    </label>
  )
  const style = (value: ForecastView['style'], label: string) => (
    <button
      onClick={() => set({ style: value })}
      aria-pressed={view.style === value}
      className={`flex-1 rounded-md px-2 py-1 ${view.style === value ? 'bg-brand text-white shadow-glow' : 'text-muted hover:text-white'}`}
    >
      {t(label)}
    </button>
  )
  const heading = 'px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted'
  const [help, setHelp] = useState(false)
  return (
    <>
      {help && <ForecastHelp onClose={() => setHelp(false)} />}
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        role="dialog"
        aria-label={t('Prognose-Anzeige')}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute right-0 top-full z-30 mt-2 max-h-[calc(100vh-9rem)] w-64 overflow-y-auto rounded-xl border border-line bg-panel/95 p-2 text-xs shadow-2xl shadow-black/50 backdrop-blur"
      >
        {/* What the forecast is, before its display options. */}
        <div className="flex items-start gap-2 px-1 pb-1 pt-1">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-amber-200" />
          <span className="flex-1">
            <span className="font-semibold text-slate-200">{t('KI-Prognose mit Chronos-2')}</span>
            <span className="block text-[11px] leading-snug text-muted">
              {t('Statistische Prognose aus dem Kursverlauf, lokal auf deinem Rechner berechnet. Keine Anlageberatung.')}
            </span>
          </span>
          <button
            onClick={() => setHelp(true)}
            title={t('Begriffe und Einstellungen erklärt')}
            aria-label={t('Begriffe und Einstellungen erklärt')}
            className="shrink-0 rounded p-0.5 text-muted hover:bg-line hover:text-white"
          >
            <Info size={15} />
          </button>
        </div>
        <div className="mx-1 mt-1 h-px bg-line" />
        <p className={heading}>{t('Darstellung')}</p>
        <div className="flex gap-1 rounded-lg bg-bg p-0.5 ring-1 ring-line">
          {style('line', msg('Linie (Median)'))}
          {style('candles', msg('Kerzen'))}
        </div>
        {view.style === 'candles' && (
          <p className="px-1 pt-1.5 text-[11px] leading-snug text-muted">
            {t('Je Schritt eine Kerze: Schlusskurs-Median der Prognose, dazu die prognostizierte typische Dochtlänge. Sie zeigt den wahrscheinlichsten Verlauf, keine echten Kursschwankungen.')}
          </p>
        )}
        <p className={heading}>{t('Unsicherheitsbereiche')}</p>
        {BANDS.map(([key, label, hint]) => check(key, label, hint))}
        <p className={heading}>{t('Zusätzlich')}</p>
        {check('hover', msg('Werte beim Überfahren'))}
        <p className={heading}>{t('Berechnung')}</p>
        <p className="px-1 pb-1 text-slate-200">{t('Prognose-Länge')}</p>
        <Segments
          value={run.horizon}
          options={[
            ['auto', t('Auto')],
            [8, '8'],
            [16, '16'],
            [32, '32']
          ]}
          onChange={(horizon) => setRun({ horizon })}
        />
        <p className="px-1 pb-1.5 pt-1 text-[11px] leading-snug text-muted">
          {t('Kerzen in die Zukunft; Auto: bis 64, je nach vorhandener Historie')}
        </p>
        <p className="px-1 pb-1 text-slate-200">{t('Rückblick')}</p>
        <Segments
          value={run.backtestRuns}
          options={[
            [0, t('Aus')],
            [3, '3'],
            [5, '5'],
            [10, '10']
          ]}
          onChange={(backtestRuns) => setRun({ backtestRuns })}
        />
        <p className="px-1 pb-1 pt-1 text-[11px] leading-snug text-muted">
          {t('Treffsicherheit früherer Prognosen (die jüngste grau im Chart): mehr ist aussagekräftiger, rechnet aber länger')}
        </p>
        <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-bg">
          <input
            type="checkbox"
            checked={run.calibrate}
            onChange={(e) => setRun({ calibrate: e.target.checked })}
            className="mt-0.5 accent-accent"
          />
          <span>
            <span className="text-slate-200">{t('Bänder kalibrieren')}</span>
            <span className="block text-[11px] leading-snug text-muted">
              {run.backtestRuns
                ? t('Bereiche so breit machen, wie sie im Rückblick hätten sein müssen; der Median bleibt gleich. Mit 10 Rückblicken am verlässlichsten.')
                : t('Braucht den Rückblick (3, 5 oder 10).')}
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-bg">
          <input
            type="checkbox"
            checked={run.autoUpdate}
            onChange={(e) => setRun({ autoUpdate: e.target.checked })}
            className="mt-0.5 accent-accent"
          />
          <span>
            <span className="text-slate-200">{t('Automatisch aktualisieren')}</span>
            <span className="block text-[11px] text-muted">{t('Neu berechnen, sobald eine neue Kerze beginnt')}</span>
          </span>
        </label>
        {/* Separates the Chronos-2 settings above from the TradingAgents analysis below. */}
        <div className="mx-1 mt-2 h-px bg-line" />
        <p className={heading}>{t('Erweitert · optional')}</p>
        <button
          onClick={() => {
            onOpenAnalysis()
            onClose()
          }}
          className="flex w-full items-start gap-2 rounded-md px-1 py-1.5 text-left hover:bg-bg"
        >
          <BrainCircuit size={14} className="mt-0.5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-slate-200">{t('Umfassende Analyse mit TradingAgents')}</span>
            <span className="block text-[11px] leading-snug text-muted">
              {t('KI-Agenten werten Nachrichten, Zahlen und Stimmung aus und geben Einschätzung und Kursziel. Eigener API-Key oder Ollama nötig.')}
            </span>
          </span>
          <ChevronRight size={14} className="mt-0.5 shrink-0 text-muted" />
        </button>
      </div>
    </>
  )
}
