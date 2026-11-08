import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useEffect, useState } from 'react'

/** The last price on the phone's price axis as a rounded tag (the chart library only draws square ones). */
export default function PriceTag({ chart, series, price, color }: { chart: IChartApi; series: ISeriesApi<'Candlestick'>; price: number; color: string }) {
  const [pos, setPos] = useState<{ y: number; w: number } | null>(null)
  // The chart moves without telling React (scrolling, zooming, price scale); follow it each frame, re-render on change.
  useEffect(() => {
    let raf = 0
    let last = ''
    const loop = () => {
      const y = series.priceToCoordinate(price)
      const h = chart.panes()[0]?.getHeight() ?? 0
      const next = y === null || y < 0 || y > h ? null : { y: Math.round(y), w: chart.priceScale('right').width() }
      const sig = next ? `${next.y}:${next.w}` : ''
      if (sig !== last) {
        last = sig
        setPos(next)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [chart, series, price])
  if (!pos) return null
  return (
    <span className="pointer-events-none absolute right-0 z-10 flex -translate-y-1/2 justify-center" style={{ top: pos.y, width: pos.w }}>
      <span className="rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white" style={{ background: color }}>
        {series.priceFormatter().format(price)}
      </span>
    </span>
  )
}
