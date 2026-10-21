import { forecastCandles, probabilityAbove, Q, type BacktestResult } from '../../../shared/forecast'
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
  /** The latest backtest's median over the real bars after its cutoff (starting at the cutoff close). */
  backtestPath: { time: number; value: number }[] | null
}

const pct = (v: number, digits = 1) => `${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: digits })} %`
const signed = (v: number) => `${v >= 0 ? '+' : ''}${pct(v)}`

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
  const date = new Date(result.times[index] * 1000).toLocaleString('de-DE', {
    dateStyle: 'medium',
    ...(intraday && { timeStyle: 'short' })
  })
  const range = (lo: number, hi: number) => `${formatPrice(q[lo])} – ${formatPrice(q[hi])}`
  const candle = candles
    ? forecastCandles(result.base, result.steps.map((v) => v[Q.median]), result.upperWicks, result.lowerWicks)[index]
    : null
  const rows: [string, string][] = [
    ['Median', `${formatPrice(q[Q.median])} (${signed(q[Q.median] / result.base - 1)})`],
    ...(candle
      ? ([
          ['Eröffnung', formatPrice(candle.open)],
          ['Hoch / Tief', `${formatPrice(candle.high)} / ${formatPrice(candle.low)}`]
        ] as [string, string][])
      : []),
    ['50 %-Bereich', range(Q.p25, Q.p75)],
    ['80 %-Bereich', range(Q.p10, Q.p90)],
    ['90 %-Bereich', range(Q.p05, Q.p95)],
    [
      `Über ${formatPrice(result.base)}`,
      up >= 0.99 ? '≥ 99 %' : up <= 0.01 ? '≤ 1 %' : pct(up, 0)
    ]
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
        Prognose · {date} <span className="font-normal text-muted">(Kerze {index + 1})</span>
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

/** One-line summary of how well the model forecast this chart's own recent past. */
export function ForecastCheck({ check }: { check: BacktestResult | null }) {
  if (!check)
    return (
      <div className="mt-1 text-muted" title="Für einen Rückblick muss vor dem Prognosezeitraum noch genug Historie liegen.">
        Rückblick: zu wenig Historie
      </div>
    )
  const title =
    `Das Modell hat ${check.runs}× ab früheren Zeitpunkten je ${check.steps} Kerzen prognostiziert ` +
    '(die jüngste davon grau gepunktet im Chart) und wurde mit dem echten Verlauf verglichen.\n' +
    `Ø Abweichung: mittlerer Abstand des Medians zum echten Schlusskurs.\n` +
    `Im 80 %-Bereich: Anteil echter Kurse innerhalb des 80 %-Fächers – gut kalibriert sind etwa 80 % ` +
    `(im 50 %-Bereich: ${pct(check.inside50, 0)}, ideal etwa 50 %).\n` +
    'Richtung: ob der Median am Ende richtig über oder unter dem Startkurs lag.\n' +
    'Vergangene Treffsicherheit ist keine Garantie für die Zukunft.'
  return (
    <div className="pointer-events-auto mt-1 w-fit text-muted" title={title}>
      <span className="text-slate-300">Rückblick:</span> Ø Abweichung {pct(check.error)} · im 80 %-Bereich{' '}
      {pct(check.inside80, 0)} · Richtung {check.direction}/{check.runs} richtig
    </div>
  )
}

const BANDS: [keyof ForecastView, string, string][] = [
  ['band50', '50 %-Bereich', 'wo der Kurs am wahrscheinlichsten liegt'],
  ['band80', '80 %-Bereich', 'übliche Schwankung'],
  ['band90', '90 %-Bereich', 'auch seltene Ausschläge']
]

/** What a forecast shows; changes apply to a shown forecast at once, without recomputing. */
export function ForecastSettings({ onClose }: { onClose: () => void }) {
  const view = useStore((s) => s.forecastView)
  const set = useStore((s) => s.setForecastView)
  const check = (key: keyof ForecastView, label: string, hint?: string) => (
    <label key={key} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-bg">
      <input
        type="checkbox"
        checked={view[key] as boolean}
        onChange={(e) => set({ [key]: e.target.checked })}
        className="mt-0.5 accent-accent"
      />
      <span>
        <span className="text-slate-200">{label}</span>
        {hint && <span className="block text-[11px] text-muted">{hint}</span>}
      </span>
    </label>
  )
  const style = (value: ForecastView['style'], label: string) => (
    <button
      onClick={() => set({ style: value })}
      aria-pressed={view.style === value}
      className={`flex-1 rounded-md px-2 py-1 ${view.style === value ? 'bg-brand text-white shadow-glow' : 'text-muted hover:text-white'}`}
    >
      {label}
    </button>
  )
  const heading = 'px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted'
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Prognose-Anzeige"
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-line bg-panel/95 p-2 text-xs shadow-2xl shadow-black/50 backdrop-blur"
      >
        <p className={heading}>Darstellung</p>
        <div className="flex gap-1 rounded-lg bg-bg p-0.5 ring-1 ring-line">
          {style('line', 'Linie (Median)')}
          {style('candles', 'Kerzen')}
        </div>
        {view.style === 'candles' && (
          <p className="px-1 pt-1.5 text-[11px] leading-snug text-muted">
            Je Schritt eine Kerze: Schlusskurs-Median der Prognose, dazu die prognostizierte typische
            Dochtlänge. Sie zeigt den wahrscheinlichsten Verlauf, keine echten Kursschwankungen.
          </p>
        )}
        <p className={heading}>Unsicherheitsbereiche</p>
        {BANDS.map(([key, label, hint]) => check(key, label, hint))}
        <p className={heading}>Zusätzlich</p>
        {check('backtest', 'Rückblick', 'Treffsicherheit und frühere Prognose (grau)')}
        {check('hover', 'Werte beim Überfahren')}
      </div>
    </>
  )
}
