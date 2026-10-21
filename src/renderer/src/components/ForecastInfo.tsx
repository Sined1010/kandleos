import { probabilityAbove, Q, type BacktestResult } from '../../../shared/forecast'
import { formatPrice } from '../lib/format'

export interface ForecastResult {
  /** Bar times of the forecast steps. */
  times: number[]
  /** Per step the 21 quantile values. */
  steps: number[][]
  /** Last close the forecast starts from. */
  base: number
  /** Backtest against the real past, null when the history is too short for one. */
  check: BacktestResult | null
}

const pct = (v: number, digits = 1) => `${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: digits })} %`
const signed = (v: number) => `${v >= 0 ? '+' : ''}${pct(v)}`

/** Values of one forecast step, shown next to the crosshair. */
export function ForecastTip({ result, index, x, y, width, height, intraday }: {
  result: ForecastResult
  index: number
  x: number
  y: number
  /** Chart size, to keep the box inside it. */
  width: number
  height: number
  intraday: boolean
}) {
  const q = result.steps[index]
  const up = probabilityAbove(q, result.base)
  const date = new Date(result.times[index] * 1000).toLocaleString('de-DE', {
    dateStyle: 'medium',
    ...(intraday && { timeStyle: 'short' })
  })
  const range = (lo: number, hi: number) => `${formatPrice(q[lo])} – ${formatPrice(q[hi])}`
  const rows: [string, string][] = [
    ['Median', `${formatPrice(q[Q.median])} (${signed(q[Q.median] / result.base - 1)})`],
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
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded border border-line bg-panel/95 px-2.5 py-2 text-xs shadow-xl"
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
