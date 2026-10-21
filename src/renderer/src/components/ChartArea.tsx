import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  TickMarkType,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp
} from 'lightweight-charts'
import { Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { barZone, futureTimes } from '../../../shared/calendar'
import { mergeTick } from '../../../shared/candles'
import { backtest, backtestCutoffs, Q } from '../../../shared/forecast'
import {
  FORECAST_MIN_BARS,
  forecastSteps,
  isCrypto,
  TF_MONTHS,
  TF_SECONDS,
  tfLabel,
  type Candle
} from '../../../shared/types'
import { BandSeries } from '../lib/bandSeries'
import { atr, bollinger, ema, macd, rsi, sma, stochastic, supertrend, vwap } from '../lib/indicators'
import { RANGES, rangeStartIndex, type RangeId } from '../lib/ranges'
import { loadCandles, watchCandles } from '../services/marketData'
import { useQuotes, useStore } from '../store/useStore'
import DrawingOverlay from './DrawingOverlay'
import { ForecastCheck, ForecastTip, type ForecastResult } from './ForecastInfo'
import MarketBadge from './MarketBadge'

const UP = '#26a69a'
const DOWN = '#ef5350'
const LINE = '#232838'
// Some exchanges quote in a minor unit (London: pence), which is easy to misread as the main currency.
const MINOR_UNITS: Record<string, string> = { GBp: 'GBp (Pence)', ZAc: 'ZAc (Cent)', ILA: 'ILA (Agorot)' }

interface ChartApi {
  chart: IChartApi
  candles: ISeriesApi<'Candlestick'>
  volume: ISeriesApi<'Histogram'>
}
interface IndicatorSeries {
  series: ISeriesApi<SeriesType>
  calc: (closes: number[], data: Candle[]) => number[]
  color?: (v: number, i: number) => string
}

const ts = (s: number) => s as UTCTimestamp
const toBar = (c: Candle) => ({ time: ts(c.time), open: c.open, high: c.high, low: c.low, close: c.close })
const toVol = (c: Candle) => ({ time: ts(c.time), value: c.volume, color: (c.close >= c.open ? UP : DOWN) + '55' })
const fmtTime = (time: Time, opts: Intl.DateTimeFormatOptions) =>
  new Date((time as number) * 1000).toLocaleString('de-DE', opts)

function tickMark(time: Time, type: TickMarkType): string {
  if (type === TickMarkType.Year) return fmtTime(time, { year: 'numeric' })
  if (type === TickMarkType.Month) return fmtTime(time, { month: 'short' })
  if (type === TickMarkType.DayOfMonth) return fmtTime(time, { day: '2-digit', month: '2-digit' })
  return fmtTime(time, { hour: '2-digit', minute: '2-digit' })
}

export default function ChartArea() {
  const symbol = useStore((s) => s.symbol)
  const timeframe = useStore((s) => s.timeframe)
  const finnhubKey = useStore((s) => s.finnhubKey)
  const indicators = useStore((s) => s.indicators)
  const select = useStore((s) => s.select)
  const range = useStore((s) => s.range)
  const setRange = useStore((s) => s.setRange)
  const containerRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef<Candle[]>([])
  const [api, setApi] = useState<ChartApi | null>(null)
  const [data, setData] = useState<Candle[]>([])
  const [indicatorSeries, setIndicatorSeries] = useState<IndicatorSeries[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [currency, setCurrency] = useState('')
  // Exchange time zone of the loaded symbol; the forecast's time axis follows that exchange's calendar.
  const timezoneRef = useRef<string | undefined>(undefined)
  const [exchangeZone, setExchangeZone] = useState<string | undefined>()
  const [fc, setFc] = useState<{
    state: 'idle' | 'loading' | 'shown' | 'error'
    pct?: number
    error?: string
    result?: ForecastResult
  }>({ state: 'idle' })
  const fcSeries = useRef<ISeriesApi<SeriesType>[]>([])
  // Forecast step under the crosshair, for the value box.
  const [fcHover, setFcHover] = useState<{ x: number; y: number; index: number } | null>(null)
  // Bumped whenever a forecast becomes stale, so a late result is dropped instead of drawn on the wrong chart.
  const fcRun = useRef(0)

  /** Scrolls to the preset's span, or to the last 150 bars when no preset is active. */
  const showRange = (bars: Candle[], id: RangeId | null) => {
    if (!api || !bars.length) return
    const from = id ? rangeStartIndex(bars.map((c) => c.time), id) : Math.max(0, bars.length - 150)
    // Free space right of the last bar; a few yearly bars would otherwise leave half the chart empty.
    const margin = id ? 3 : Math.min(10, Math.max(2, Math.round(bars.length / 10)))
    api.chart.timeScale().setVisibleLogicalRange({ from, to: bars.length + margin })
  }

  // History + live updates for the current symbol/timeframe.
  useEffect(() => {
    if (!api) return
    let active = true
    const seconds = TF_SECONDS[timeframe]
    const months = TF_MONTHS[timeframe]
    const intraday = seconds < 86400
    api.chart.applyOptions({
      timeScale: { timeVisible: intraday },
      localization: {
        timeFormatter: (t: Time) =>
          fmtTime(t, intraday ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
      }
    })
    dataRef.current = []
    setData([])
    api.candles.setData([])
    api.volume.setData([])
    setStatus(`Lade ${symbol} …`)
    setCurrency('')
    setExchangeZone(undefined)

    const push = (bar: Candle) => {
      const arr = dataRef.current
      if (!active || !arr.length || bar.time < arr[arr.length - 1].time) return
      if (bar.time === arr[arr.length - 1].time) arr[arr.length - 1] = bar
      else arr.push(bar)
      api.candles.update(toBar(bar))
      api.volume.update(toVol(bar))
      setData([...arr])
    }

    loadCandles(symbol, timeframe, finnhubKey)
      .then(({ candles: bars, currency, timezone }) => {
        if (!active) return
        if (!bars.length) return setStatus(`Keine Daten für ${symbol}`)
        const last = bars[bars.length - 1].close
        const precision = last < 1 ? 6 : last < 10 ? 4 : 2
        api.candles.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } })
        api.candles.setData(bars.map(toBar))
        api.volume.setData(bars.map(toVol))
        showRange(bars, useStore.getState().range)
        dataRef.current = bars
        setData([...bars])
        setCurrency(currency)
        timezoneRef.current = timezone
        setExchangeZone(timezone)
        setStatus(null)
      })
      .catch((e: Error) => active && setStatus(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))

    const stop = isCrypto(symbol)
      ? watchCandles(symbol, timeframe, push)
      : useQuotes.subscribe((s, prev) => {
          const q = s.quotes[symbol]
          const arr = dataRef.current
          if (!q || q === prev.quotes[symbol] || !arr.length) return
          // Month-based bars end at calendar month edges, read in the zone the source dates its bars in.
          const zone = months ? barZone(arr.map((c) => c.time), timezoneRef.current) : undefined
          push(mergeTick(arr[arr.length - 1], q.price, q.time, seconds, months, zone))
        })
    return () => {
      active = false
      stop()
    }
  }, [api, symbol, timeframe, finnhubKey])

  // A preset with the already loaded candle size only needs a scroll; otherwise the load above applies it.
  // Declared after the load effect, which empties dataRef first when the candle size changes.
  useEffect(() => {
    if (range) showRange(dataRef.current, range)
  }, [api, range])

  // (Re)build indicator series; oscillators get their own panes, which share the main time scale.
  useEffect(() => {
    if (!api) return
    const { chart } = api
    const list: IndicatorSeries[] = []
    const line = (color: string, calc: IndicatorSeries['calc'], pane = 0) => {
      const series = chart.addSeries(
        LineSeries,
        { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
        pane
      )
      list.push({ series, calc })
      return series
    }
    const guides = (series: ISeriesApi<SeriesType>, levels: number[]) => {
      series.applyOptions({ lastValueVisible: true })
      for (const price of levels)
        series.createPriceLine({ price, color: '#5d6375', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false })
    }
    const { sma: s, ema: e, ema3, bb, vwap: vw, supertrend: st, rsi: r, macd: m, stoch, atr: at } = indicators
    if (s.on) line('#f5c542', (c) => sma(c, s.period))
    if (e.on) line('#42a5f5', (c) => ema(c, e.period))
    if (ema3.on) {
      line('#26c6da', (c) => ema(c, ema3.fast))
      line('#ffa726', (c) => ema(c, ema3.mid))
      line('#ec407a', (c) => ema(c, ema3.slow))
    }
    if (bb.on) {
      line('#9c6ade', (c) => bollinger(c, bb.period, bb.mult).upper)
      line('#9c6ade88', (c) => bollinger(c, bb.period, bb.mult).mid)
      line('#9c6ade', (c) => bollinger(c, bb.period, bb.mult).lower)
    }
    if (vw.on) line('#e0e0e0', (_, d) => vwap(d)).applyOptions({ lineStyle: LineStyle.Dashed })
    if (st.on) {
      // Line series bridge gaps, so one line is coloured per point. A segment takes the colour of its start
      // point, so the last point before a trend flip is transparent to hide the jump to the other side.
      let r = supertrend([], st.period, st.mult)
      const series = chart.addSeries(
        LineSeries,
        { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
        0
      )
      list.push({
        series,
        calc: (_, d) => (r = supertrend(d, st.period, st.mult)).value,
        color: (_, i) =>
          i + 1 < r.rising.length && r.rising[i + 1] !== r.rising[i] ? 'transparent' : r.rising[i] ? UP : DOWN
      })
    }
    let pane = 1
    if (r.on) guides(line('#b388ff', (c) => rsi(c, r.period), pane++), [70, 30])
    if (m.on) {
      const calc = (c: number[]) => macd(c, m.fast, m.slow, m.signal)
      const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane)
      list.push({ series: hist, calc: (c) => calc(c).hist, color: (v) => (v >= 0 ? UP : DOWN) + '99' })
      line('#42a5f5', (c) => calc(c).line, pane)
      line('#ff9800', (c) => calc(c).signal, pane++)
    }
    if (stoch.on) {
      const calc = (d: Candle[]) => stochastic(d, stoch.period, stoch.smoothK, stoch.smoothD)
      guides(line('#42a5f5', (_, d) => calc(d).k, pane), [80, 20])
      line('#ff9800', (_, d) => calc(d).d, pane++)
    }
    if (at.on) line('#b0bec5', (_, d) => atr(d, at.period), pane++).applyOptions({ lastValueVisible: true })
    chart.panes().forEach((p, i) => i > 0 && p.setStretchFactor(0.3))
    setIndicatorSeries(list)
    return () => {
      list.forEach((i) => chart.removeSeries(i.series))
      while (chart.panes().length > 1) chart.removePane(chart.panes().length - 1)
    }
  }, [api, indicators])

  useEffect(() => {
    const closes = data.map((c) => c.close)
    for (const { series, calc, color } of indicatorSeries) {
      const v = calc(closes, data)
      series.setData(
        data.flatMap((c, i) =>
          Number.isNaN(v[i]) ? [] : [{ time: ts(c.time), value: v[i], ...(color && { color: color(v[i], i) }) }]
        )
      )
    }
  }, [data, indicatorSeries])

  // A forecast belongs to one symbol and timeframe; drop it when either changes.
  useEffect(() => {
    if (!api) return
    return () => {
      fcRun.current++
      fcSeries.current.forEach((s) => api.chart.removeSeries(s))
      fcSeries.current = []
      setFc({ state: 'idle' })
    }
  }, [api, symbol, timeframe])

  const toggleForecast = async () => {
    if (!api) return
    if (fc.state === 'shown') {
      fcSeries.current.forEach((s) => api.chart.removeSeries(s))
      fcSeries.current = []
      return setFc({ state: 'idle' })
    }
    const bars = dataRef.current
    const run = ++fcRun.current
    setFc({ state: 'loading' })
    const stop = window.api.onForecastProgress((pct) => run === fcRun.current && setFc({ state: 'loading', pct }))
    try {
      const closes = bars.map((c) => c.close)
      const times = bars.map((c) => c.time)
      const n = forecastSteps(timeframe, bars.length)
      // Backtests run in the same model call: forecasts from earlier cutoffs, compared with what followed.
      const cutoffs = backtestCutoffs(bars.length, n)
      const [live, ...past] = await window.api.forecast([closes, ...cutoffs.map((c) => closes.slice(0, c))])
      if (run !== fcRun.current) return
      const steps = live.slice(0, n)
      const last = bars[bars.length - 1]
      const future = futureTimes(times, TF_SECONDS[timeframe], n, timezoneRef.current, TF_MONTHS[timeframe])
      // Everything starts at the last close so the projection visibly continues the chart.
      const start = { time: ts(last.time) }
      const band = (lo: number, hi: number, fill: string, autoscale = true) => {
        const s = api.chart.addCustomSeries(
          new BandSeries(),
          { fill, priceLineVisible: false, lastValueVisible: false, ...(!autoscale && { autoscaleInfoProvider: () => null }) },
          0
        )
        s.setData([
          { ...start, lower: last.close, upper: last.close },
          ...steps.map((v, i) => ({ time: ts(future[i]), lower: v[lo], upper: v[hi] }))
        ])
        return s
      }
      const line = (points: { time: Time; value: number }[], color: string, lineWidth: 1 | 2, lineStyle: LineStyle) => {
        const s = api.chart.addSeries(
          LineSeries,
          { color, lineWidth, lineStyle, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
          0
        )
        s.setData(points)
        return s
      }
      // The bands overlap, so the fan gets denser towards the median. The outer 90 % band may run off the
      // chart rather than squeeze the candles.
      const series: ISeriesApi<SeriesType>[] = [
        band(Q.p05, Q.p95, 'rgba(255, 213, 79, 0.07)', false),
        band(Q.p10, Q.p90, 'rgba(255, 213, 79, 0.10)'),
        band(Q.p25, Q.p75, 'rgba(255, 213, 79, 0.16)'),
        line(
          [{ ...start, value: last.close }, ...steps.map((v, i) => ({ time: ts(future[i]), value: v[Q.median] }))],
          '#ffd54f',
          2,
          LineStyle.Dashed
        )
      ]
      // The latest backtest's median over the real bars that followed it.
      if (cutoffs.length) {
        const c = cutoffs[0]
        series.push(
          line(
            [
              { time: ts(times[c - 1]), value: closes[c - 1] },
              ...past[0].slice(0, n).map((v, i) => ({ time: ts(times[c + i]), value: v[Q.median] }))
            ],
            '#b0bec5aa',
            1,
            LineStyle.Dotted
          )
        )
      }
      fcSeries.current = series
      // Widen the view so the whole fan is visible; the left edge stays where the user put it.
      const view = api.chart.timeScale().getVisibleLogicalRange()
      if (view && view.to < bars.length + n)
        api.chart.timeScale().setVisibleLogicalRange({ from: view.from, to: bars.length + n + 2 })
      const check =cutoffs.length ? backtest(closes, cutoffs, past, n) : null
      setFc({ state: 'shown', result: { times: future, steps, base: last.close, check } })
    } catch (e) {
      const error = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
      if (run === fcRun.current) setFc({ state: 'error', error })
    } finally {
      stop()
    }
  }

  // Value box for the forecast step under the crosshair.
  useEffect(() => {
    const result = fc.result
    if (!api || !result) return
    const onMove = (p: MouseEventParams<Time>) => {
      const index = p.time === undefined ? -1 : result.times.indexOf(p.time as number)
      setFcHover(index >= 0 && p.point ? { x: p.point.x, y: p.point.y, index } : null)
    }
    api.chart.subscribeCrosshairMove(onMove)
    return () => {
      api.chart.unsubscribeCrosshairMove(onMove)
      setFcHover(null)
    }
  }, [api, fc.result])

  // Declared last on purpose: React runs effect cleanups in declaration order, so the chart is removed after its series.
  useEffect(() => {
    const chart = createChart(containerRef.current!, {
      autoSize: true,
      layout: {
        background: { color: '#0b0e14' },
        textColor: '#8b93a7',
        fontSize: 11,
        panes: { separatorColor: LINE, separatorHoverColor: '#2962ff55' }
      },
      grid: { vertLines: { color: '#161b26' }, horzLines: { color: '#161b26' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: LINE },
      timeScale: { borderColor: LINE, rightOffset: 10, tickMarkFormatter: tickMark },
      localization: { locale: 'de-DE' }
    })
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false
    })
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.25 } })
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false
    })
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
    setApi({ chart, candles, volume })
    return () => chart.remove()
  }, [])

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative min-h-0 flex-1" onMouseDown={() => select(null)}>
        {/* isolate: keeps the chart canvases' z-indexes from stacking above the drawing overlay */}
        <div ref={containerRef} className="absolute inset-0 isolate" />
        {api && <DrawingOverlay chart={api.chart} series={api.candles} data={data} />}
        <div className="pointer-events-none absolute left-3 top-2 text-xs text-muted">
          <span className="font-semibold text-white">{symbol}</span> · {tfLabel(timeframe)}
          {currency && (
            <span className="ml-2 rounded bg-line px-1.5 py-0.5 font-medium text-slate-200" title="Währung der Kurse">
              {MINOR_UNITS[currency] ?? currency}
            </span>
          )}
          <MarketBadge symbol={symbol} timeZone={exchangeZone} />
          <button
            onClick={toggleForecast}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={fc.state === 'loading' || data.length < FORECAST_MIN_BARS}
            title={
              data.length && data.length < FORECAST_MIN_BARS
                ? `Zu wenige Kerzen für eine Prognose: ${data.length} von mindestens ${FORECAST_MIN_BARS}. ` +
                  'Eine kürzere Kerzengröße wählen.'
                : `Statistische Prognose der nächsten ${forecastSteps(timeframe, data.length)} Kerzen mit Chronos-2, ` +
                  'lokal berechnet: Median (gestrichelt) mit Fächer aus 50/80/90 %-Bereichen, Werte beim Überfahren, ' +
                  'dazu ein Rückblick auf die Treffsicherheit. Keine Anlageberatung.' +
                  (fc.state === 'idle' ? ' Beim ersten Mal wird das Modell geladen (ca. 480 MB).' : '')
            }
            className={`pointer-events-auto ml-2 inline-flex items-center gap-1 rounded bg-line px-1.5 py-0.5 font-medium text-slate-200 hover:bg-accent/30 disabled:opacity-70 ${fc.state === 'loading' ? 'disabled:cursor-wait' : 'disabled:cursor-not-allowed'}`}
          >
            <Sparkles size={12} className="text-[#ffd54f]" />
            {fc.state === 'shown'
              ? 'Prognose aus'
              : fc.state === 'loading'
                ? fc.pct !== undefined && fc.pct < 100
                  ? `Lade Modell ${fc.pct} %`
                  : 'Rechne …'
                : 'Prognose'}
          </button>
          {fc.state === 'error' && <span className="ml-2 text-down">{fc.error}</span>}
          {fc.result && <ForecastCheck check={fc.result.check} />}
        </div>
        {fc.result && fcHover && (
          <ForecastTip
            result={fc.result}
            index={fcHover.index}
            x={fcHover.x}
            y={fcHover.y}
            width={containerRef.current?.clientWidth ?? 0}
            height={containerRef.current?.clientHeight ?? 0}
            intraday={TF_SECONDS[timeframe] < 86400}
          />
        )}
        {status && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted">{status}</div>
        )}
      </div>
      <div className="flex h-8 shrink-0 items-center gap-0.5 border-t border-line bg-panel px-2" role="group" aria-label="Zeitraum">
        {RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            title={`${r.title} (${tfLabel(r.tf)}-Kerzen)`}
            aria-pressed={range === r.id}
            className={`rounded px-2 py-0.5 text-xs ${range === r.id ? 'bg-accent text-white' : 'text-muted hover:bg-line hover:text-white'}`}
          >
            {r.id}
          </button>
        ))}
      </div>
    </div>
  )
}
