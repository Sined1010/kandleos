// The chart side of the Events list: insider markers at their bars, a temporary marker for the entry under the
// mouse or chosen, the hover box, a faint stripe for the reporting delay, clicks on markers and jumps to a bar.
import type { IChartApi, ISeriesApi, MouseEventParams, Time } from 'lightweight-charts'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { timeZoneForSymbol } from '../../../shared/calendar'
import { candleDates, candleIndex, candleMarks, shortMoney, sinceChange } from '../../../shared/eventChart'
import type { ChartEvent } from '../../../shared/events'
import { locale, t } from '../../../shared/i18n'
import { TF_SECONDS, type Candle, type Timeframe } from '../../../shared/types'
import { EventBadges, type Badge } from '../lib/eventBadges'
import { IS_MOBILE } from '../lib/platform'
import { openEvents, useEventsData } from '../services/events'
import { useEventsUi } from '../store/eventsUi'
import { useStore } from '../store/useStore'
import EventCard from '../../../mobile/EventCard'
import { EventStack } from './EventsPanel'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  data: Candle[]
  symbol: string
  timeframe: Timeframe
  timeZone?: string
  currency: string
}

const NO_EVENTS: ChartEvent[] = []
const GAP = 14
/** Phone: how far (px) a tap may miss a marked bar. */
const FINGER = 16

/** The cluster an in-cluster buy belongs to (clusters span their first to their last buy). */
const clusterOf = (e: ChartEvent, all: ChartEvent[]): ChartEvent | undefined =>
  e.inCluster ? all.find((c) => c.kind === 'cluster' && c.id.split('|')[1] <= e.date && e.date <= c.date) : undefined

export default function EventLayer({ chart, series, data, symbol, timeframe, timeZone, currency }: Props) {
  const all = useEventsData((s) => (s.symbol === symbol ? s.events : NO_EVENTS))
  const filters = useStore((s) => s.eventFilters)
  const { hovered, selected, jump } = useEventsUi(useShallow((s) => ({ hovered: s.hovered, selected: s.selected, jump: s.jump })))
  const intraday = TF_SECONDS[timeframe] < 86400
  const events = useMemo(() => all.filter((e) => filters[e.group]), [all, filters])

  // Bar dates and the bar of each event: rebuilt when bars are added (or the chart reloads), not on every tick.
  const barsKey = `${data.length}|${data[0]?.time}|${data.at(-1)?.time}`
  const zone = timeZone ?? timeZoneForSymbol(symbol) ?? 'UTC'
  const base = useMemo(() => {
    if (!all.length) return { times: [] as number[], dates: [] as string[], index: new Map<string, number>() }
    const times = data.map((c) => c.time)
    const dates = candleDates(times, zone)
    return { times, dates, index: new Map(all.map((e) => [e.id, candleIndex(dates, times, e, intraday)])) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barsKey, all, zone, intraday])
  const marks = useMemo(() => candleMarks(events, base.dates, base.times, intraday), [events, base, intraday])

  // Intraday: low and high of each day, one pass over the bars whenever bars are added (not on every tick).
  const days = useMemo(() => {
    const map = new Map<string, [number, number]>()
    if (!intraday || !all.length) return map
    data.forEach((b, j) => {
      const d = map.get(base.dates[j])
      map.set(base.dates[j], d ? [Math.min(d[0], b.low), Math.max(d[1], b.high)] : [b.low, b.high])
    })
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, intraday])

  // Tell the list which bars are loaded and how the price moved since each deal.
  const last = data.at(-1)?.close
  useEffect(() => {
    const loaded: Record<string, true> = {}
    const since: Record<string, number> = {}
    // The live bar only widens its day's range between rebuilds of the day map.
    const lastBar = data.at(-1)
    const lastDay = base.dates.at(-1)
    for (const e of all) {
      const i = base.index.get(e.id) ?? -1
      if (i < 0) continue
      loaded[e.id] = true
      if (e.kind !== 'insider' || last === undefined || e.deal?.currency !== currency) continue
      let [lo, hi] = intraday ? days.get(base.dates[i])! : [data[i].low, data[i].high]
      if (intraday && lastBar && base.dates[i] === lastDay) [lo, hi] = [Math.min(lo, lastBar.low), Math.max(hi, lastBar.high)]
      const v = sinceChange(e.deal.price, lo, hi, last)
      // Whole percents, as shown: the list then redraws when the shown number changes, not on every tick.
      if (v !== undefined) since[e.id] = Math.round(v * 100) / 100
    }
    const now = useEventsUi.getState()
    const same = (a: Record<string, unknown>, b: Record<string, unknown>) =>
      Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k])
    if (!same(loaded, now.loaded) || !same(since, now.since)) useEventsUi.setState({ loaded, since })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, days, all, currency, last, intraday])

  // Leaving a symbol forgets what was chosen there.
  useEffect(() => () => useEventsUi.setState({ selected: null, hovered: null, jump: null, since: {}, loaded: {} }), [symbol])

  // The entry under the mouse (or chosen) gets a temporary marker unless a permanent one already shows it.
  const focus = hovered ?? selected
  const focusIndex = focus ? (base.index.get(focus) ?? -1) : -1
  const tmp = focusIndex >= 0 && !marks.some((m) => m.ids.includes(focus!)) ? base.times[focusIndex] : undefined

  // Badges (marker design A, lib/eventBadges.ts), drawn by a primitive on the candle series.
  const badges = useRef<EventBadges | null>(null)
  useEffect(() => {
    const p = new EventBadges()
    series.attachPrimitive(p)
    badges.current = p
    return () => {
      badges.current = null
      // The chart may already be removed when the tab closes; then there is nothing left to detach from.
      try {
        series.detachPrimitive(p)
      } catch {}
    }
  }, [series])
  const focused = tmp !== undefined ? all.find((e) => e.id === focus) : undefined
  useEffect(() => {
    const list: Badge[] = marks.map((m) => ({
      id: String(m.time),
      time: m.time,
      index: m.index,
      kind: m.side,
      text: IS_MOBILE ? '' : m.text,
      strong: m.big
    }))
    if (tmp !== undefined && focused) {
      const text =
        focused.kind === 'filing' ? t('8-K')
        : focused.kind === 'news' ? t('News')
        : focused.kind === 'cluster' ? t('Cluster-Kauf')
        : focused.kind === 'transfer' ? t('Übertragung')
        : focused.deal?.volume !== undefined ? shortMoney(focused.deal.volume, focused.deal.currency) : ''
      list.push({ id: 'tmp', time: tmp, index: focusIndex, kind: 'note', text: IS_MOBILE ? '' : text, strong: false, temp: true })
    }
    badges.current?.set(list)
  }, [marks, tmp, focused, focusIndex])

  /** Events shown for a bar: those of its permanent marker, or the temporary one. */
  const eventsAt = (time: number): ChartEvent[] => {
    const mark = marks.find((m) => m.time === time)
    const ids = [...(mark?.ids ?? []), ...(tmp === time && focus && !mark?.ids.includes(focus) ? [focus] : [])]
    return ids.map((id) => all.find((e) => e.id === id)!).filter(Boolean)
  }
  const latest = useRef(eventsAt)
  latest.current = eventsAt
  const tmpTime = useRef(tmp)
  tmpTime.current = tmp
  /** The bar a pointer event is about: the badge under it (a badge is wider than its bar), else the bar itself. */
  const barOf = (p: MouseEventParams<Time>): number | undefined => {
    const id = p.hoveredObjectId
    if (id === 'tmp') return tmpTime.current
    return typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : (p.time as number | undefined)
  }
  const barOfRef = useRef(barOf)
  barOfRef.current = barOf
  const marksRef = useRef(marks)
  marksRef.current = marks

  // Hover box (PC): over a bar with a marker.
  const [tip, setTip] = useState<{ x: number; y: number; time: number } | null>(null)
  useEffect(() => {
    if (IS_MOBILE) return
    const onMove = (p: MouseEventParams<Time>) => {
      const time = barOfRef.current(p)
      setTip(p.point && time !== undefined && latest.current(time).length ? { x: p.point.x, y: p.point.y, time } : null)
    }
    chart.subscribeCrosshairMove(onMove)
    return () => chart.unsubscribeCrosshairMove(onMove)
  }, [chart])
  const tipEvents = tip ? eventsAt(tip.time) : []

  // Phone: a tap anywhere in a bar's column (a badge is too small for a finger) chooses its first event and so
  // opens the card; a tap on a bar without events closes it.
  useEffect(() => {
    if (!IS_MOBILE) return
    const onTap = (p: MouseEventParams<Time>) => {
      let time = barOfRef.current(p)
      // Zoomed out a bar is a few pixels wide: a finger near a marked bar means that bar.
      if ((time === undefined || !latest.current(time).length) && p.point) {
        const near = marksRef.current
          .map((m) => ({ m, d: Math.abs((chart.timeScale().timeToCoordinate(m.time as Time) ?? -1e9) - p.point!.x) }))
          .filter((n) => n.d <= FINGER)
          .sort((a, b) => a.d - b.d)[0]
        if (near) time = near.m.time
      }
      useEventsUi.setState({ selected: (time !== undefined && latest.current(time)[0]?.id) || null })
    }
    chart.subscribeClick(onTap)
    return () => chart.unsubscribeClick(onTap)
  }, [chart])

  // Click on a marker (PC: the marker itself) opens the list at its first entry.
  useEffect(() => {
    if (IS_MOBILE) return
    const onClick = (p: MouseEventParams<Time>) => {
      const id = p.hoveredObjectId
      if (typeof id !== 'string' || (id !== 'tmp' && !/^\d+$/.test(id))) return
      const first = latest.current(barOfRef.current(p)!)[0]
      if (!first) return
      openEvents()
      useEventsUi.setState({ selected: (clusterOf(first, useEventsData.getState().events) ?? first).id })
    }
    chart.subscribeClick(onClick)
    return () => chart.unsubscribeClick(onClick)
  }, [chart])

  // Jump: keep the visible width and centre the event's bar; wait for the bar when it is not loaded yet.
  useEffect(() => {
    if (!jump) return
    const i = base.index.get(jump.id) ?? -1
    if (i < 0) return
    const ts = chart.timeScale()
    const r = ts.getVisibleLogicalRange()
    const w = r ? r.to - r.from : 120
    ts.setVisibleLogicalRange({ from: i - w / 2, to: i + w / 2 })
    useEventsUi.setState({ jump: null })
  }, [jump, base, chart])

  // Stripe from the deal's bar to the bar of the day it became public.
  const chosen = selected ? all.find((e) => e.id === selected) : undefined
  const stripeEvent = tipEvents.find((e) => e.deal) ?? (chosen?.deal ? chosen : undefined)
  const from = stripeEvent ? (base.index.get(stripeEvent.id) ?? -1) : -1
  const to = stripeEvent?.deal ? candleIndex(base.dates, base.times, { date: stripeEvent.deal.published }, intraday) : -1
  const wanted = from >= 0 && to > from
  // Follows scrolling and zooming only while there is a stripe to move.
  const [, redraw] = useState(0)
  useEffect(() => {
    if (!wanted) return
    const ts = chart.timeScale()
    const again = () => redraw((n) => n + 1)
    ts.subscribeVisibleLogicalRangeChange(again)
    ts.subscribeSizeChange(again)
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(again)
      ts.unsubscribeSizeChange(again)
    }
  }, [chart, wanted])
  let stripe: { left: number; width: number } | null = null
  if (wanted) {
    const ts = chart.timeScale()
    const a = from >= 0 ? ts.timeToCoordinate(base.times[from] as Time) : null
    const b = to > from ? ts.timeToCoordinate(base.times[to] as Time) : null
    if (a !== null && b !== null) stripe = { left: a, width: b - a }
  }

  const width = chart.timeScale().width()
  const height = chart.paneSize(0).height
  // The box grows with its entries, so it is placed by its measured size: beside the mouse, flipped and then pushed
  // back inside the chart where it would run over an edge.
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 280, h: 160 })
  useLayoutEffect(() => {
    const b = boxRef.current
    if (b && (b.offsetWidth !== box.w || b.offsetHeight !== box.h)) setBox({ w: b.offsetWidth, h: b.offsetHeight })
  })
  const boxLeft = tip ? (tip.x + GAP + box.w > width ? Math.max(0, tip.x - GAP - box.w) : tip.x + GAP) : 0
  const boxTop = tip ? Math.max(0, Math.min(tip.y + GAP + box.h > height ? tip.y - GAP - box.h : tip.y + GAP, height - box.h)) : 0
  // The bar's own calendar day (exchange zone, as the markers use it), not the UTC day of its stamp.
  const dayOf = (date: string | undefined) => (date ? new Date(date + 'T12:00:00Z').toLocaleDateString(locale(), { dateStyle: 'medium', timeZone: 'UTC' }) : '')
  const day = tip ? dayOf(base.dates[base.times.indexOf(tip.time)]) : ''
  // Phone: the chosen entry (tapped bar or list) shows its bar's events in a card at the bottom of the chart.
  const selectedIndex = selected ? (base.index.get(selected) ?? -1) : -1
  const cardEvents = IS_MOBILE && selectedIndex >= 0 ? eventsAt(base.times[selectedIndex]) : []
  return (
    <>
      {stripe && <div className="pointer-events-none absolute inset-y-0 bg-white/5" style={{ left: stripe.left, width: stripe.width }} />}
      {tip && tipEvents.length > 0 && (
        <div
          ref={boxRef}
          className="pointer-events-none absolute z-40 w-max max-w-[280px] space-y-1.5 rounded-lg border border-line bg-panel/95 px-2.5 py-2 text-xs shadow-2xl shadow-black/50 backdrop-blur"
          style={{ left: boxLeft, top: boxTop }}
        >
          <EventStack events={tipEvents} day={day} />
        </div>
      )}
      {cardEvents.length > 0 && (
        <EventCard
          events={cardEvents}
          day={dayOf(base.dates[selectedIndex])}
          bottom={chart.timeScale().height() + 8}
          right={chart.priceScale('right').width() + 8}
          onAll={() => window.dispatchEvent(new Event('kandleos:events'))}
          onClose={() => useEventsUi.setState({ selected: null })}
        />
      )}
    </>
  )
}
