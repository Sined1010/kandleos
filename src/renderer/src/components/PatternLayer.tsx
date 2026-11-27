// The chart side of the candlestick patterns: finds the patterns at the last finished bars, draws frame and pill
// (lib/patternMarks.ts) and shows the explanation card – beside the frame on hover or click (PC), at the bottom of the
// chart on a tap (phone).
import type { IChartApi, ISeriesApi, MouseEventParams, Time } from 'lightweight-charts'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { phaseAt } from '../../../shared/market'
import { barsKey, currentPatterns, findPatterns, framePieces, lookBack, PATTERN_NAME, patternGroup, regularBars, trendAt } from '../../../shared/patterns'
import { TF_SECONDS, type Candle, type Timeframe } from '../../../shared/types'
import { onChartTap, TAP, type TapHandler } from '../lib/chartTap'
import { eventNear } from '../lib/patternHit'
import { PatternMarks, type PatternMark } from '../lib/patternMarks'
import { IS_MOBILE } from '../lib/platform'
import { useEventsUi } from '../store/eventsUi'
import { usePatternsUi } from '../store/patternsUi'
import { useBack } from '../../../mobile/useBack'
import PatternCard, { type PatternItem } from './PatternCard'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  data: Candle[]
  symbol: string
  timeframe: Timeframe
  timeZone?: string
  extended: boolean
  lastRunning: boolean
}

/** The current patterns, shown with one frame, one pill and one card. */
interface Group {
  from: number
  to: number
  hi: number
  lo: number
  /** Framed pieces (split where shaded pre/post bars lie between). */
  pieces: { from: number; to: number }[]
  /** Bar times the wide pill may reach: the pattern bars and two on each side, for keeping clear of event badges. */
  near: number[]
  items: PatternItem[]
}

const GAP = 10
/** Phone: how far (px) a tap may miss a pattern's bar. */
const FINGER = 16
const isPattern = (id: unknown): id is string => typeof id === 'string' && id.startsWith('pat:')

/** Phone: the card at the bottom of the chart, as wide as the chart (width auto between left-2 and the price scale). */
function PhoneCard(p: { group: Group; step: number; bottom: number; right: number; onClose(): void }) {
  useBack('pattern-card', true, p.onClose)
  return <PatternCard items={p.group.items} step={p.step} className="absolute left-2 z-30 max-h-[60vh] overflow-y-auto" style={{ bottom: p.bottom, right: p.right, width: 'auto' }} onClose={p.onClose} />
}

export default function PatternLayer({ chart, series, data, symbol, timeframe, timeZone, extended, lastRunning }: Props) {
  const step = TF_SECONDS[timeframe]
  const intraday = step < 86400
  const key = barsKey(data, lastRunning)

  // Recounted when the bars change (barsKey), not on every tick of the running bar. All current patterns lie within
  // the last few bars: one frame, one pill, one card (two pills side by side would cover each other).
  const groups = useMemo<Group[]>(() => {
    const idx = regularBars(data, (t) => phaseAt(symbol, timeZone, t), extended, intraday)
    const bars = idx.map((i) => data[i])
    const last = bars.length - 1 - (lastRunning && idx.at(-1) === data.length - 1 ? 1 : 0)
    if (last < 0) return []
    const hits = findPatterns(bars, last)
    const g = patternGroup(bars, currentPatterns(hits, last))
    if (!g) return []
    const items = g.hits.map<PatternItem>((h) => ({
      hit: h,
      look: lookBack(bars, hits, h.id, last),
      candles: bars.slice(h.start, h.end + 1),
      ago: last - h.end,
      trend: trendAt(bars, h.start - 1) ?? 'down'
    }))
    const pieces = framePieces(idx, g.start, g.end).map(([a, b]) => ({ from: data[a].time, to: data[b].time }))
    const near = data.slice(Math.max(0, idx[g.start] - 2), idx[g.end] + 3).map((c) => c.time)
    return [{ from: g.from, to: g.to, hi: g.hi, lo: g.lo, pieces, near, items }]
    // eslint-disable-next-line react-hooks/exhaustive-deps -- data changes on every tick; barsKey says when to recount
  }, [key, extended, symbol, timeframe, timeZone, intraday])

  const sides = useEventsUi((s) => s.badgeSides)
  const marks = useMemo<PatternMark[]>(
    () =>
      groups.map((g) => {
        const taken = new Set<string>()
        for (const time of g.near) {
          const s = sides[time]
          if (s) taken.add(s)
        }
        const below = taken.has('below') || taken.has('both')
        const above = taken.has('above') || taken.has('both')
        return {
          id: `pat:${g.to}`,
          pieces: g.pieces,
          hi: g.hi,
          lo: g.lo,
          label: [...new Set(g.items.map((i) => PATTERN_NAME[i.hit.id]))].join(' · '),
          side: below && !above ? 'above' : 'below',
          outer: below && above
        }
      }),
    [groups, sides]
  )

  const prim = useRef<PatternMarks | null>(null)
  useEffect(() => {
    const p = new PatternMarks()
    series.attachPrimitive(p)
    prim.current = p
    return () => {
      prim.current = null
      // The chart may already be removed when the tab closes.
      try {
        series.detachPrimitive(p)
      } catch {}
    }
  }, [series])
  useEffect(() => prim.current?.setMarks(marks), [marks])

  useEffect(() => {
    const ids = [...new Set(groups.flatMap((g) => g.items.map((i) => i.hit.id)))]
    usePatternsUi.setState({ current: ids, span: groups[0] ? { from: groups[0].from, to: groups[0].to } : null })
  }, [groups])
  useEffect(() => () => usePatternsUi.setState({ current: [], open: null, span: null }), [])
  useEffect(() => usePatternsUi.setState({ open: null }), [symbol, timeframe])

  const open = usePatternsUi((s) => s.open)
  const groupsRef = useRef(groups)
  groupsRef.current = groups

  // PC: hover shows the card, a click keeps it until Esc or a click beside it. Event boxes open only over their own
  // badge (EventLayer), so the object under the mouse decides and hovering never opens both.
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    if (IS_MOBILE) return
    const onMove = (p: MouseEventParams<Time>) => {
      const id = p.hoveredObjectId
      setHover(isPattern(id) ? Number(id.slice(4)) : null)
    }
    const onClick = (p: MouseEventParams<Time>) => {
      const id = p.hoveredObjectId
      if (isPattern(id)) usePatternsUi.setState({ open: { time: Number(id.slice(4)), pinned: true } })
      else if (usePatternsUi.getState().open) usePatternsUi.setState({ open: null })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && usePatternsUi.getState().open) usePatternsUi.setState({ open: null })
    }
    chart.subscribeCrosshairMove(onMove)
    chart.subscribeClick(onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      chart.unsubscribeCrosshairMove(onMove)
      chart.unsubscribeClick(onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [chart])

  // Phone: a tap near a pattern's bars opens its card, unless the bar has an event badge (its card offers the pattern).
  useEffect(() => {
    if (!IS_MOBILE) return
    const onTap: TapHandler = (p, taken) => {
      // An event, a line alarm's clock or a line took the tap (chartTap): only close the card.
      if (taken) {
        if (usePatternsUi.getState().open) usePatternsUi.setState({ open: null })
        return false
      }
      const ts = chart.timeScale()
      const x = p.point?.x
      // The pill counts too: at the newest bars it is pushed left of them, out of the finger's reach.
      const pill = p.point && prim.current?.hitTest(p.point.x, p.point.y)?.externalId
      const g =
        groupsRef.current.find((g) => pill === `pat:${g.to}`) ??
        (x === undefined
          ? undefined
          : groupsRef.current.find((g) =>
              g.pieces.some((p) => {
                const a = ts.timeToCoordinate(p.from as Time)
                const b = ts.timeToCoordinate(p.to as Time)
                return a !== null && b !== null && x >= a - FINGER && x <= b + FINGER
              })
            ))
      // A tap near a bar with events is the event's (EventLayer uses the same finger rule); its card offers the pattern.
      const badgeTimes = Object.keys(useEventsUi.getState().badgeSides).map(Number)
      const toX = (t: number) => ts.timeToCoordinate(t as Time)
      if (g && !eventNear(badgeTimes, toX, x!, FINGER)) {
        usePatternsUi.setState({ open: { time: g.to, pinned: true } })
        return true
      }
      usePatternsUi.setState({ open: null })
      return false
    }
    return onChartTap(chart, TAP.PATTERN, onTap)
  }, [chart])
  // An event chosen (tap or list) closes the pattern card: one card at a time.
  const eventChosen = useEventsUi((s) => s.selected)
  useEffect(() => {
    if (eventChosen) usePatternsUi.setState({ open: null })
  }, [eventChosen])

  // A kept card whose patterns changed with a new bar (another end bar) closes, so hovering works again.
  useEffect(() => {
    if (open && !groups.some((g) => g.to === open.time)) usePatternsUi.setState({ open: null })
  }, [groups, open])

  const shownTime = open?.time ?? hover
  const shown = shownTime === null ? undefined : groups.find((g) => g.to === shownTime)

  // Follows scrolling and zooming while a card is open beside its frame.
  const [, redraw] = useState(0)
  useEffect(() => {
    if (!shown || IS_MOBILE) return
    const ts = chart.timeScale()
    const again = () => redraw((n) => n + 1)
    ts.subscribeVisibleLogicalRangeChange(again)
    ts.subscribeSizeChange(again)
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(again)
      ts.unsubscribeSizeChange(again)
    }
  }, [chart, shown])

  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 300, h: 220 })
  useLayoutEffect(() => {
    const b = boxRef.current
    if (b && (b.offsetWidth !== box.w || b.offsetHeight !== box.h)) setBox({ w: b.offsetWidth, h: b.offsetHeight })
  })

  if (!shown) return null
  if (IS_MOBILE)
    return (
      <PhoneCard
        group={shown}
        step={step}
        bottom={chart.timeScale().height() + 8}
        right={chart.priceScale('right').width() + 8}
        onClose={() => usePatternsUi.setState({ open: null })}
      />
    )
  // Beside the newest framed piece, top-aligned with it: right where there is room, else left; always inside the chart.
  const ts = chart.timeScale()
  const piece = shown.pieces.at(-1) ?? shown
  const a = ts.timeToCoordinate(piece.from as Time)
  const b = ts.timeToCoordinate(piece.to as Time)
  if (a === null || b === null) return null
  const half = Math.max(3, ts.options().barSpacing / 2) + 2
  const top0 = (series.priceToCoordinate(shown.hi) ?? 0) - 6
  const width = ts.width()
  const height = chart.paneSize(0).height
  const beside = b + half + GAP + box.w <= width ? b + half + GAP : a - half - GAP - box.w
  const left = Math.max(0, Math.min(beside, width - box.w))
  const top = Math.max(0, Math.min(top0, height - box.h))
  return (
    <div ref={boxRef} className="absolute z-40" style={{ left, top }}>
      <PatternCard items={shown.items} step={step} onClose={open?.pinned ? () => usePatternsUi.setState({ open: null }) : undefined} className={open?.pinned ? 'relative' : 'pointer-events-none relative'} />
    </div>
  )
}
