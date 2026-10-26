import { MismatchDirection, type IChartApi, type ISeriesApi, type MouseEventParams, type SeriesType, type Time } from 'lightweight-charts'
import { useEffect, useState } from 'react'

export interface LegendGroup {
  pane: number
  /** Name with its settings, e.g. "SMA 20". */
  label: string
  color: string
  series: ISeriesApi<SeriesType>[]
  /** Bounded oscillator (RSI, stochastic): a plain number rather than a price. */
  osc?: boolean
}
type Point = { value?: number; color?: string }

interface Props {
  chart: IChartApi
  groups: LegendGroup[]
  /** Formats prices like the candle axis. */
  fmt: (price: number) => string
  /** true: the main pane's rows (placed in the legend block); false: one block at the top left of each lower pane. */
  main: boolean
}

/** Name, settings and value of each active indicator: the value under the crosshair, otherwise the latest. */
export default function IndicatorLegend({ chart, groups, fmt, main }: Props) {
  const [hover, setHover] = useState<MouseEventParams<Time>['seriesData'] | null>(null)
  const [, relayout] = useState(0)
  useEffect(() => {
    const onMove = (p: MouseEventParams<Time>) => setHover(p.time === undefined ? null : p.seriesData)
    chart.subscribeCrosshairMove(onMove)
    return () => chart.unsubscribeCrosshairMove(onMove)
  }, [chart])
  // The lower blocks sit at the top of their pane, which moves when a pane separator is dragged.
  useEffect(() => {
    if (main) return
    const ro = new ResizeObserver(() => relayout((n) => n + 1))
    for (const p of chart.panes()) {
      const el = p.getHTMLElement()
      if (el) ro.observe(el)
    }
    return () => ro.disconnect()
  }, [chart, groups, main])

  const row = (g: LegendGroup) => (
    // Semi-opaque background so drawings and lines running under the label do not make it unreadable.
    <div key={g.label} className="flex items-center gap-1.5 whitespace-nowrap rounded bg-bg/70 px-1">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} />
      <span className="text-slate-300">{g.label}</span>
      {g.series.map((s, i) => {
        const p = ((hover ? hover.get(s) : s.dataByIndex(Number.MAX_SAFE_INTEGER, MismatchDirection.NearestLeft)) ?? {}) as Point
        if (p.value === undefined) return null
        // Supertrend hides the jump at a trend flip with a transparent point; the value still needs a colour.
        const color = p.color && p.color !== 'transparent' ? p.color : (s.options() as { color?: string }).color
        return (
          <span key={i} className="tabular-nums" style={{ color }}>
            {g.osc ? p.value.toFixed(1) : fmt(p.value)}
          </span>
        )
      })}
    </div>
  )

  if (main) {
    const rows = groups.filter((g) => g.pane === 0)
    return rows.length > 0 && <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">{rows.map(row)}</div>
  }
  let top = 0
  return chart.panes().map((pane, i) => {
    const y = top
    top += pane.getHeight() + 1 // 1 px pane separator
    const rows = groups.filter((g) => g.pane === i)
    return (
      i > 0 &&
      rows.length > 0 && (
        <div key={i} className="pointer-events-none absolute left-3 z-10 flex flex-wrap gap-x-3 text-xs" style={{ top: y + 4 }}>
          {rows.map(row)}
        </div>
      )
    )
  })
}
