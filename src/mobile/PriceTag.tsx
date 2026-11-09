import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { spread } from './tagSpread'

/** One rounded tag on the price axis; `label` is a pill left of the axis ("After hours"), `ink` the text colour. */
export type Tag = { price: number; color: string; ink?: string; label?: string }

/**
 * Price tags on the price axis as rounded labels (the chart library only draws square ones): the last price, and the
 * pre-/after-market price. `right` is the space to the right of the chart (the PC's analysis panel).
 */
export default function PriceTags({ chart, series, tags, right = 0 }: { chart: IChartApi; series: ISeriesApi<'Candlestick'>; tags: Tag[]; right?: number }) {
  const [pos, setPos] = useState<{ ys: (number | null)[]; w: number }>({ ys: [], w: 0 })
  const tagsRef = useRef(tags)
  tagsRef.current = tags
  const key = tags.map((g) => `${g.price}:${g.label ?? ''}`).join('|')
  // The chart moves without telling React (scrolling, zooming, price scale); follow it each frame, re-render on change.
  useEffect(() => {
    let raf = 0
    let last = ''
    const loop = () => {
      const h = chart.panes()[0]?.getHeight() ?? 0
      const raw = tagsRef.current.map((g, i) => ({ i, y: series.priceToCoordinate(g.price) })).filter((p) => p.y !== null && p.y >= 0 && p.y <= h)
      raw.sort((a, b) => (a.y as number) - (b.y as number))
      const moved = spread(raw.map((p) => Math.round(p.y as number)))
      const ys: (number | null)[] = tagsRef.current.map(() => null)
      raw.forEach((p, k) => (ys[p.i] = moved[k]))
      const next = { ys, w: chart.priceScale('right').width() }
      const sig = `${next.ys.join(',')}:${next.w}`
      if (sig !== last) {
        last = sig
        setPos(next)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [chart, series, key])

  const text = 'rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-[13px] tabular-nums'
  return tags.map((g, i) => {
    const y = pos.ys[i]
    if (y === null || y === undefined) return null
    const style = { background: g.color, color: g.ink ?? '#fff' }
    return (
      <span key={`${g.label ?? 'last'}:${i}`} className="pointer-events-none absolute z-10 -translate-y-1/2" style={{ top: y, right }}>
        <span className="flex justify-center" style={{ width: pos.w }}>
          <span className={text} style={style}>
            {series.priceFormatter().format(g.price)}
          </span>
        </span>
        {g.label && (
          <span className={`absolute top-0 whitespace-nowrap ${text}`} style={{ ...style, right: pos.w + 3 }}>
            {g.label}
          </span>
        )}
      </span>
    )
  })
}
