import type { CSSProperties } from 'react'
import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { THEME } from '../lib/theme'

// Candles after "Candle Loader" by Bilal Bostan (uiverse.io/bilal_9731/new-moose-50, MIT): body bottom and height,
// wick bottom and height, in % of the candle. They rise to the right, where the forecast will appear.
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
// Built once: React reuses the same elements on every render. Without --c the candles are amber (index.css).
const bars = (colour?: (k: number) => string) =>
  CANDLES.map(([b, h, wb, wh], i) => (
    <i
      key={i}
      style={{ '--i': i, '--b': `${b}%`, '--h': `${h}%`, '--wb': `${wb}%`, '--wh': `${wh}%`, '--c': colour?.(i / (CANDLES.length - 1)) } as CSSProperties}
    />
  ))
const BARS = bars()
const BRAND_BARS = bars(brand)

/** The same candles in the logo's colours, centred in the empty chart while a symbol loads. */
export const BrandLoader = () => <div className="fc-loader">{BRAND_BARS}</div>
// The loader is 64 px high, its candles 110 % of that; the first body's middle (about 17 % up) sits on the price.
const HEIGHT = 64
const LIFT = HEIGHT * 1.1 * 0.17
const GAP = 8
// 18 candles of 5 px with 3 px between them (index.css).
const WIDTH = CANDLES.length * 8 - 3

/**
 * Candles fading in to the right of the last candle while the forecast is computed. Moved by writing its
 * transform directly (no React render), at most once a frame and only when the chart moves or the price changes.
 */
export default function ForecastLoader({ chart, series, time, price, right, bottom }: {
  chart: IChartApi
  series: ISeriesApi<SeriesType>
  /** Last candle. */
  time: number
  price: number
  /** Price axis width (plus a side panel) and time axis height: the loader stays inside the plot. */
  right: number
  bottom: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const at = useRef({ time, price })
  at.current = { time, price }
  const schedule = useRef(() => {})

  useEffect(() => {
    let frame = 0
    let shown = ''
    const place = () => {
      frame = 0
      const el = ref.current
      if (!el) return
      const x = chart.timeScale().timeToCoordinate(at.current.time as Time)
      const y = series.priceToCoordinate(at.current.price)
      const width = chart.timeScale().width()
      // Pulled left when the space right of the last candle is narrower than the loader; hidden once the candle
      // has scrolled out to the right, so it does not float over older candles.
      const pos =
        x !== null && y !== null && x <= width
          ? `translate(${Math.round(Math.min(x + GAP, width - WIDTH))}px,${Math.round(y + LIFT - HEIGHT)}px)`
          : ''
      if (pos === shown) return
      shown = pos
      el.style.visibility = pos ? '' : 'hidden'
      if (pos) el.style.transform = pos
    }
    // After the chart has applied the change (autoscale included), and only once per frame.
    schedule.current = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }
    place()
    // shortcut: dragging the price axis alone fires no event, so the loader keeps its height until the next
    // scroll, zoom or tick; fine for a few seconds of loading.
    const ts = chart.timeScale()
    const onChange = () => schedule.current()
    ts.subscribeVisibleLogicalRangeChange(onChange)
    ts.subscribeSizeChange(onChange)
    return () => {
      cancelAnimationFrame(frame)
      ts.unsubscribeVisibleLogicalRangeChange(onChange)
      ts.unsubscribeSizeChange(onChange)
    }
  }, [chart, series])
  useEffect(() => schedule.current(), [time, price])

  return (
    <div className="pointer-events-none absolute left-0 top-0 z-10 overflow-hidden" style={{ right, bottom }} aria-hidden>
      <div ref={ref} className="fc-loader absolute left-0 top-0" style={{ visibility: 'hidden' }}>
        {BARS}
      </div>
    </div>
  )
}
