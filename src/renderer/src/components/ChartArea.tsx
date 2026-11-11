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
import { Moon, SlidersHorizontal, Sparkles, Sunrise, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { barZone, futureTimes } from '../../../shared/calendar'
import { mergeTick } from '../../../shared/candles'
import { HISTORY_LIMIT, mayLoadOlder, OLDER_RETRY_MS, prependOlder } from '../../../shared/history'
import { backtest, bandScale, checkCutoffs, forecastCandles, historyNeeded, Q, scaleBands, type BacktestResult } from '../../../shared/forecast'
import type { Decision } from '../../../shared/agents'
import { locale, msg, t } from '../../../shared/i18n'
import { phaseAt } from '../../../shared/market'
import {
  FORECAST_MIN_BARS,
  forecastSteps,
  isCrypto,
  TF_MONTHS,
  TF_SECONDS,
  tfLabel,
  type Candle,
  type CandleData,
  type CandleProvider
} from '../../../shared/types'
import { BandSeries, ShadeSeries } from '../lib/bandSeries'
import { ipcError } from '../lib/format'
import { THEME } from '../lib/theme'
import { atr, bollinger, ema, macd, rsi, sma, stochastic, supertrend, vwap } from '../lib/indicators'
import { RANGES, rangeStartIndex, type RangeId } from '../lib/ranges'
import { sessionLine } from '../lib/sessionLine'
import { cachedCandles, loadCandles, watchCandles } from '../services/marketData'
import { IS_MOBILE } from '../lib/platform'
import { usePcStatus } from '../lib/pcStatus'
import { ask, tell } from '../../../mobile/MessageBox'
import MobileKiButton from '../../../mobile/MobileKiButton'
import PriceTags, { type Tag } from '../../../mobile/PriceTag'
import { useBack } from '../../../mobile/useBack'
import { metaFor, useChartMeta } from '../store/chartMeta'
import { useQuotes, useStore } from '../store/useStore'
import AgentsPanel from './AgentsPanel'
import ForecastQuality from './ForecastQuality'
import { archiveForecast, settleDue, type ArchiveContext } from '../services/archive'
import AgentsSetup from './AgentsSetup'
import DrawingOverlay from './DrawingOverlay'
import EventLayer from './EventLayer'
import EventsButton from './EventsButton'
import { loadEvents, useEventsData } from '../services/events'
import ForecastLoader, { BrandLoader } from './ForecastLoader'
import FullscreenButton from './FullscreenButton'
import { ForecastSettings, ForecastSummary, ForecastTip, type ForecastResult } from './ForecastInfo'
import IndicatorLegend, { type LegendGroup } from './IndicatorLegend'
import MarketBadge, { QuoteChip } from './MarketBadge'

const { up: UP, down: DOWN, line: LINE } = THEME
const SESSION_TITLE = { pre: msg('Vorbörse'), post: msg('Nachbörse'), close: msg('Schluss') }
// Line and tag colours: orange (sunrise) before, indigo (moon) after the session, grey for the regular close.
const SESSION_TAG = { pre: { color: '#fb923c', ink: '#0a0c16' }, post: { color: '#a5b4fc', ink: '#0a0c16' }, close: { color: '#5d6375', ink: '#fff' } }
const FORECAST = '#ffd54f'
const ALARM = '#a78bfa'
// Bars left of the view at which the section before the oldest bar is loaded.
const OLDER_MARGIN = 50
const OLDER_HINT = {
  loading: msg('Lade ältere Kerzen …'),
  end: msg('Keine älteren Daten'),
  limit: msg('Grenze von 10.000 Kerzen erreicht'),
  error: msg('Ältere Kerzen konnten nicht geladen werden')
}
// Width of the analysis panel (w-[400px] in AgentsPanel).
const AGENTS_WIDTH = 400
const PC_NONE = msg('Die KI-Prognose rechnet KandleOS auf deinem PC. Dafür das Handy einmal mit dem PC koppeln. Jetzt koppeln?')
const PC_OFF = msg('PC nicht erreichbar. Die KI-Prognose rechnet dein PC – ist er an und im selben WLAN oder VPN?')
// Some exchanges quote in a minor unit (London: pence), which is easy to misread as the main currency.
export const MINOR_UNITS: Record<string, string> = { GBp: 'GBp (Pence)', ZAc: 'ZAc (Cent)', ILA: 'ILA (Agorot)' }

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
/** `timeZone`: for day and longer bars the zone they are dated in; intraday times show in the local zone. */
const fmtTime = (time: Time, opts: Intl.DateTimeFormatOptions, timeZone?: string) =>
  new Date((time as number) * 1000).toLocaleString(locale(), { ...opts, timeZone })

function tickMark(time: Time, type: TickMarkType, timeZone?: string): string {
  if (type === TickMarkType.Year) return fmtTime(time, { year: 'numeric' }, timeZone)
  if (type === TickMarkType.Month) return fmtTime(time, { month: 'short' }, timeZone)
  if (type === TickMarkType.DayOfMonth) return fmtTime(time, { day: '2-digit', month: '2-digit' }, timeZone)
  return fmtTime(time, { hour: '2-digit', minute: '2-digit' }, timeZone)
}

/** Price target, entry and stop of a TradingAgents analysis: price, colour, title, line style. */
function agentLevelList(d: Decision | null): [number | null, string, string, LineStyle][] {
  if (!d) return []
  return [
    [d.priceTarget, THEME.brandTo, t('KI-Ziel'), LineStyle.Dashed],
    [d.entry, THEME.drawing, t('Einstieg'), LineStyle.Dotted],
    [d.stopLoss, THEME.down, t('Stop'), LineStyle.Dashed]
  ]
}

/** `full`: the phone's full screen, whose buttons and legend sit over the top of the chart. */
export default function ChartArea({ full = false }: { full?: boolean }) {
  const symbol = useStore((s) => s.symbol)
  const timeframe = useStore((s) => s.timeframe)
  const finnhubKey = useStore((s) => s.finnhubKey)
  const eventsOn = useStore((s) => s.eventsOn)
  const stockSource = useStore((s) => s.stockSource)
  const yahooExtra = useStore((s) => s.yahooExtra)
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
  const forecastRun = useStore((s) => s.forecastRun)
  const maxSteps = forecastRun.horizon === 'auto' ? 64 : forecastRun.horizon
  const containerRef = useRef<HTMLDivElement>(null)
  const legendRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef<Candle[]>([])
  const [api, setApi] = useState<ChartApi | null>(null)
  const [data, setData] = useState<Candle[]>([])
  const [indicatorSeries, setIndicatorSeries] = useState<IndicatorSeries[]>([])
  const [legend, setLegend] = useState<LegendGroup[]>([])
  const [valueTags, setValueTags] = useState<Tag[]>([])
  const [status, setStatus] = useState<string | null>(null)
  // Currency and exchange time zone of the loaded candles; the phone's header reads them too. The forecast's time
  // axis follows that exchange's calendar.
  const { currency, timeZone: exchangeZone } = metaFor(useChartMeta(), symbol)
  const timezoneRef = useRef<string | undefined>(undefined)
  const [fc, setFc] = useState<{
    state: 'idle' | 'loading' | 'shown' | 'error'
    pct?: number
    error?: string
    result?: ForecastResult
  }>({ state: 'idle' })
  // Forecast step under the crosshair, for the value box.
  const [fcHover, setFcHover] = useState<{ x: number; y: number; index: number } | null>(null)
  const [fcMenu, setFcMenu] = useState(false)
  // Comprehensive analysis with TradingAgents (opened from the KI-Prognose menu): side panel, its setup
  // dialog and the levels of the analysis shown.
  const [agentsOpen, setAgentsOpen] = useState(false)
  // "Prognose-Qualität" panel (from the forecast card); it takes the same right edge as the analysis panel.
  const [qualityOpen, setQualityOpen] = useState(false)
  // On the phone the panels cover the screen; nothing beside them moves aside.
  const sideOpen = !IS_MOBILE && (agentsOpen || qualityOpen)
  useBack('forecast-menu', fcMenu, () => setFcMenu(false))
  useBack('agents', agentsOpen, () => setAgentsOpen(false))
  useBack('quality', qualityOpen, () => setQualityOpen(false))
  const pcOff = usePcStatus((s) => IS_MOBILE && s.state !== 'online')
  // The phone header's cell for the forecast button; the header is drawn before the chart.
  const [kiSlot, setKiSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (IS_MOBILE) setKiSlot(document.getElementById('mobile-ki'))
  }, [])
  const [agentsSetup, setAgentsSetup] = useState(false)
  const [agentLevels, setAgentLevels] = useState<Decision | null>(null)
  // Bumped whenever a forecast becomes stale, so a late result is dropped instead of drawn on the wrong chart.
  const fcRun = useRef(0)
  // Older history loaded on scrolling left: one section at a time, from the source of the first load.
  // `gen` changes with symbol, candle size or source, so a late section is dropped instead of prepended;
  // `ready` waits for the first load's view, since the previous chart's scrolled-left view applies until then.
  const older = useRef({ gen: 0, ready: false, busy: false, done: false, retryAt: 0, provider: undefined as CandleProvider | undefined })
  const [olderHint, setOlderHint] = useState<'loading' | 'end' | 'limit' | 'error' | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  /** Shows a hint at the left edge; all but "loading" fade after a few seconds. */
  const hint = (h: typeof olderHint) => {
    clearTimeout(hintTimer.current)
    setOlderHint(h)
    if (h && h !== 'loading') hintTimer.current = setTimeout(() => setOlderHint(null), 4000)
  }

  /** Puts the next older section in front; also used by the forecast check, which needs more history. */
  const fetchOlder = (): Promise<'added' | 'end' | 'limit' | 'error' | 'busy'> => {
    const o = older.current
    const bars = dataRef.current
    if (!api || !bars.length || o.done) return Promise.resolve(o.done ? 'end' : 'error')
    if (!mayLoadOlder(o, Date.now())) return Promise.resolve(o.busy ? 'busy' : 'error')
    const gen = o.gen
    o.busy = true
    hint('loading')
    return loadCandles(symbol, timeframe, finnhubKey, extended, { before: bars[0].time, provider: o.provider })
      .then(({ candles }): 'added' | 'end' | 'limit' | 'error' => {
        if (gen !== older.current.gen) return 'error'
        const merged = prependOlder(dataRef.current, candles)
        const added = merged.length - dataRef.current.length
        if (added <= 0) {
          o.done = true
          hint('end')
          return 'end'
        }
        // Keep the view where it was: logical indexes shift by the number of bars put in front.
        const view = api.chart.timeScale().getVisibleLogicalRange()
        api.candles.setData(merged.map(toBar))
        api.volume.setData(merged.map(toVol))
        if (view) api.chart.timeScale().setVisibleLogicalRange({ from: view.from + added, to: view.to + added })
        dataRef.current = merged
        setData([...merged])
        o.done = merged.length >= HISTORY_LIMIT
        hint(o.done ? 'limit' : null)
        return o.done ? 'limit' : 'added'
      })
      .catch((): 'error' => {
        if (gen !== older.current.gen) return 'error'
        o.retryAt = Date.now() + OLDER_RETRY_MS
        hint('error')
        return 'error'
      })
      .finally(() => {
        if (gen === older.current.gen) o.busy = false
      })
  }
  const loadOlder = () => void fetchOlder()
  // The range subscription is made once; it always calls the current loadOlder.
  const loadOlderRef = useRef(loadOlder)
  loadOlderRef.current = loadOlder

  /** Scrolls to the preset's span, or to the last 150 bars when no preset is active; returns the first bar shown. */
  const showRange = (bars: Candle[], id: RangeId | null) => {
    if (!api || !bars.length) return 0
    const from = id ? rangeStartIndex(bars.map((c) => c.time), id) : Math.max(0, bars.length - 150)
    // Free space right of the last bar; a few yearly bars would otherwise leave half the chart empty.
    const margin = id ? 3 : Math.min(10, Math.max(2, Math.round(bars.length / 10)))
    api.chart.timeScale().setVisibleLogicalRange({ from, to: bars.length + margin })
    return from
  }

  // History + live updates for the current symbol/timeframe.
  useEffect(() => {
    if (!api) return
    let active = true
    const seconds = TF_SECONDS[timeframe]
    const months = TF_MONTHS[timeframe]
    const intraday = seconds < 86400
    // A day, week or month bar carries a date, not a moment: read in the local zone west of UTC, Binance's January
    // bar (00:00 UTC) would say "Dec". barZone: UTC for such date labels, else the exchange's zone.
    const dateZone = () => (intraday ? undefined : barZone(dataRef.current.slice(-50).map((c) => c.time), timezoneRef.current ?? 'UTC'))
    api.chart.applyOptions({
      timeScale: { timeVisible: intraday, tickMarkFormatter: (t: Time, type: TickMarkType) => tickMark(t, type, dateZone()) },
      localization: {
        timeFormatter: (t: Time) =>
          fmtTime(t, intraday ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }, dateZone())
      }
    })
    dataRef.current = []
    // Month-based candles already come with all the history there is.
    Object.assign(older.current, { gen: older.current.gen + 1, ready: false, busy: false, done: !!months, retryAt: 0, provider: undefined })
    hint(null)
    setData([])
    api.candles.setData([])
    api.volume.setData([])
    // Dragging a price axis turns its auto-scale off; a new symbol or candle size would keep the old price range.
    api.chart.panes().forEach((p) => p.priceScale('right').applyOptions({ autoScale: true }))
    setStatus(t('Lade {symbol} …', { symbol }))
    useChartMeta.setState({ symbol, currency: '', timeZone: undefined })

    // The candle moves with every tick; the indicators and the rest that read `data` follow at most 4 times a
    // second: a busy stock sends several trades a second, and each copy recomputes every indicator over all bars.
    let soon: ReturnType<typeof setTimeout> | undefined
    const push = (bar: Candle) => {
      const arr = dataRef.current
      if (!active || !arr.length || bar.time < arr[arr.length - 1].time) return
      if (bar.time === arr[arr.length - 1].time) arr[arr.length - 1] = bar
      else arr.push(bar)
      api.candles.update(toBar(bar))
      api.volume.update(toVol(bar))
      soon ??= setTimeout(() => {
        soon = undefined
        if (active) setData([...dataRef.current])
      }, 250)
    }

    // fresh: from the source; otherwise the phone's stored copy, shown at once until fresh candles arrive.
    const show = ({ candles: bars, currency, timezone, provider }: CandleData, fresh = true) => {
        if (!active) return
        if (!bars.length) return setStatus(t('Keine Daten für {symbol}', { symbol }))
        const last = bars[bars.length - 1].close
        const precision = last < 1 ? 6 : last < 10 ? 4 : 2
        const format = (p: number) => p.toFixed(precision)
        // The volume margin below the candles would otherwise label the axis with negative prices.
        const negative = bars.some((b) => b.low < 0)
        api.candles.applyOptions({
          priceFormat: {
            type: 'custom',
            minMove: 10 ** -precision,
            formatter: format,
            tickmarksFormatter: (ps: number[]) => ps.map((p) => (p < 0 && !negative ? '' : format(p)))
          }
        })
        api.candles.setData(bars.map(toBar))
        api.volume.setData(bars.map(toVol))
        const shownFrom = showRange(bars, useStore.getState().range)
        dataRef.current = bars
        setData([...bars])
        timezoneRef.current = timezone
        useChartMeta.setState({ symbol, currency, timeZone: timezone })
        setStatus(null)
        older.current.provider = provider
        if (!fresh) return
        // The chart applies the new view on its next frame and reports the previous chart's view before it;
        // its frame was requested first, so by this one only the new view counts.
        requestAnimationFrame(() => {
          if (!active) return
          older.current.ready = true
          // A short history may already show its left edge.
          if (shownFrom < OLDER_MARGIN) loadOlderRef.current()
        })
      }
    const kept = IS_MOBILE ? cachedCandles(symbol, timeframe) : null
    if (kept?.candles.length) show(kept, false)
    // Only the phone gets stored candles (stale) back; it keeps asking until fresh ones arrive.
    let retry: ReturnType<typeof setTimeout> | undefined
    const load = (first: boolean) =>
      loadCandles(symbol, timeframe, finnhubKey, extended)
        .then((d) => {
          if (!active) return
          if (!d.stale) return show(d)
          // Shown again on every try, the stored copy would reset the view each time.
          if (first) show(d)
          setStatus(t('Gespeicherter Stand, keine neuen Kurse: {error}', { error: d.stale }))
          retry = setTimeout(() => load(false), 15_000)
        })
        .catch((e: Error) => active && setStatus(ipcError(e)))
    load(true)

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
      clearTimeout(retry)
      clearTimeout(soon)
      stop()
    }
  }, [api, symbol, timeframe, finnhubKey, extended, stockSource, yahooExtra])

  // Insider dealings, filings and news of the open symbol, refreshed every 15 minutes (main keeps them as long).
  // A failed source is asked once more after about a minute, when main has let go of the failed answer.
  useEffect(() => {
    if (!eventsOn) return
    let retry: ReturnType<typeof setTimeout> | undefined
    const load = (again: boolean) =>
      loadEvents(symbol, finnhubKey).then(() => {
        const s = useEventsData.getState()
        const failed = s.state === 'error' || !!s.result?.notes.some((n) => n.state === 'error')
        if (again && failed && s.symbol === symbol) retry = setTimeout(() => void load(false), 65_000)
      })
    void load(true)
    const timer = setInterval(() => void load(true), 15 * 60_000)
    return () => {
      clearInterval(timer)
      clearTimeout(retry)
    }
  }, [symbol, finnhubKey, eventsOn])

  // Scrolling near the oldest bar loads the section before it.
  useEffect(() => {
    if (!api) return
    const onRange = (r: { from: number } | null) => {
      if (r && r.from < OLDER_MARGIN) loadOlderRef.current()
    }
    api.chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)
    return () => api.chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange)
  }, [api])

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
    // Latest value as a rounded tag on the pane's axis (PriceTags), dark text on the light indicator colours.
    const tags: Tag[] = []
    const valueTag = (series: ISeriesApi<SeriesType>, color: string) => tags.push({ series, color, ink: THEME.bg })
    const guides = (series: ISeriesApi<SeriesType>, color: string, levels: number[]) => {
      valueTag(series, color)
      for (const price of levels)
        series.createPriceLine({ price, color: '#5d6375', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false })
    }
    const groups: LegendGroup[] = []
    const legend = (pane: number, label: string, color: string, series: ISeriesApi<SeriesType>[], osc?: boolean) =>
      groups.push({ pane, label, color, series, osc })
    const { sma: s, ema: e, ema3, bb, vwap: vw, supertrend: st, rsi: r, macd: m, stoch, atr: at } = indicators
    // Indicators with several lines are computed once per data change, not once per line.
    const once = <T,>(f: (c: number[], d: Candle[]) => T) => {
      let seen: Candle[] | undefined
      let value: T
      return (c: number[], d: Candle[]) => (d === seen ? value : ((seen = d), (value = f(c, d))))
    }
    if (s.on) legend(0, `SMA ${s.period}`, '#f5c542', [line('#f5c542', (c) => sma(c, s.period))])
    if (e.on) legend(0, `EMA ${e.period}`, '#42a5f5', [line('#42a5f5', (c) => ema(c, e.period))])
    if (ema3.on) {
      legend(0, `EMA ${ema3.fast} ${ema3.mid} ${ema3.slow}`, '#26c6da', [
        line('#26c6da', (c) => ema(c, ema3.fast)),
        line('#ffa726', (c) => ema(c, ema3.mid)),
        line('#ec407a', (c) => ema(c, ema3.slow))
      ])
    }
    if (bb.on) {
      const calc = once((c) => bollinger(c, bb.period, bb.mult))
      legend(0, `BB ${bb.period} ${bb.mult}`, '#9c6ade', [
        line('#9c6ade', (c, d) => calc(c, d).upper),
        line('#9c6ade88', (c, d) => calc(c, d).mid),
        line('#9c6ade', (c, d) => calc(c, d).lower)
      ])
    }
    if (vw.on) {
      const series = line('#e0e0e0', (_, d) => vwap(d))
      series.applyOptions({ lineStyle: LineStyle.Dashed })
      legend(0, 'VWAP', '#e0e0e0', [series])
    }
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
      legend(0, `Supertrend ${st.period} ${st.mult}`, UP, [series])
    }
    let pane = 1
    if (r.on) {
      const series = line('#b388ff', (c) => rsi(c, r.period), pane)
      guides(series, '#b388ff', [70, 30])
      legend(pane++, `RSI ${r.period}`, '#b388ff', [series], true)
    }
    if (m.on) {
      const calc = once((c) => macd(c, m.fast, m.slow, m.signal))
      const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane)
      list.push({ series: hist, calc: (c, d) => calc(c, d).hist, color: (v) => (v >= 0 ? UP : DOWN) + '99' })
      const macdLine = line('#42a5f5', (c, d) => calc(c, d).line, pane)
      legend(pane, `MACD ${m.fast} ${m.slow} ${m.signal}`, '#42a5f5', [macdLine, line('#ff9800', (c, d) => calc(c, d).signal, pane++), hist])
    }
    if (stoch.on) {
      const calc = once((_, d) => stochastic(d, stoch.period, stoch.smoothK, stoch.smoothD))
      const k = line('#42a5f5', (c, d) => calc(c, d).k, pane)
      guides(k, '#42a5f5', [80, 20])
      legend(pane, `${t('Stochastik')} ${stoch.period} ${stoch.smoothK} ${stoch.smoothD}`, '#42a5f5', [k, line('#ff9800', (c, d) => calc(c, d).d, pane++)], true)
    }
    if (at.on) {
      const series = line('#b0bec5', (_, d) => atr(d, at.period), pane)
      valueTag(series, '#b0bec5')
      legend(pane++, `ATR ${at.period}`, '#b0bec5', [series])
    }
    chart.panes().forEach((p, i) => i > 0 && p.setStretchFactor(0.3))
    setIndicatorSeries(list)
    setLegend(groups)
    setValueTags(tags)
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
      lastCheck.current = null
      setFc({ state: 'idle' })
    }
  }, [api, symbol, timeframe])

  const toggleForecast = async () => {
    if (fc.state !== 'shown') {
      // On the phone the PC computes; the model (480 MB) only loads there after a yes.
      if (IS_MOBILE) {
        const pc = usePcStatus.getState().state
        const title = t('KI-Prognose')
        if (pc === 'none') {
          if (await ask(t(PC_NONE), t('Jetzt koppeln'), { title })) window.dispatchEvent(new Event('kandleos:pair'))
          return
        }
        if (pc !== 'online') return tell(t(PC_OFF), { title })
        if (
          !(await window.api.modelReady()) &&
          !(await ask(t('Das Prognosemodell fehlt am PC. Jetzt am PC laden (ca. 480 MB)?'), t('Laden'), { title }))
        )
          return
      }
      return void runForecast()
    }
    // Also stops the check still running for it.
    fcRun.current++
    setFc({ state: 'idle' })
  }

  const archiveContext = (auto: boolean): ArchiveContext => ({
    symbol,
    timeframe,
    provider: older.current.provider,
    extended,
    timeZone: timezoneRef.current,
    auto
  })

  // Settle this symbol's finished forecasts when it is opened.
  useEffect(() => {
    void settleDue(symbol)
  }, [symbol])

  // The last check of this chart and its calibration factor, reused by the automatic refresh.
  const lastCheck = useRef<{ check: BacktestResult | null; scale: number | null; path: ForecastResult['backtestPath'] } | null>(null)

  /**
   * Backtests after the forecast is shown: loads older bars until `runs` backtests with enough history fit,
   * then compares them with what really followed. A forecast made stale meanwhile drops the result.
   */
  const runCheck = async (run: number, shown: ForecastResult, n: number, runs: number, calibrate: boolean) => {
    const { raw } = shown
    const update = (patch: Partial<ForecastResult>) =>
      setFc((f) => (run === fcRun.current && f.result ? { ...f, result: { ...f.result, ...patch } } : f))
    // With calibration the forecast is archived once its factor is known (or without one if the check fails).
    const archiveNow = (scale: number | null) => calibrate && archiveForecast({ ...shown, bandScale: scale }, archiveContext(false))
    // The bars can be reloaded without a new forecast (extended hours, source or key changed); this check's
    // fetchOlder still carries the old settings then, so it must stop before it touches the new bars.
    const gen = older.current.gen
    const stale = () => run !== fcRun.current || gen !== older.current.gen
    const drop = () => run === fcRun.current && update({ check: null, checkTotal: undefined })
    try {
      for (let tries = 0; dataRef.current.length < historyNeeded(n, runs) && tries < 40; tries++) {
        if (stale()) return drop()
        const r = await fetchOlder()
        if (stale()) return drop()
        // The user scrolling left is loading a section already; wait for it instead of stopping.
        if (r === 'busy') await new Promise((ok) => setTimeout(ok, 300))
        else if (r !== 'added') break
      }
      if (stale()) return drop()
      const bars = dataRef.current
      const closes = bars.map((c) => c.close)
      const cutoffs = checkCutoffs(bars.length, n, runs)
      if (!cutoffs.length) {
        lastCheck.current = { check: null, scale: null, path: null }
        archiveNow(null)
        return update({ check: null })
      }
      update({ checkTotal: cutoffs.length })
      const past = await window.api.forecast(
        cutoffs.map((c) => closes.slice(0, c)),
        cutoffs.map((_, k) => k)
      )
      if (stale()) return drop()
      const check = backtest(closes, cutoffs, past, n)
      // Calibration only stretches the ranges around the median; the backtest line keeps the raw model's accuracy.
      const scale = calibrate ? bandScale(closes, cutoffs, past, n) : null
      const c = cutoffs[0]
      // The latest backtest's median over the real bars that followed its cutoff.
      const path = [
        { time: bars[c - 1].time, value: closes[c - 1] },
        ...past[0].slice(0, n).map((q, i) => ({ time: bars[c + i].time, value: q[Q.median] }))
      ]
      lastCheck.current = { check, scale, path }
      update({ check, checkTotal: undefined, bandScale: scale, steps: scale === null ? raw : scaleBands(raw, scale), backtestPath: path })
      archiveNow(scale)
    } catch {
      // A failed check leaves the forecast as it is.
      if (run === fcRun.current) {
        update({ check: null, checkTotal: undefined })
        archiveNow(null)
      }
    }
  }

  /** Computes the forecast; `quiet` keeps the shown one (and the view) until the new one is ready. */
  const runForecast = async (quiet = false) => {
    if (!api) return
    // A copy: live ticks keep changing the chart's bars while the model runs.
    const bars = dataRef.current.slice()
    const run = ++fcRun.current
    if (!quiet) setFc({ state: 'loading' })
    const stop = quiet
      ? () => {}
      : window.api.onForecastProgress((pct) => run === fcRun.current && setFc({ state: 'loading', pct }))
    try {
      const closes = bars.map((c) => c.close)
      const times = bars.map((c) => c.time)
      // Wick lengths above and below each body, for the forecast candles.
      const upper = bars.map((c) => c.high - Math.max(c.open, c.close))
      const lower = bars.map((c) => Math.min(c.open, c.close) - c.low)
      const { horizon, backtestRuns, calibrate } = useStore.getState().forecastRun
      const n = forecastSteps(timeframe, bars.length, horizon === 'auto' ? 64 : horizon)
      // The close on its own (grouping it with the wicks made it measurably worse in backtests) and the two
      // wick series as a group of their own; the backtests follow once the forecast is shown.
      const [live, liveUpper, liveLower] = await window.api.forecast([closes, upper, lower], [0, 1, 1])
      if (run !== fcRun.current) return
      const median = (q: number[][]) => q.slice(0, n).map((v) => v[Q.median])
      const last = bars[bars.length - 1]
      const raw = live.slice(0, n)
      // The automatic refresh keeps the last check, so the ranges do not change with every new candle.
      const reuse = quiet && backtestRuns ? lastCheck.current : null
      const scale = reuse && calibrate ? reuse.scale : null
      const result: ForecastResult = {
        times: futureTimes(times, TF_SECONDS[timeframe], n, timezoneRef.current, TF_MONTHS[timeframe]),
        raw,
        steps: scale === null ? raw : scaleBands(raw, scale),
        bandScale: scale,
        upperWicks: median(liveUpper),
        lowerWicks: median(liveLower),
        base: last.close,
        baseTime: last.time,
        check: !backtestRuns ? null : reuse ? reuse.check : 'pending',
        backtestPath: reuse?.path ?? null
      }
      setFc({ state: 'shown', result })
      // Archived as shown: with calibration that waits for the check's factor.
      const awaitFactor = calibrate && backtestRuns > 0 && !reuse
      if (!awaitFactor) archiveForecast(result, archiveContext(quiet))
      // Widen the view so the whole forecast is visible; the left edge stays where the user put it.
      const view = api.chart.timeScale().getVisibleLogicalRange()
      if (!quiet && view && view.to < bars.length + n)
        api.chart.timeScale().setVisibleLogicalRange({ from: view.from, to: bars.length + n + 2 })
      if (backtestRuns && !reuse) void runCheck(run, result, n, backtestRuns, calibrate)
    } catch (e) {
      const error = ipcError(e)
      // A failed refresh keeps the forecast already shown.
      if (run === fcRun.current && !quiet) setFc({ state: 'error', error })
    } finally {
      stop()
    }
  }

  // Changed forecast length or backtest depth: recompute a shown forecast.
  useEffect(() => {
    if (fc.state === 'shown') void runForecast()
  }, [forecastRun.horizon, forecastRun.backtestRuns, forecastRun.calibrate])

  // Automatic refresh: a new candle has begun, so the shown forecast is recomputed over the new history.
  // Keyed on the newest bar, not the count: older bars loaded in front change nothing about the forecast.
  const newest = data[data.length - 1]?.time ?? 0
  const lastNewest = useRef(0)
  useEffect(() => {
    const grew = lastNewest.current > 0 && newest > lastNewest.current
    lastNewest.current = newest
    if (grew && forecastRun.autoUpdate && fc.state === 'shown') void runForecast(true)
  }, [newest])

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
    if (r.backtestPath) line(r.backtestPath, '#b0bec5aa', 1, LineStyle.Dotted)
    return () => series.forEach((s) => chart.removeSeries(s))
  }, [api, fc.result, forecastView])

  // Price target, entry and stop of the TradingAgents analysis as labelled lines on the price axis.
  const levels = agentLevelList(agentLevels)
  useEffect(() => {
    if (!api || !agentLevels) return
    // Lines only: their tags and titles are drawn rounded by PriceTags.
    const lines = levels.flatMap(([price, color, , lineStyle]) =>
      price === null ? [] : [api.candles.createPriceLine({ price, color, lineStyle, lineWidth: 1, axisLabelVisible: false })]
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

  // US stocks outside the regular session: the pre-/after-market price, or with those candles shown the regular close.
  // Orange (sunrise) and indigo (moon) as the watchlist icons, long dashes: the forecast line is yellow and short-dashed.
  const session = sessionLine(quote, extended)
  useEffect(() => {
    if (!api || !session) return
    const close = session.kind === 'close'
    // Line only: its tag and title are drawn rounded by PriceTags, like the last price.
    const line = api.candles.createPriceLine({
      price: session.price,
      color: SESSION_TAG[session.kind].color,
      lineStyle: close ? LineStyle.Dotted : LineStyle.LargeDashed,
      lineWidth: 1,
      axisLabelVisible: false
    })
    return () => api.candles.removePriceLine(line)
    // Primitives, so the 15 s quote refresh does not rebuild an unchanged line.
  }, [api, session?.price, session?.kind])

  // Armed price alarms of this symbol as dashed lines (set on the phone).
  const alarmPrices = useStore((s) => s.alarms.filter((a) => a.symbol === symbol && a.triggeredAt === undefined).map((a) => a.price).join(','))
  useEffect(() => {
    if (!api || !alarmPrices) return
    const lines = alarmPrices.split(',').map((p) =>
      api.candles.createPriceLine({ price: Number(p), color: ALARM, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false })
    )
    return () => lines.forEach((l) => api.candles.removePriceLine(l))
  }, [api, alarmPrices])

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
      // Crosshair in the icon's indigo; its axis labels are drawn rounded by PriceTags.
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: THEME.brandFrom + '99', labelVisible: false },
        horzLine: { color: THEME.brandFrom + '99', labelVisible: false }
      },
      rightPriceScale: { borderColor: LINE },
      // 0.3 px per bar (default 0.5): about 1,100 bars on a phone, 4,000 on a wide window.
      timeScale: { borderColor: LINE, rightOffset: 10, minBarSpacing: 0.3, tickMarkFormatter: tickMark },
      localization: { locale: locale() }
    })
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
      // KandleOS draws its own, rounded last-price tag (src/mobile/PriceTag.tsx).
      lastValueVisible: false
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

  // In full screen the candles start below the buttons and the legend, which would otherwise hide the newest highs.
  useEffect(() => {
    const box = containerRef.current
    const leg = legendRef.current
    if (!api || !box || !leg) return
    const margins = (top: number) => api.candles.priceScale().applyOptions({ scaleMargins: { top, bottom: 0.25 } })
    if (!full) return margins(0.08)
    const fit = () => {
      const gap = leg.getBoundingClientRect().bottom - box.getBoundingClientRect().top + 8
      // The price pane is the top one; RSI, MACD … below it make it shorter than the chart.
      const h = api.chart.panes()[0]?.getHeight() || box.clientHeight
      margins(h ? Math.min(0.4, Math.max(0.08, gap / h)) : 0.08)
    }
    // After the chart's own layout, which sets the panes' heights. Turning the phone and a legend that wraps onto
    // more lines change the gap.
    const id = requestAnimationFrame(fit)
    const watch = new ResizeObserver(fit)
    watch.observe(box)
    watch.observe(leg)
    return () => {
      cancelAnimationFrame(id)
      watch.disconnect()
    }
    // indicatorSeries: a new or removed lower pane changes the price pane's height.
  }, [api, full, indicatorSeries])

  // Buttons, card and currency sign sit beside the price axis, whose width is only known after the chart's first
  // layout and changes with the prices; the time scale's width changes with it, so that redraws them.
  const [, setAxisWidth] = useState(0)
  useEffect(() => {
    if (!api) return
    const ts = api.chart.timeScale()
    const sync = () => {
      const w = api.chart.priceScale('right').width()
      setAxisWidth(w)
      // The phone's full-screen buttons (MobileApp, outside the chart) keep left of the axis.
      if (IS_MOBILE) document.documentElement.style.setProperty('--axis-w', `${w}px`)
    }
    ts.subscribeSizeChange(sync)
    return () => ts.unsubscribeSizeChange(sync)
  }, [api])

  const fcLabel =
    fc.state === 'shown'
      ? t('Prognose aus')
      : fc.state === 'loading'
        ? fc.pct !== undefined && fc.pct < 100
          ? t('Lade Modell {pct} %', { pct: fc.pct })
          : t('Rechne …')
        : t('KI-Prognose')
  const settingsMenu = fcMenu && (
    <ForecastSettings
      onClose={() => setFcMenu(false)}
      onOpenAnalysis={() => {
        setQualityOpen(false)
        setAgentsOpen(true)
      }}
    />
  )
  const summary = fc.result && (
    <ForecastSummary
      result={fc.result}
      intraday={TF_SECONDS[timeframe] < 86400}
      showCheck={forecastRun.backtestRuns > 0}
      symbol={symbol}
      timeframe={timeframe}
      onDetails={() => {
        setAgentsOpen(false)
        setQualityOpen(true)
      }}
    />
  )
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative min-h-0 flex-1" onPointerDown={() => select(null)}>
        {/* isolate: keeps the chart canvases' z-indexes from stacking above the drawing overlay */}
        {/* The analysis panel takes the right edge; the chart narrows so its price axis (with the target line) stays visible. */}
        <div ref={containerRef} className="absolute inset-0 isolate" style={{ right: sideOpen ? AGENTS_WIDTH : 0 }} />
        {api && currency && (
          // In the empty corner below the price axis (the chart library has no axis title; tick labels fill the axis itself).
          <span
            className="absolute bottom-0 z-10 flex items-center justify-center text-[11px] font-medium text-slate-300"
            style={{
              right: sideOpen ? AGENTS_WIDTH : 0,
              width: api.chart.priceScale('right').width(),
              height: api.chart.timeScale().height()
            }}
            title={t('Währung der Kurse')}
          >
            {MINOR_UNITS[currency] ?? currency}
          </span>
        )}
        {api && eventsOn && <EventLayer chart={api.chart} series={api.candles} data={data} symbol={symbol} timeframe={timeframe} timeZone={exchangeZone} currency={currency} />}
        {api && <DrawingOverlay chart={api.chart} series={api.candles} data={data} timeZone={exchangeZone} />}
        {api && data.length > 0 && (
          <PriceTags
            chart={api.chart}
            series={api.candles}
            right={sideOpen ? AGENTS_WIDTH : 0}
            crossColor={THEME.brandFrom}
            tags={[
              { price: data[data.length - 1].close, color: data[data.length - 1].close >= data[data.length - 1].open ? UP : DOWN },
              ...(session ? [{ price: session.price, ...SESSION_TAG[session.kind], label: t(SESSION_TITLE[session.kind]) }] : []),
              ...(alarmPrices ? alarmPrices.split(',').map((p) => ({ price: Number(p), color: ALARM, ink: THEME.bg, label: '⏰' })) : []),
              ...levels.flatMap(([price, color, label]) => (price === null ? [] : [{ price, color, label }])),
              ...valueTags
            ]}
          />
        )}
        {api && fc.state === 'loading' && data.length > 0 && (
          <ForecastLoader
            chart={api.chart}
            series={api.candles}
            time={data[data.length - 1].time}
            price={data[data.length - 1].close}
            right={(sideOpen ? AGENTS_WIDTH : 0) + api.chart.priceScale('right').width()}
            bottom={api.chart.timeScale().height()}
          />
        )}
        {api && <IndicatorLegend chart={api.chart} groups={legend} fmt={(v) => api.candles.priceFormatter().format(v)} main={false} />}
        <div
          ref={legendRef}
          className="chart-legend pointer-events-none absolute left-3 top-2 text-xs text-muted"
          // Wraps before the buttons at the top right (about 200 px wide, plus the 320 px summary card) instead of running under them.
          style={{ right: (sideOpen ? AGENTS_WIDTH : 0) + (api?.chart.priceScale('right').width() ?? 60) + (IS_MOBILE ? 12 : fc.result ? 547 : 215) }}
        >
          {/* One flex row, centred: the chips differ in content (icons, dots), so baseline alignment would stagger them.
              The phone shows symbol, price and market state in its header instead. */}
          <div className="flex flex-wrap items-center gap-2">
            {!IS_MOBILE && (
              <>
                <span>
                  <span className="font-semibold text-white">{symbol}</span> · {tfLabel(timeframe)}
                </span>
                <QuoteChip quote={quote} currency={currency} />
                <MarketBadge symbol={symbol} timeZone={exchangeZone} />
                <EventsButton />
              </>
            )}
            {fc.state === 'error' && <span className="text-down">{fc.error}</span>}
          </div>
          {api && <IndicatorLegend chart={api.chart} groups={legend} fmt={(v) => api.candles.priceFormatter().format(v)} main />}
        </div>
        {/* The forecast is the app's headline feature: a large button at the top right, beside the price axis,
            with its display settings right next to it and the summary card to its left. */}
        {/* On the phone the card sits at the bottom of the chart and opens upwards: beside or under the button it
            would cover the symbol, price and market lines. */}
        {IS_MOBILE && summary && (
          <div
            className="absolute left-2 z-30 flex justify-end"
            style={{ bottom: (api?.chart.timeScale().height() ?? 28) + 8, right: (api?.chart.priceScale('right').width() ?? 60) + 8 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {summary}
          </div>
        )}
        {!IS_MOBILE && (
        <div
          className="absolute top-2 z-30 flex items-start gap-2"
          style={{ right: (sideOpen ? AGENTS_WIDTH : 0) + (api?.chart.priceScale('right').width() ?? 60) + 12 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {summary}
          <div className="relative flex">
            <button
              onClick={toggleForecast}
              aria-label={fcLabel}
              disabled={fc.state === 'loading' || data.length < FORECAST_MIN_BARS}
              title={
                data.length && data.length < FORECAST_MIN_BARS
                  ? t('Zu wenige Kerzen für eine Prognose: {n} von mindestens {min}. Eine kürzere Kerzengröße wählen.', {
                      n: data.length,
                      min: FORECAST_MIN_BARS
                    })
                  : t(
                      'Statistische Prognose der nächsten {n} Kerzen mit Chronos-2, lokal berechnet: Median (gestrichelt) mit Fächer aus 50/80/90 %-Bereichen, Werte beim Überfahren, dazu ein Rückblick auf die Treffsicherheit. Keine Anlageberatung.',
                      { n: forecastSteps(timeframe, data.length, maxSteps) }
                    ) + (fc.state === 'idle' ? ' ' + t('Beim ersten Mal wird das Modell geladen (ca. 480 MB).') : '')
              }
              className={`inline-flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40 ${
                fc.state === 'shown'
                  ? 'bg-panel/90 text-slate-200 ring-1 ring-accent/60 backdrop-blur hover:bg-line'
                  : 'bg-brand text-white shadow-glow enabled:hover:brightness-110'
              } ${fc.state === 'loading' ? 'animate-pulse disabled:cursor-wait disabled:opacity-90' : 'disabled:cursor-not-allowed'} ${pcOff && fc.state !== 'shown' ? 'opacity-40 grayscale' : ''}`}
            >
              {fc.state === 'shown' ? <X size={15} /> : <Sparkles size={15} className="text-amber-200" />}
              {fcLabel}
            </button>
            <button
              onClick={() => setFcMenu((o) => !o)}
              aria-expanded={fcMenu}
              aria-haspopup="dialog"
              title={t('Prognose-Anzeige: Linie oder Kerzen, Bereiche, Rückblick – und die umfassende Analyse mit TradingAgents')}
              aria-label={t('Prognose-Anzeige einstellen')}
              className={`rounded-r-lg border-l border-white/20 px-2 transition ${
                fc.state === 'shown'
                  ? 'bg-panel/90 text-slate-200 ring-1 ring-accent/60 backdrop-blur hover:bg-line'
                  : 'bg-brand text-white shadow-glow hover:brightness-110'
              }`}
            >
              <SlidersHorizontal size={15} />
            </button>
            {settingsMenu}
          </div>
        </div>
        )}
        {/* The phone shows the forecast button in its header (src/mobile/MobileHeader.tsx), not over the chart. */}
        {IS_MOBILE &&
          kiSlot &&
          createPortal(
            <MobileKiButton
              state={fc.state}
              pct={fc.pct}
              disabled={data.length < FORECAST_MIN_BARS}
              pcOff={pcOff}
              onToggle={() => void toggleForecast()}
              onSettings={() => setFcMenu(true)}
              settings={settingsMenu}
            />,
            kiSlot
          )}
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
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted">
            {/* A new symbol or candle size loading into the empty chart. */}
            {!data.length && status === t('Lade {symbol} …', { symbol }) && <BrandLoader />}
            {/* Over candles (the phone's stored copy) the message needs a background to stay readable. */}
            {data.length ? <span className="rounded-md border border-line bg-panel/90 px-2 py-1 text-xs backdrop-blur">{status}</span> : status}
          </div>
        )}
        {olderHint && !status && (
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-line bg-panel/80 px-2 py-1 text-xs text-muted backdrop-blur">
            {t(OLDER_HINT[olderHint])}
          </div>
        )}
        <AgentsPanel
          open={agentsOpen}
          setupOpen={agentsSetup}
          symbol={symbol}
          price={quote?.price ?? data[data.length - 1]?.close}
          onClose={() => setAgentsOpen(false)}
          onSetup={() => setAgentsSetup(true)}
          onLevels={setAgentLevels}
        />
        <ForecastQuality
          open={qualityOpen}
          symbol={symbol}
          timeframe={timeframe}
          result={fc.result ?? null}
          onClose={() => setQualityOpen(false)}
        />
      </div>
      {agentsSetup && <AgentsSetup onClose={() => setAgentsSetup(false)} />}
      {/* mobile-ranges: hidden in the phone's full screen (mobile.css). */}
      <div className="mobile-ranges flex h-8 shrink-0 items-center border-t border-line bg-panel px-2">
        <div className="flex gap-0.5 overflow-x-auto" role="group" aria-label={t('Zeitraum')}>
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              title={t('{title} ({tf}-Kerzen)', { title: t(r.title), tf: tfLabel(r.tf) })}
              aria-pressed={range === r.id}
              className={`rounded-md px-2 py-0.5 text-xs ${range === r.id ? 'bg-brand text-white shadow-glow' : 'text-muted hover:bg-line hover:text-white'}`}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
        <button
          onClick={toggleExtendedHours}
          disabled={!extendable}
          aria-pressed={extendedHours}
          aria-label={t('Vor-/Nachbörse')}
          title={
            extendable
              ? t('Vorbörse und Nachbörse (US-Aktien, 10:00–15:30 und 22:00–02:00 deutscher Zeit) als Kerzen zeigen, grau hinterlegt')
              : t('Vor-/Nachbörse gibt es nur bei Aktien und Kerzen unter einem Tag')
          }
          className={`ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-xs disabled:opacity-40 ${
            extended ? 'bg-brand text-white shadow-glow' : 'text-muted enabled:hover:bg-line enabled:hover:text-white'
          }`}
        >
          <Sunrise size={IS_MOBILE ? 14 : 12} />
          <Moon size={IS_MOBILE ? 13 : 11} />
          {!IS_MOBILE && t('Vor-/Nachbörse')}
        </button>
        {!IS_MOBILE && <FullscreenButton />}
      </div>
    </div>
  )
}
