import { MismatchDirection, type IChartApi, type ISeriesApi, type MouseEventParams, type SeriesType, type Time } from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { spread } from './tagSpread'

/**
 * One rounded tag on a price axis. Without `price` it shows the series' latest value; `series` defaults to the candles
 * (an indicator's series puts the tag on its own pane). `label` is a pill left of the axis ("After hours"), `ink` the
 * text colour.
 */
export type Tag = { price?: number; series?: ISeriesApi<SeriesType>; color: string; ink?: string; label?: string }

type Cross = { y: number; price: string; x?: number; time?: string }
// Everything a tag shows, taken in the same frame, so a tag added mid-list never shows another tag's value for a frame.
type Placed = { y: number; text: string; tag: Tag; i: number }

/** Top of each pane in chart px: pane heights plus the 1 px separators between them. */
function paneTops(chart: IChartApi): number[] {
  let top = 0
  return chart.panes().map((p) => {
    const y = top
    top += p.getHeight() + 1
    return y
  })
}

/**
 * Axis tags as rounded labels (the chart library only draws square ones): the last price, pre-/after-market, alarms,
 * analysis levels, indicator values and the crosshair's price and time. Each tag fills the axis width, so the line it
 * belongs to runs right into it. `right` is the space to the right of the chart (the PC's analysis panel).
 */
export default function PriceTags({ chart, series, tags, right = 0, crossColor }: { chart: IChartApi; series: ISeriesApi<'Candlestick'>; tags: Tag[]; right?: number; crossColor: string }) {
  const [pos, setPos] = useState<{ at: Placed[]; w: number }>({ at: [], w: 0 })
  const [cross, setCross] = useState<Cross | null>(null)
  const tagsRef = useRef(tags)
  tagsRef.current = tags
  // The chart moves without telling React (scrolling, zooming, price scale, new values); follow it each frame, re-render on change.
  useEffect(() => {
    let raf = 0
    let last = ''
    const loop = () => {
      // Next frame first: an error below must not stop the tags from following the chart for good.
      raf = requestAnimationFrame(loop)
      const panes = chart.panes()
      const tops = paneTops(chart)
      const raw = tagsRef.current.flatMap((g, i): Placed[] => {
        // An indicator's series is removed before its new tags arrive; the chart throws for a removed series.
        try {
          const s = g.series ?? series
          const price = g.price ?? (s.dataByIndex(Number.MAX_SAFE_INTEGER, MismatchDirection.NearestLeft) as { value?: number } | null)?.value
          if (price === undefined) return []
          const pane = s.getPane().paneIndex()
          const y = s.priceToCoordinate(price)
          if (y === null || y < 0 || y > (panes[pane]?.getHeight() ?? 0)) return []
          return [{ i, y: Math.round(tops[pane] + y), text: s.priceFormatter().format(price), tag: g }]
        } catch {
          return []
        }
      })
      raw.sort((a, b) => a.y - b.y)
      const moved = spread(raw.map((p) => p.y))
      const at = raw.map((p, k) => ({ ...p, y: moved[k] }))
      const next = { at, w: chart.priceScale('right').width() }
      const sig = `${at.map((a) => `${a.i}:${a.y}:${a.text}:${a.tag.color}:${a.tag.label ?? ''}`).join(',')}:${next.w}`
      if (sig !== last) {
        last = sig
        setPos(next)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [chart, series])

  // The crosshair's own labels are hidden in the chart options; these replace them.
  useEffect(() => {
    const onMove = (p: MouseEventParams<Time>) => {
      if (!p.point || p.paneIndex === undefined) return setCross(null)
      const s = p.paneIndex === 0 ? series : chart.panes()[p.paneIndex]?.getSeries()[0]
      const price = s?.coordinateToPrice(p.point.y)
      const x = p.time === undefined ? null : chart.timeScale().timeToCoordinate(p.time)
      const fmt = chart.options().localization.timeFormatter
      setCross({
        y: paneTops(chart)[p.paneIndex] + p.point.y,
        price: s && price !== null && price !== undefined ? s.priceFormatter().format(price) : '',
        ...(x !== null && p.time !== undefined && { x, time: fmt ? fmt(p.time) : String(p.time) })
      })
    }
    chart.subscribeCrosshairMove(onMove)
    return () => chart.unsubscribeCrosshairMove(onMove)
  }, [chart, series])

  const text = 'rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-[13px] tabular-nums'
  const axisTag = (key: string, y: number, value: string, style: { background: string; color: string }, label?: string, z = 'z-10') => (
    <span key={key} className={`pointer-events-none absolute ${z} -translate-y-1/2`} style={{ top: y, right }}>
      <span className={`block text-center ${text}`} style={{ ...style, width: pos.w }}>
        {value}
      </span>
      {label && (
        <span className={`absolute top-0 whitespace-nowrap ${text}`} style={{ ...style, right: pos.w + 3 }}>
          {label}
        </span>
      )}
    </span>
  )
  const crossStyle = { background: crossColor, color: '#fff' }
  // The time tag stays inside the time axis.
  // shortcut: its width is estimated from the text (11 px digits, about 6.6 px each), so a wide font may overhang
  // the edge by a few px; measure the element if that shows.
  const half = cross?.time ? cross.time.length * 3.3 + 6 : 0
  const timeX = cross?.x === undefined ? 0 : Math.min(Math.max(cross.x, half), chart.timeScale().width() - half)
  return (
    <>
      {pos.at.map(({ i, y, text: value, tag: g }) =>
        axisTag(`${g.label ?? 'tag'}:${i}`, y, value, { background: g.color, color: g.ink ?? '#fff' }, g.label)
      )}
      {cross?.price && axisTag('cross', cross.y, cross.price, crossStyle, undefined, 'z-20')}
      {cross?.time && (
        <span
          className="pointer-events-none absolute bottom-0 z-20 flex -translate-x-1/2 items-center"
          style={{ left: timeX, height: chart.timeScale().height() }}
        >
          <span className={`whitespace-nowrap ${text}`} style={crossStyle}>
            {cross.time}
          </span>
        </span>
      )}
    </>
  )
}
