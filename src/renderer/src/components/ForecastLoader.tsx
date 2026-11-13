import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import type { IChartApi, ISeriesApi, Logical, SeriesType, Time } from 'lightweight-charts'
import { ghostPath } from '../lib/ghostPath'
import { THEME } from '../lib/theme'

// Candles after "Candle Loader" by Bilal Bostan (uiverse.io/bilal_9731/new-moose-50, MIT): body bottom and height,
// wick bottom and height, in % of the candle. Now only the symbol loader (BrandLoader) uses them.
const CANDLES = [
  [7.1, 18.93, 0, 31.95], [26.04, 2.37, 19.41, 14.91], [28.64, 4.5, 16.92, 21.66], [31.42, 3.43, 19.76, 27.93],
  [31.42, 15.44, 27.43, 28.07], [46.54, 0.28, 43.43, 24.38], [35.86, 8.7, 29.7, 24.5], [11.67, 24.19, 5.33, 31.83],
  [11.83, 15.1, 7.93, 24.97], [27.81, 12.04, 27.69, 28.17], [39.85, 28.25, 39.53, 28.58], [70.8, 6.27, 60.96, 24.84],
  [75.8, 2.71, 68.38, 31.62], [67.23, 8.71, 64.8, 24.97], [67.81, 7.85, 57.54, 27.55], [70.08, 6.14, 55.68, 21.83],
  [66.39, 3.69, 58.11, 26.11], [64.8, 9.78, 45.47, 29.61]
]
// The logo's indigo → cyan, spread over the candles from left to right.
const brand = (k: number) =>
  '#' + [1, 3, 5].map((o) => {
    const [a, b] = [THEME.brandFrom, THEME.brandTo].map((c) => parseInt(c.slice(o, o + 2), 16))
    return Math.round(a + (b - a) * k).toString(16).padStart(2, '0')
  }).join('')
// Built once: React reuses the same elements on every render.
const bars = (colour: (k: number) => string) =>
  CANDLES.map(([b, h, wb, wh], i) => (
    <i
      key={i}
      style={{ '--i': i, '--b': `${b}%`, '--h': `${h}%`, '--wb': `${wb}%`, '--wh': `${wh}%`, '--c': colour(i / (CANDLES.length - 1)) } as CSSProperties}
    />
  ))
const BRAND_BARS = bars(brand)

/** The same candles in the logo's colours, centred in the empty chart while a symbol loads. */
export const BrandLoader = () => <div className="fc-loader">{BRAND_BARS}</div>

/**
 * Faint candles drawn in to the right of the last candle while the forecast is computed, sized like the chart's:
 * one bar spacing apart and as tall as the recent candles. Every frame reads the spacing and the pixels per price
 * and only writes them when they change, so zoom, scroll, autoscale and dragging the price axis all carry it along;
 * the CSS (fc-ghost) only animates opacity and transform. Past the price axis it is cut off.
 */
export default function ForecastLoader({ chart, series, time, price, range, count, right, bottom }: {
  chart: IChartApi
  series: ISeriesApi<SeriesType>
  /** Last candle. */
  time: number
  price: number
  /** Average high-low of the recent candles: the ghosts' size. */
  range: number
  /** Candles the forecast will cover. */
  count: number
  /** Price axis width (plus a side panel) and time axis height: the loader stays inside the plot. */
  right: number
  bottom: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const at = useRef({ time, price, range })
  at.current = { time, price, range }
  const path = useMemo(() => ghostPath(count), [count])

  useEffect(() => {
    let frame = 0
    let shown = ''
    const place = () => {
      frame = requestAnimationFrame(place)
      const el = ref.current
      if (!el) return
      const ts = chart.timeScale()
      const x = ts.timeToCoordinate(at.current.time as Time)
      const y = series.priceToCoordinate(at.current.price)
      const y1 = series.priceToCoordinate(at.current.price + at.current.range)
      const a = ts.logicalToCoordinate(0 as Logical)
      const b = ts.logicalToCoordinate(1 as Logical)
      const ok = x !== null && y !== null && y1 !== null && a !== null && b !== null
      const s = ok ? b - a : 0
      const now = ok ? `${Math.round(x)},${Math.round(y)},${s.toFixed(2)},${(y - y1).toFixed(2)}` : ''
      if (now === shown) return
      shown = now
      el.style.visibility = ok ? '' : 'hidden'
      if (!ok) return
      el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`
      el.style.setProperty('--s', `${s}px`)
      // Bodies as wide as the chart's (about 80 % of the spacing), at least a pixel.
      el.style.setProperty('--bw', `${Math.max(1, Math.round(s * 0.8))}px`)
      el.style.setProperty('--u', `${y - y1}px`)
    }
    place()
    return () => cancelAnimationFrame(frame)
  }, [chart, series])

  return (
    <div className="pointer-events-none absolute left-0 top-0 z-10 overflow-hidden" style={{ right, bottom }} aria-hidden>
      <div ref={ref} className="fc-ghost absolute left-0 top-0" style={{ visibility: 'hidden', '--step': `${Math.min(70, 1400 / count)}ms` } as CSSProperties}>
        {path.map((c, k) => (
          <i
            key={k}
            style={{ '--k': k, '--hi': c.hi, '--lo': c.lo, '--top': c.top, '--body': c.body } as CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}
