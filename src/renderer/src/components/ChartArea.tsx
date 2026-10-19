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
  type SeriesType,
  type Time,
  type UTCTimestamp
} from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { mergeTick } from '../../../shared/candles'
import { isCrypto, TF_SECONDS, type Candle } from '../../../shared/types'
import { atr, bollinger, ema, macd, rsi, sma, stochastic, supertrend, vwap } from '../lib/indicators'
import { loadCandles, watchCandles } from '../services/marketData'
import { useQuotes, useStore } from '../store/useStore'
import DrawingOverlay from './DrawingOverlay'

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
  const containerRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef<Candle[]>([])
  const [api, setApi] = useState<ChartApi | null>(null)
  const [data, setData] = useState<Candle[]>([])
  const [indicatorSeries, setIndicatorSeries] = useState<IndicatorSeries[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [currency, setCurrency] = useState('')

  // History + live updates for the current symbol/timeframe.
  useEffect(() => {
    if (!api) return
    let active = true
    const seconds = TF_SECONDS[timeframe]
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
      .then(({ candles: bars, currency }) => {
        if (!active) return
        if (!bars.length) return setStatus(`Keine Daten für ${symbol}`)
        const last = bars[bars.length - 1].close
        const precision = last < 1 ? 6 : last < 10 ? 4 : 2
        api.candles.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } })
        api.candles.setData(bars.map(toBar))
        api.volume.setData(bars.map(toVol))
        api.chart.timeScale().setVisibleLogicalRange({ from: bars.length - 150, to: bars.length + 10 })
        dataRef.current = bars
        setData([...bars])
        setCurrency(currency)
        setStatus(null)
      })
      .catch((e: Error) => active && setStatus(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))

    const stop = isCrypto(symbol)
      ? watchCandles(symbol, timeframe, push)
      : useQuotes.subscribe((s, prev) => {
          const q = s.quotes[symbol]
          const arr = dataRef.current
          if (q && q !== prev.quotes[symbol] && arr.length) push(mergeTick(arr[arr.length - 1], q.price, q.time, seconds))
        })
    return () => {
      active = false
      stop()
    }
  }, [api, symbol, timeframe, finnhubKey])

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
    <div className="absolute inset-0" onMouseDown={() => select(null)}>
      {/* isolate: keeps the chart canvases' z-indexes from stacking above the drawing overlay */}
      <div ref={containerRef} className="absolute inset-0 isolate" />
      {api && <DrawingOverlay chart={api.chart} series={api.candles} data={data} />}
      <div className="pointer-events-none absolute left-3 top-2 text-xs text-muted">
        <span className="font-semibold text-white">{symbol}</span> · {timeframe}
        {currency && (
          <span className="ml-2 rounded bg-line px-1.5 py-0.5 font-medium text-slate-200" title="Währung der Kurse">
            {MINOR_UNITS[currency] ?? currency}
          </span>
        )}
      </div>
      {status && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted">{status}</div>
      )}
    </div>
  )
}
