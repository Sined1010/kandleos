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
  type AutoscaleInfo,
  type SeriesType,
  type Time,
  type UTCTimestamp
} from 'lightweight-charts'
import { BrainCircuit, Moon, SlidersHorizontal, Sparkles, Sunrise, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { barZone, futureTimes } from '../../../shared/calendar'
import { mergeTick } from '../../../shared/candles'
import { backtest, backtestCutoffs, forecastCandles, Q } from '../../../shared/forecast'
import type { Decision } from '../../../shared/agents'
import { phaseAt } from '../../../shared/market'
import {
  FORECAST_MIN_BARS,
  forecastSteps,
  isCrypto,
  TF_MONTHS,
  TF_SECONDS,
  tfLabel,
  type Candle
} from '../../../shared/types'
import { BandSeries, ShadeSeries } from '../lib/bandSeries'
import { THEME } from '../lib/theme'
import { atr, bollinger, ema, macd, rsi, sma, stochastic, supertrend, vwap } from '../lib/indicators'
import { RANGES, rangeStartIndex, type RangeId } from '../lib/ranges'
import { loadCandles, watchCandles } from '../services/marketData'
import { useQuotes, useStore } from '../store/useStore'
import AgentsPanel from './AgentsPanel'
import AgentsSetup from './AgentsSetup'
import DrawingOverlay from './DrawingOverlay'
import { ForecastCheck, ForecastSettings, ForecastTip, type ForecastResult } from './ForecastInfo'
import MarketBadge, { QuoteChip } from './MarketBadge'

const { up: UP, down: DOWN, line: LINE } = THEME
const FORECAST = '#ffd54f'
// Width of the KI-Analyse panel (w-[400px] in AgentsPanel).
const AGENTS_WIDTH = 400
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
  const extendedHours = useStore((s) => s.extendedHours)
  const toggleExtendedHours = useStore((s) => s.toggleExtendedHours)
  // Pre-market and after-hours candles exist only for intraday stock charts.
  const extendable = !isCrypto(symbol) && TF_SECONDS[timeframe] < 86400
  const extended = extendedHours && extendable
  const quote = useQuotes((s) => s.quotes[symbol])
  const forecastView = useStore((s) => s.forecastView)
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
  // Forecast step under the crosshair, for the value box.
  const [fcHover, setFcHover] = useState<{ x: number; y: number; index: number } | null>(null)
  const [fcMenu, setFcMenu] = useState(false)
  // KI-Analyse (TradingAgents): side panel, its setup dialog and the levels of the analysis shown.
  const [agentsOpen, setAgentsOpen] = useState(false)
  const [agentsSetup, setAgentsSetup] = useState(false)
  const [agentLevels, setAgentLevels] = useState<Decision | null>(null)
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

    loadCandles(symbol, timeframe, finnhubKey, extended)
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
          // With extended hours shown, pre-market and after-hours prices move the chart too.
          const tick = extended && q.ext && q.ext.time >= q.time ? q.ext : q
          push(mergeTick(arr[arr.length - 1], tick.price, tick.time, seconds, months, zone))
        })
    return () => {
      active = false
      stop()
    }
  }, [api, symbol, timeframe, finnhubKey, extended])

  // Grey background behind pre-market and after-hours candles. Rebuilt when bars are added, not on every tick.
  useEffect(() => {
    if (!api || !extended || !data.length) return
    const zone = exchangeZone
    const shade = api.chart.addCustomSeries(
      new ShadeSeries(),
      { priceScaleId: 'session', priceLineVisible: false, lastValueVisible: false, autoscaleInfoProvider: () => null },
      0
    )
    shade.setSeriesOrder(0)
    shade.setData(
      data.flatMap((c) => {
        const phase = phaseAt(symbol, zone, c.time)
        return phase === 'pre' || phase === 'post' ? [{ time: ts(c.time), shade: true as const }] : []
      })
    )
    return () => api.chart.removeSeries(shade)
  },[api, extended, data.length, exchangeZone, symbol])

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
    return () => {
      fcRun.current++
      setFc({ state: 'idle' })
    }
  }, [api, symbol, timeframe])

  const toggleForecast = async () => {
    if (!api) return
    if (fc.state === 'shown') return setFc({ state: 'idle' })
    const bars = dataRef.current
    const run = ++fcRun.current
    setFc({ state: 'loading' })
    const stop = window.api.onForecastProgress((pct) => run === fcRun.current && setFc({ state: 'loading', pct }))
    try {
      const closes = bars.map((c) => c.close)
      const times = bars.map((c) => c.time)
      // Wick lengths above and below each body, for the forecast candles.
      const upper = bars.map((c) => c.high - Math.max(c.open, c.close))
      const lower = bars.map((c) => Math.min(c.open, c.close) - c.low)
      const n = forecastSteps(timeframe, bars.length)
      const cutoffs = backtestCutoffs(bars.length, n)
      // One model call: the close on its own (grouping it with the wicks made it measurably worse in
      // backtests), the two wick series as a group of their own, and the close at each backtest cutoff.
      const [live, liveUpper, liveLower, ...past] = await window.api.forecast(
        [closes, upper, lower, ...cutoffs.map((c) => closes.slice(0, c))],
        [0, 1, 1, ...cutoffs.map((_, k) => 2 + k)]
      )
      if (run !== fcRun.current) return
      const median = (q: number[][]) => q.slice(0, n).map((v) => v[Q.median])
      const last = bars[bars.length - 1]
      const c = cutoffs[0]
      setFc({
        state: 'shown',
        result: {
          times: futureTimes(times, TF_SECONDS[timeframe], n, timezoneRef.current, TF_MONTHS[timeframe]),
          steps: live.slice(0, n),
          upperWicks: median(liveUpper),
          lowerWicks: median(liveLower),
          base: last.close,
          baseTime: last.time,
          check: cutoffs.length ? backtest(closes, cutoffs, past, n) : null,
          // The latest backtest's median over the real bars that followed its cutoff.
          backtestPath:
            c === undefined
              ? null
              : [
                  { time: times[c - 1], value: closes[c - 1] },
                  ...median(past[0]).map((value, i) => ({ time: times[c + i], value }))
                ]
        }
      })
      // Widen the view so the whole forecast is visible; the left edge stays where the user put it.
      const view = api.chart.timeScale().getVisibleLogicalRange()
      if (view && view.to < bars.length + n)
        api.chart.timeScale().setVisibleLogicalRange({ from: view.from, to: bars.length + n + 2 })
    } catch (e) {
      const error = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
      if (run === fcRun.current) setFc({ state: 'error', error })
    } finally {
      stop()
    }
  }

  // Draws a computed forecast the way the forecast settings say; a settings change only redraws.
  useEffect(() => {
    const r = fc.result
    if (!api || !r) return
    const { chart } = api
    const view = forecastView
    // Everything starts at the last close so the projection visibly continues the chart.
    const start = { time: ts(r.baseTime) }
    const series: ISeriesApi<SeriesType>[] = []
    const band = (lo: number, hi: number, fill: string, autoscale = true) => {
      const s = chart.addCustomSeries(
        new BandSeries(),
        { fill, priceLineVisible: false, lastValueVisible: false, ...(!autoscale && { autoscaleInfoProvider: () => null }) },
        0
      )
      s.setData([
        { ...start, lower: r.base, upper: r.base },
        ...r.steps.map((v, i) => ({ time: ts(r.times[i]), lower: v[lo], upper: v[hi] }))
      ])
      series.push(s)
    }
    const line = (points: { time: number; value: number }[], color: string, lineWidth: 1 | 2, lineStyle: LineStyle) => {
      const s = chart.addSeries(
        LineSeries,
        { color, lineWidth, lineStyle, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
        0
      )
      s.setData(points.map((p) => ({ time: ts(p.time), value: p.value })))
      series.push(s)
    }
    // The bands overlap, so the fan gets denser towards the median. The outer 90 % band may run off the
    // chart rather than squeeze the candles.
    if (view.band90) band(Q.p05, Q.p95, 'rgba(255, 213, 79, 0.07)', false)
    if (view.band80) band(Q.p10, Q.p90, 'rgba(255, 213, 79, 0.10)')
    if (view.band50) band(Q.p25, Q.p75, 'rgba(255, 213, 79, 0.16)')
    const medians = r.steps.map((v) => v[Q.median])
    if (view.style === 'candles') {
      // Forecast candles in amber, hollow when rising, so they never pass for real ones.
      const s = chart.addSeries(
        CandlestickSeries,
        {
          upColor: 'rgba(255, 213, 79, 0.08)',
          downColor: 'rgba(255, 213, 79, 0.45)',
          borderUpColor: FORECAST,
          borderDownColor: FORECAST,
          wickUpColor: FORECAST,
          wickDownColor: FORECAST,
          priceLineVisible: false,
          lastValueVisible: false
        },
        0
      )
      s.setData(forecastCandles(r.base, medians, r.upperWicks, r.lowerWicks).map((c, i) => ({ time: ts(r.times[i]), ...c })))
      series.push(s)
    } else {
      const path = [{ time: r.baseTime, value: r.base }, ...medians.map((value, i) => ({ time: r.times[i], value }))]
      line(path, FORECAST, 2, LineStyle.Dashed)
    }
    if (view.backtest && r.backtestPath) line(r.backtestPath, '#b0bec5aa', 1, LineStyle.Dotted)
    return () => series.forEach((s) => chart.removeSeries(s))
  }, [api, fc.result, forecastView])

  // Price target, entry and stop of the KI-Analyse as labelled lines on the price axis.
  useEffect(() => {
    if (!api || !agentLevels) return
    const levels: [number | null, string, string, LineStyle][] = [
      [agentLevels.priceTarget, THEME.brandTo, 'KI-Ziel', LineStyle.Dashed],
      [agentLevels.entry, THEME.drawing, 'Einstieg', LineStyle.Dotted],
      [agentLevels.stopLoss, THEME.down, 'Stop', LineStyle.Dashed]
    ]
    const lines = levels.flatMap(([price, color, title, lineStyle]) =>
      price === null ? [] : [api.candles.createPriceLine({ price, color, title, lineStyle, lineWidth: 1, axisLabelVisible: true })]
    )
    // Keep the levels in view: the price scale also spans them, not only the candles.
    const prices = levels.flatMap(([p]) => (p === null ? [] : [p]))
    api.candles.applyOptions({
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const r = original()
        if (!r?.priceRange) return r
        const { minValue, maxValue } = r.priceRange
        return { ...r, priceRange: { minValue: Math.min(minValue, ...prices), maxValue: Math.max(maxValue, ...prices) } }
      }
    })
    return () => {
      lines.forEach((l) => api.candles.removePriceLine(l))
      api.candles.applyOptions({ autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => original() })
    }
  }, [api, agentLevels])

  // Value box for the forecast step under the crosshair.
  useEffect(() => {
    const result = fc.result
    if (!api || !result || !forecastView.hover) return
    const onMove = (p: MouseEventParams<Time>) => {
      const index = p.time === undefined ? -1 : result.times.indexOf(p.time as number)
      setFcHover(index >= 0 && p.point ? { x: p.point.x, y: p.point.y, index } : null)
    }
    api.chart.subscribeCrosshairMove(onMove)
    return () => {
      api.chart.unsubscribeCrosshairMove(onMove)
      setFcHover(null)
    }
  }, [api, fc.result, forecastView.hover])

  // Declared last on purpose: React runs effect cleanups in declaration order, so the chart is removed after its series.
  useEffect(() => {
    const chart = createChart(containerRef.current!, {
      autoSize: true,
      layout: {
        background: { color: THEME.bg },
        textColor: THEME.text,
        fontSize: 11,
        panes: { separatorColor: LINE, separatorHoverColor: THEME.brandFrom + '55' }
      },
      grid: { vertLines: { color: THEME.grid }, horzLines: { color: THEME.grid } },
      // Crosshair in the icon's indigo, its axis labels filled with it.
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: THEME.brandFrom + '99', labelBackgroundColor: THEME.brandFrom },
        horzLine: { color: THEME.brandFrom + '99', labelBackgroundColor: THEME.brandFrom }
      },
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
        {/* The KI-Analyse panel takes the right edge; the chart narrows so its price axis (with the target line) stays visible. */}
        <div ref={containerRef} className="absolute inset-0 isolate" style={{ right: agentsOpen ? AGENTS_WIDTH : 0 }} />
        {api && <DrawingOverlay chart={api.chart} series={api.candles} data={data} timeZone={exchangeZone} />}
        <div
          className="pointer-events-none absolute left-3 top-2 text-xs text-muted"
          // Wraps before the buttons at the top right (about 290 px wide) instead of running under them.
          style={{ right: (agentsOpen ? AGENTS_WIDTH : 0) + (api?.chart.priceScale('right').width() ?? 60) + 300 }}
        >
          {/* One flex row, centred: the chips differ in content (icons, dots), so baseline alignment would stagger them. */}
          <div className="flex flex-wrap items-center gap-2">
            <span>
              <span className="font-semibold text-white">{symbol}</span> · {tfLabel(timeframe)}
            </span>
            <QuoteChip quote={quote} />
            {currency && (
              <span className="rounded-md bg-line px-1.5 py-0.5 font-medium text-slate-200" title="Währung der Kurse">
                {MINOR_UNITS[currency] ?? currency}
              </span>
            )}
            <MarketBadge symbol={symbol} timeZone={exchangeZone} />
            {fc.state === 'error' && <span className="text-down">{fc.error}</span>}
          </div>
          {fc.result && forecastView.backtest && <ForecastCheck check={fc.result.check} />}
        </div>
        {/* The forecast is the app's headline feature: a large button at the top right, beside the price axis,
            with its display settings right next to it. */}
        <div
          className="absolute top-2 z-30 flex gap-2"
          style={{ right: (agentsOpen ? AGENTS_WIDTH : 0) + (api?.chart.priceScale('right').width() ?? 60) + 12 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setAgentsOpen((o) => !o)}
            aria-pressed={agentsOpen}
            title="KI-Analyse mit TradingAgents: ein Team aus KI-Agenten bewertet Technik, Stimmung, Nachrichten und Fundamentaldaten und gibt Einschätzung, Kursziel und Trade-Plan"
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 backdrop-blur transition ${
              agentsOpen ? 'bg-accent/20 text-white ring-accent' : 'bg-panel/90 text-slate-200 ring-accent/60 hover:bg-line'
            }`}
          >
            <BrainCircuit size={15} className="text-accent" />
            KI-Analyse
          </button>
          <div className="relative flex">
            <button
              onClick={toggleForecast}
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
              className={`inline-flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40 ${
                fc.state === 'shown'
                  ? 'bg-panel/90 text-slate-200 ring-1 ring-accent/60 backdrop-blur hover:bg-line'
                  : 'bg-brand text-white shadow-glow enabled:hover:brightness-110'
              } ${fc.state === 'loading' ? 'animate-pulse disabled:cursor-wait disabled:opacity-90' : 'disabled:cursor-not-allowed'}`}
            >
              {fc.state === 'shown' ? <X size={15} /> : <Sparkles size={15} className="text-amber-200" />}
              {fc.state === 'shown'
                ? 'Prognose aus'
                : fc.state === 'loading'
                  ? fc.pct !== undefined && fc.pct < 100
                    ? `Lade Modell ${fc.pct} %`
                    : 'Rechne …'
                  : 'KI-Prognose'}
            </button>
            <button
              onClick={() => setFcMenu((o) => !o)}
              aria-expanded={fcMenu}
              aria-haspopup="dialog"
              title="Prognose-Anzeige: Linie oder Kerzen, Bereiche, Rückblick"
              aria-label="Prognose-Anzeige einstellen"
              className={`rounded-r-lg border-l border-white/20 px-2 transition ${
                fc.state === 'shown'
                  ? 'bg-panel/90 text-slate-200 ring-1 ring-accent/60 backdrop-blur hover:bg-line'
                  : 'bg-brand text-white shadow-glow hover:brightness-110'
              }`}
            >
              <SlidersHorizontal size={15} />
            </button>
            {fcMenu && <ForecastSettings onClose={() => setFcMenu(false)} />}
          </div>
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
            candles={forecastView.style === 'candles'}
          />
        )}
        {status && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted">{status}</div>
        )}
        <AgentsPanel
          open={agentsOpen}
          setupOpen={agentsSetup}
          symbol={symbol}
          price={quote?.price ?? data[data.length - 1]?.close}
          chronos={
            fc.result ? { value: fc.result.steps[fc.result.steps.length - 1][Q.median], steps: fc.result.steps.length } : null
          }
          onClose={() => setAgentsOpen(false)}
          onSetup={() => setAgentsSetup(true)}
          onLevels={setAgentLevels}
        />
      </div>
      {agentsSetup && <AgentsSetup onClose={() => setAgentsSetup(false)} />}
      <div className="flex h-8 shrink-0 items-center border-t border-line bg-panel px-2">
        <div className="flex gap-0.5" role="group" aria-label="Zeitraum">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              title={`${r.title} (${tfLabel(r.tf)}-Kerzen)`}
              aria-pressed={range === r.id}
              className={`rounded-md px-2 py-0.5 text-xs ${range === r.id ? 'bg-brand text-white shadow-glow' : 'text-muted hover:bg-line hover:text-white'}`}
            >
              {r.id}
            </button>
          ))}
        </div>
        <button
          onClick={toggleExtendedHours}
          disabled={!extendable}
          aria-pressed={extendedHours}
          title={
            extendable
              ? 'Vorbörse und Nachbörse (US-Aktien, 10:00–15:30 und 22:00–02:00 deutscher Zeit) als Kerzen zeigen, grau hinterlegt'
              : 'Vor-/Nachbörse gibt es nur bei Aktien und Kerzen unter einem Tag'
          }
          className={`ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-xs disabled:opacity-40 ${
            extended ? 'bg-brand text-white shadow-glow' : 'text-muted enabled:hover:bg-line enabled:hover:text-white'
          }`}
        >
          <Sunrise size={12} />
          <Moon size={11} />
          Vor-/Nachbörse
        </button>
      </div>
    </div>
  )
}
