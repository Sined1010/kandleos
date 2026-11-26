import type { IChartApi, ISeriesApi, Logical, MouseEventParams, Time } from 'lightweight-charts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { barZone, futureTimes } from '../../../shared/calendar'
import { CLICKS } from '../../../shared/drawings'
import { locale, msg, t } from '../../../shared/i18n'
import { FIB_LEVELS, LINE_HORIZON, lineParts, linePrice } from '../../../shared/lineAlarm'
import { formatPrice } from '../lib/format'
import { clockAt, lineTable } from '../lib/lineAlarms'
import { logicalToTime, timeToLogical } from '../../../shared/candles'
import { TF_MONTHS, TF_SECONDS, type Candle } from '../../../shared/types'
import {
  channelOffset,
  fanPrice,
  FIB_EXT_LEVELS,
  FIB_FAN_LEVELS,
  FIB_TIME_ZONES,
  fibExtPrice,
  isTrough,
  measureLabel,
  rayEnd,
  sinePrice
} from '../lib/geometry'
import { anchoredVwap, anchorIndex } from '../lib/indicators'
import { BOX_BARS, boxNumbers, boxState, dragBox, newBox, type BoxDrawing } from '../lib/positionBox'
import { magnetMode, snapPoint, type SnapKind } from '../lib/magnet'
import { THEME } from '../lib/theme'
import { IS_MOBILE } from '../lib/platform'
import { mainPanePoint, onChartTap, TAP } from '../lib/chartTap'
import { LINE_REACH, nearestPoint, pickAt, pillLeft } from '../lib/linePick'
import { aimAt, pinchRange, type PinchStart } from '../lib/touchAim'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Crosshair, Trash2 } from 'lucide-react'
import { drawingsKey, useQuotes, useStore, type Drawing, type Point, type Tool } from '../store/useStore'
import { alarmClock, isArmed } from '../../../shared/alarms'

const FIB_COLORS = ['#787b86', '#f23645', '#ff9800', '#4caf50', '#089981', '#00bcd4', '#787b86']
const COLOR = THEME.drawing
const SELECTED = THEME.selected
// Violet, not amber: amber belongs to the AI forecast alone.
const AVWAP = '#a78bfa'
// Same violet as the price alarms in ChartArea.
const ALARM = '#a78bfa'
// Position box: the entry line, and the whole box once its time ran out.
const BOX_ENTRY = '#cbd5e1'
const BOX_GREY = '#64748b'
// Magnet: how near (px) a point must come to a bar's price to snap, and the mark that shows where it snapped.
const SNAP_REACH = IS_MOBILE ? 20 : 8
const SNAP_COLOR = '#06b6d4'
// shortcut: label width estimated for the 11 px bold digits and letters; measure with getBBox if labels get clipped.
const labelWidth = (label: string) => label.length * 6.6
const SNAP_LABEL: Record<SnapKind, string> = { open: msg('Eröffnung'), high: msg('Hoch'), low: msg('Tief'), close: msg('Schluss') }
const WAVE_COLORS = { elliott: '#ab47bc', abc: '#ff7043', triangle: '#42a5f5', wxy: '#ec407a', wxyxz: '#ffca28' }
const WAVE_LABELS = {
  elliott: ['0', '1', '2', '3', '4', '5'],
  abc: ['0', 'A', 'B', 'C'],
  triangle: ['0', 'A', 'B', 'C', 'D', 'E'],
  wxy: ['0', 'W', 'X', 'Y'],
  wxyxz: ['0', 'W', 'X', 'Y', 'X', 'Z']
}
// Choices in the bar under a selected drawing; null goes back to the tool's own colours.
// A function, so the names follow a language switch.
const palette = (): { color: string | null; name: string }[] => [
  { color: null, name: t('Standard') },
  { color: '#e2e8f0', name: t('Weiß') },
  { color: '#f43f5e', name: t('Rot') },
  { color: '#ff9800', name: t('Orange') },
  { color: '#ffca28', name: t('Gelb') },
  { color: '#14b8a6', name: t('Grün') },
  { color: '#42a5f5', name: t('Blau') },
  { color: '#ab47bc', name: t('Violett') }
]
const TEXT_SIZE = 13
const TEXT_SIZES = [11, 13, 16, 20, 28]
const isWave = (type: string): type is keyof typeof WAVE_LABELS => Object.hasOwn(WAVE_LABELS, type)
const NO_DRAWINGS: Drawing[] = []
// How far right of the last candle drawings follow the trading calendar; beyond that, even steps.
const FUTURE_BARS = 500
// Phone: how far (manhattan px) a finger may wobble and still be a tap, as lightweight-charts counts it.
const TAP_SLOP = 5
// PC: how far (manhattan px) the mouse may move between press and release and still be a click.
const CLICK_SLOP = 3


/** 'move' drags the whole drawing, a number drags that point. */
type Handle = 'move' | number
interface DragState {
  /** The finger (or mouse) that started it; others neither move it nor end it. */
  pointerId: number
  /** Where it went down (client px), and whether it has moved past a tap's wobble since. */
  start: { x: number; y: number }
  moved: boolean
  handle: Handle
  from: { logical: number; price: number }
  orig: Drawing
  current: Drawing
}

const pointsOf = (d: Drawing): Point[] => ('points' in d ? d.points : 'p1' in d ? [d.p1, d.p2] : [])
const withPoints = (d: Drawing, pts: Point[]): Drawing =>
  'points' in d ? { ...d, points: pts } : 'p1' in d ? { ...d, p1: pts[0], p2: pts[1] } : d

function build(tool: Exclude<Tool, 'cursor'>, id: string, pts: Point[]): Drawing {
  if (tool === 'hline') return { id, type: tool, price: pts[0].price }
  if (tool === 'vline') return { id, type: tool, time: pts[0].time }
  if (tool === 'trend' || tool === 'fib') return { id, type: tool, p1: pts[0], p2: pts[1] ?? pts[0] }
  if (tool === 'text') return { id, type: tool, points: pts, text: '' }
  return { id, type: tool, points: pts }
}

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  data: Candle[]
  /** Exchange time zone of the symbol (stocks), for the trading calendar right of the last candle. */
  timeZone?: string
}

/** SVG layer over the main pane. Drawings are stored as {time, price} and projected to pixels on every render. */
export default function DrawingOverlay({ chart, series, data, timeZone }: Props) {
  const symbol = useStore((s) => s.symbol)
  const timeframe = useStore((s) => s.timeframe)
  const drawings = useStore((s) => s.drawings[drawingsKey(s)] ?? NO_DRAWINGS)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const addDrawing = useStore((s) => s.addDrawing)
  const removeDrawing = useStore((s) => s.removeDrawing)
  const updateDrawing = useStore((s) => s.updateDrawing)
  const listKey = useStore(drawingsKey)
  const allAlarms = useStore((s) => s.alarms)
  const toggleLineAlarm = useStore((s) => s.toggleLineAlarm)
  const armBoxAlarms = useStore((s) => s.armBoxAlarms)
  const magnet = useStore((s) => s.magnet)
  // Where the magnet snapped the point under the mouse or crosshair (chart px), with its label.
  const [snapMark, setSnapMark] = useState<{ x: number; y: number; label: string } | null>(null)
  useEffect(() => setSnapMark(null), [tool])
  // PC: the position box under the mouse shows its full labels (variant "quiet, full on hover").
  const [hoverBox, setHoverBox] = useState<string | null>(null)
  const setAlarmUntil = useStore((s) => s.setAlarmUntil)
  const quote = useQuotes((s) => s.quotes[symbol])
  const alarmsOf = (id: string) => allAlarms.filter((a) => a.line?.key === listKey && a.line.drawing === id)
  // End handle being dragged (shown before it is stored), and why the last alarm switch did nothing.
  const [untilDrag, setUntilDrag] = useState<{ id: string; time: number } | null>(null)
  const [alarmHint, setAlarmHint] = useState('')
  useEffect(() => setAlarmHint(''), [selectedId])
  const svgRef = useRef<SVGSVGElement>(null)
  // Clicked points of the drawing in progress, plus the point under the mouse for the preview.
  const [draft, setDraft] = useState<Point[]>([])
  const [hover, setHover] = useState<Point | null>(null)
  // Phone: where the crosshair is (chart px).
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null)
  // Phone: fingers on the overlay (x in chart px) and the view when a second one came down.
  const pinch = useRef<{ fingers: Map<number, number>; start?: PinchStart }>({ fingers: new Map() })
  // Edits are previewed locally and committed on mouseup, so the store file is written once per drag.
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  // Text drawing whose input field is open: right after placing it, or after a double-click.
  const [editing, setEditing] = useState<string | null>(null)
  const [, redraw] = useState(0)
  const times = useMemo(() => data.map((c) => c.time), [data])
  const step = TF_SECONDS[timeframe]
  // Month bars differ in length, so their step is only a rough guide (anchorIndex).
  const exact = !TF_MONTHS[timeframe]
  // Bar times plus the coming bars on the exchange's trading calendar. Points right of the last candle are
  // stored as real trading times (not "last bar + n × step", which lands in nights and weekends), so a
  // drawing keeps its place when the bars change, e.g. when pre-market and after-hours candles are added.
  // Rebuilt only when a bar is added, not on every tick of the open bar.
  const lastTime = times[times.length - 1]
  const axis = useMemo(
    () => (times.length ? [...times, ...futureTimes(times, step, FUTURE_BARS, timeZone, TF_MONTHS[timeframe])] : times),
    [times.length, lastTime, step, timeZone, timeframe]
  )
  // Month bars differ in length: the last one ends where the calendar starts the next one, not after 30 days.
  const anchorStep = exact ? step : (axis[times.length] ?? lastTime + step) - lastTime

  // Lightweight Charts has no event for price-scale changes (axis drag, autoscale), so compare a
  // cheap viewport signature every frame and re-render only when it actually moved.
  useEffect(() => {
    let raf = 0
    let last = ''
    const loop = () => {
      const r = chart.timeScale().getVisibleLogicalRange()
      const sig = [
        r?.from,
        r?.to,
        series.coordinateToPrice(0),
        series.coordinateToPrice(100),
        chart.timeScale().width(),
        chart.panes()[0]?.getHeight()
      ].join()
      if (sig !== last) {
        last = sig
        // The chart paints in this same frame; a normal update would land one frame later and the drawings trail behind.
        flushSync(() => redraw((n) => n + 1))
      }
      raf = requestAnimationFrame(loop)
    }
    // From the next frame on: flushSync inside this effect would only warn ("called from inside a lifecycle method").
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [chart, series])

  useEffect(() => {
    setDraft([])
    setHover(null)
    setAim(null)
  }, [tool, symbol])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest?.('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'Escape') {
        setTool('cursor')
        dragRef.current = null
        setDrag(null)
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) removeDrawing(selectedId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, setTool, removeDrawing])

  const logicalOf = (time: number) => timeToLogical(axis, time, step)
  const toY = (price: number) => series.priceToCoordinate(price)
  // logicalToCoordinate gives 0 between bars, so fractional positions are interpolated between the two neighbours.
  // Points fall between bars after a timeframe switch (a 30m time on daily bars), not only for the time tools.
  const xAt = (logical: number) => {
    const base = Math.floor(logical)
    const a = chart.timeScale().logicalToCoordinate(base as Logical)
    const b = chart.timeScale().logicalToCoordinate((base + 1) as Logical)
    return a === null || b === null ? null : a + (logical - base) * (b - a)
  }
  const toX = (time: number) => (times.length ? xAt(logicalOf(time)) : null)
  const fmt = (price: number) => series.priceFormatter().format(price)
  const dateLabel = (time: number) =>
    new Date(time * 1000).toLocaleString(locale(), {
      dateStyle: 'short',
      timeStyle: step < 86400 ? 'short' : undefined,
      // Day and longer bars: the date they carry, as on the time axis (ChartArea).
      timeZone: step < 86400 ? undefined : barZone(times.slice(-50), timeZone ?? 'UTC')
    })

  // Anchored VWAP values per drawing; computed again only for new bars or a moved anchor, not every frame.
  const avwapCache = useRef(new Map<string, { data: Candle[]; at: number; values: number[] }>())
  const avwapOf = (id: string, at: number) => {
    const hit = avwapCache.current.get(id)
    if (hit && hit.data === data && hit.at === at) return hit.values
    const values = anchoredVwap(data, at)
    avwapCache.current.set(id, { data, at, values })
    return values
  }
  // Deleted drawings and another symbol's drawings leave the cache, so it does not keep old bar arrays alive.
  useEffect(() => {
    const ids = new Set(drawings.map((d) => d.id))
    for (const id of avwapCache.current.keys()) if (!ids.has(id)) avwapCache.current.delete(id)
  }, [drawings])

  const logicalAt = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const logical = chart.timeScale().coordinateToLogical(e.clientX - rect.left)
    const price = series.coordinateToPrice(e.clientY - rect.top)
    return logical === null || price === null || !times.length ? null : { logical, price }
  }
  /** The point under the pointer after the magnet for this drawing type (Ctrl held frees it); marks where it snapped. */
  const snapped = (e: { clientX: number; clientY: number; ctrlKey?: boolean }, type: Drawing['type']) => {
    const at = logicalAt(e)
    if (!at) return null
    const top = svgRef.current!.getBoundingClientRect().top
    const s = snapPoint({ ...at, y: e.clientY - top }, data, toY, SNAP_REACH, magnetMode(type, magnet, !!e.ctrlKey))
    const x = s.kind ? xAt(s.logical) : null
    const y = s.kind ? toY(s.price) : null
    setSnapMark(s.kind && x !== null && y !== null ? { x, y, label: `${t(SNAP_LABEL[s.kind])} ${fmt(s.price)}` } : null)
    return { logical: s.logical, price: s.price }
  }
  const pointAt = (e: { clientX: number; clientY: number; ctrlKey?: boolean }): Point | null => {
    const at = tool === 'cursor' ? logicalAt(e) : snapped(e, tool)
    return at && { time: logicalToTime(axis, at.logical, step), price: at.price }
  }

  const startDrag = (e: React.PointerEvent, d: Drawing, handle: Handle) => {
    // A second finger is zooming: it ends a drag (window listener below) and never starts one.
    if (!e.isPrimary) return
    e.stopPropagation()
    e.preventDefault()
    select(d.id)
    const from = logicalAt(e)
    if (!from) return
    dragRef.current = { pointerId: e.pointerId, start: { x: e.clientX, y: e.clientY }, moved: false, handle, from, orig: d, current: d }
    setDrag(dragRef.current)
  }

  // The "now 156.05" pill beside a line alarm's clock, per `drawingId|part`: when it was started (it folds away on its
  // own, index.css), and the one the mouse holds open on the PC.
  const [pills, setPills] = useState<Record<string, number>>({})
  const [heldPill, setHeldPill] = useState<string | null>(null)
  const showPill = (keys: string[]) => {
    if (!keys.length) return
    const at = Date.now()
    setPills((p) => ({ ...p, ...Object.fromEntries(keys.map((k) => [k, at])) }))
    setTimeout(() => setPills((p) => Object.fromEntries(Object.entries(p).filter(([, t]) => t > at))), 3600)
  }
  const showPillRef = useRef(showPill)
  showPillRef.current = showPill
  /** The pills of every armed line of a drawing, e.g. after it was moved and its alarms set again. */
  const pillsOf = (id: string) =>
    useStore
      .getState()
      .alarms.filter((a) => a.line?.drawing === id && isArmed(a))
      .map((a) => `${id}|${a.line!.part}`)

  /** Points marked in the svg (clocks: data-clock, grips: data-grip) with their data-x/data-y. */
  const marked = (attr: 'clock' | 'grip') =>
    [...(svgRef.current?.querySelectorAll<SVGElement>(`[data-${attr}]`) ?? [])].map((el) => ({
      key: el.dataset[attr]!,
      x: Number(el.dataset.x),
      y: Number(el.dataset.y)
    }))
  /** Phone: a clock in finger reach selects its drawing and shows the value. */
  const tapClock = (x: number, y: number) => {
    const key = nearestPoint(marked('clock'), x, y, LINE_REACH)
    if (key === null) return false
    select(key.split('|')[0])
    showPillRef.current([key])
    return true
  }
  /** Phone: the nearest drawing in finger reach gets selected. */
  const tapLine = (x: number, y: number) => {
    const id = svgRef.current && pickAt(svgRef.current, x, y, LINE_REACH)
    if (id) select(id)
    return !!id
  }
  const tapRef = useRef({ tapClock, tapLine })
  tapRef.current = { tapClock, tapLine }

  // Phone: clocks, then lines, in chartTap's order (after event badges, before event columns and patterns).
  const toolRef = useRef(tool)
  toolRef.current = tool
  useEffect(() => {
    if (!IS_MOBILE) return
    const handler = (which: 'tapClock' | 'tapLine') => (p: MouseEventParams<Time>, taken: boolean) => {
      const pt = mainPanePoint(p)
      return !taken && !!pt && toolRef.current === 'cursor' && tapRef.current[which](pt.x, pt.y)
    }
    const offClock = onChartTap(chart, TAP.CLOCK, handler('tapClock'))
    const offLine = onChartTap(chart, TAP.LINE, handler('tapLine'))
    return () => {
      offClock()
      offLine()
    }
  }, [chart])

  // Window listeners: the pointer may leave the line (or the svg) while dragging.
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      // A grip snaps like a new point; the whole drawing moves freely.
      const at = d.handle === 'move' ? logicalAt(e) : snapped(e, d.orig.type)
      if (!at) return
      // Phone: a finger wobbles on a tap; only a move past that (as lightweight-charts counts a tap) drags.
      // PC: a mouse jitter while clicking is no drag either (a moved box would restart its alarms).
      if (!d.moved && Math.abs(e.clientX - d.start.x) + Math.abs(e.clientY - d.start.y) < (IS_MOBILE ? TAP_SLOP : CLICK_SLOP)) return
      const dPrice = at.price - d.from.price
      // Shift in bar space, not seconds, so a shape keeps its form across weekend/overnight gaps.
      const shiftTime = (t: number) => logicalToTime(axis, logicalOf(t) + at.logical - d.from.logical, step)
      const o = d.orig
      const cursor = { time: logicalToTime(axis, at.logical, step), price: at.price }
      const current: Drawing =
        o.type === 'hline'
          ? { ...o, price: o.price + dPrice }
          : o.type === 'vline'
            ? { ...o, time: shiftTime(o.time) }
            : o.type === 'long' || o.type === 'short'
              ? // The entry grip puts the entry where the (snapped) pointer is; the body moves by the pointer's way.
                dragBox(
                  o,
                  d.handle === 'move' ? 0 : (d.handle as 0 | 1 | 2 | 3),
                  cursor,
                  // The grip shifts by bars from the entry to the (snapped) pointer, so the box stays on whole bars.
                  d.handle === 0 ? (t: number) => logicalToTime(axis, logicalOf(t) + logicalOf(cursor.time) - logicalOf(o.points[0].time), step) : shiftTime,
                  d.handle === 0 ? cursor.price - o.points[0].price : dPrice
                )
            : o.type === 'avwap'
              ? // The anchor only moves along the time axis; its price is never used.
                { ...o, points: [{ time: Math.min(d.handle === 'move' ? shiftTime(o.points[0].time) : cursor.time, lastTime), price: o.points[0].price }] }
              : d.handle === 'move'
              ? withPoints(o, pointsOf(o).map((p) => ({ time: shiftTime(p.time), price: p.price + dPrice })))
              : withPoints(o, pointsOf(o).map((p, i) => (i === d.handle ? cursor : p)))
      dragRef.current = { ...d, moved: true, current }
      setDrag(dragRef.current)
    }
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current
      if (d && e.pointerId !== d.pointerId) return
      if (d && d.current !== d.orig) {
        updateDrawing(d.current)
        // Moving a line sets its alarms again at a new value: show it.
        showPillRef.current(pillsOf(d.orig.id))
      } else if (d && IS_MOBILE && svgRef.current) {
        // Phone: the selected drawing takes the touch, so the chart never sees this tap; handle it here (its clock,
        // or a nearer drawing in the band).
        const r = svgRef.current.getBoundingClientRect()
        const x = e.clientX - r.left
        const y = e.clientY - r.top
        if (!tapRef.current.tapClock(x, y)) tapRef.current.tapLine(x, y)
      }
      dragRef.current = null
      setDrag(null)
      setSnapMark(null)
    }
    // The system took the touch (e.g. a back gesture): drop the drag, the drawing stays where it was.
    const onCancel = () => {
      dragRef.current = null
      setDrag(null)
      setSnapMark(null)
    }
    // A second finger means zooming: drop the drag the same way.
    const onDown = (e: PointerEvent) => {
      if (dragRef.current && e.pointerId !== dragRef.current.pointerId) onCancel()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('pointerdown', onDown, true)
    }
    // Handlers read the live drag via dragRef; the axis only changes on new bars, which is harmless mid-drag.
  }, [dragging])

  const onClick = (e: React.MouseEvent) => {
    // The phone places points with the crosshair button instead (aim below).
    if (!IS_MOBILE) addPoint(pointAt(e))
  }
  const addPoint = (p: Point | null) => {
    if (!p || tool === 'cursor') return
    if (tool === 'long' || tool === 'short') {
      // One click: a box with ATR distances, BOX_BARS wide, its target and stop armed (not on old bars).
      const id = crypto.randomUUID()
      const right = logicalToTime(axis, logicalOf(p.time) + BOX_BARS, step)
      addDrawing(newBox(tool, id, p, data, right))
      const now = alarmClock(quote?.time)
      if (right > now) {
        armBoxAlarms(id, now, quote?.price)
        showPillRef.current(pillsOf(id))
      }
      setTool('cursor')
      select(id)
      return
    }
    // An AVWAP right of the last bar would draw nothing and could not be picked again: it starts at the last bar.
    const pts = [...draft, tool === 'avwap' && times.length ? { ...p, time: Math.min(p.time, lastTime) } : p]
    if (pts.length < CLICKS[tool]) return setDraft(pts)
    const id = crypto.randomUUID()
    addDrawing(build(tool, id, pts))
    if (tool === 'text') setEditing(id)
    setTool('cursor')
  }

  const onMove = (e: React.MouseEvent) => {
    if (IS_MOBILE || tool === 'cursor') return
    const p = pointAt(e)
    if (draft.length) setHover(p)
  }

  // Phone: the finger moves a crosshair that sits above it (touchAim); the round button places the point.
  // Two fingers zoom the time axis instead (the overlay takes all touches while a tool is active).
  const onAim = (e: React.PointerEvent) => {
    if (!IS_MOBILE || tool === 'cursor') return
    const r = svgRef.current!.getBoundingClientRect()
    const p = pinch.current
    if (e.type === 'pointerdown') {
      e.currentTarget.setPointerCapture(e.pointerId)
      p.fingers.set(e.pointerId, e.clientX - r.left)
    } else if (p.fingers.has(e.pointerId)) p.fingers.set(e.pointerId, e.clientX - r.left)
    if (p.fingers.size >= 2) {
      const [x1, x2] = [...p.fingers.values()]
      const gap = Math.max(20, Math.abs(x1 - x2))
      const mid = (x1 + x2) / 2
      const scale = chart.timeScale()
      if (!p.start) {
        const v = scale.getVisibleLogicalRange()
        if (v) p.start = { gap, mid, from: v.from, to: v.to }
        return
      }
      scale.setVisibleLogicalRange(pinchRange(p.start, gap, mid, r.width))
      return
    }
    // A finger left over from a pinch does not move the crosshair.
    if (p.start) return
    const a = aimAt({ x: e.clientX - r.left, y: e.clientY - r.top }, { width: r.width, height: r.height })
    setAim(a)
    const pt = pointAt({ clientX: r.left + a.x, clientY: r.top + a.y })
    if (draft.length) setHover(pt)
  }
  const endFinger = (e: React.PointerEvent) => {
    const p = pinch.current
    p.fingers.delete(e.pointerId)
    if (!p.fingers.size) p.start = undefined
  }
  const placeAim = () => {
    if (!aim) return
    const r = svgRef.current!.getBoundingClientRect()
    addPoint(pointAt({ clientX: r.left + aim.x, clientY: r.top + aim.y }))
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
  }

  const width = chart.timeScale().width()
  const height = chart.panes()[0]?.getHeight() ?? 0
  const drawingMode = tool !== 'cursor'

  /**
   * A position box: target zone (teal) and stop zone (rose) between its left and right edge. Quiet it shows the
   * distances at its right edge; selected (or under the mouse on the PC) the full labels. Reached, the hit side stands
   * out with a check where it was hit; run out, it turns grey.
   */
  const renderBox = (
    d: BoxDrawing,
    xs: number[],
    ys: number[],
    selected: boolean,
    preview: boolean,
    hit: (cursor?: string) => object | null,
    handles: React.ReactNode
  ) => {
    const [xl, , , xr] = xs
    const [ye, yt, yst] = ys
    const mine = alarmsOf(d.id)
    const state = boxState(mine, d, alarmClock(quote?.time))
    const n = boxNumbers(d)
    const grey = state === 'expired'
    const upColor = grey ? BOX_GREY : THEME.up
    const downColor = grey ? BOX_GREY : THEME.down
    const opacity = (side: 'target' | 'stop') => (grey ? 0.08 : state === side ? 0.28 : state === 'running' || state === 'idle' ? 0.16 : 0.07)
    const left = Math.min(xl, xr)
    const w = Math.abs(xr - xl)
    const zone = (y: number) => ({ x: left, y: Math.min(y, ye), width: w, height: Math.abs(y - ye) })
    const sign = (v: number) => (v >= 0 ? '+' : '−')
    const pct = (v: number) => `${sign(v)}${Math.abs(v).toFixed(2)} %`
    const amt = (v: number) => `${sign(v)}${fmt(Math.abs(v))}`
    const ratio = `${n.ratio.toFixed(1)} : 1`
    const full = !preview && (selected || (!IS_MOBILE && hoverBox === d.id))
    // Inside the zone, next to its line: below the line for the upper zone, above it for the lower one.
    const inside = (y: number) => (y < ye ? y + 14 : y - 6)
    // Labels go by the visible part: the right edge may lie past the chart's. A narrow box (often on the phone) puts
    // its full labels left of it.
    const right = Math.min(left + w, width)
    const outside = right - left < 230
    // Left of the box unless the label would run past the chart's left edge: then it starts at that edge.
    const at = (label: string) =>
      !outside ? { x: left + 6, textAnchor: 'start' as const } : left - 6 - labelWidth(label) < 4 ? { x: 4, textAnchor: 'start' as const } : { x: left - 6, textAnchor: 'end' as const }
    const targetLabel = `${t('Ziel')} ${fmt(d.points[1].price)} · ${pct(n.targetPct)} · ${amt(n.targetAbs)}`
    const stopLabel = `${t('Stop')} ${fmt(d.points[2].price)} · ${pct(n.stopPct)} · ${amt(n.stopAbs)}`
    const sideLabel = `${d.type === 'long' ? 'Long' : 'Short'} ${ratio}`
    const halo = { paintOrder: 'stroke' as const, stroke: THEME.bg, strokeWidth: 3, strokeLinejoin: 'round' as const }
    const reached = mine.find((a) => a.triggeredAt !== undefined && (a.line?.part === 'target' || a.line?.part === 'stop'))
    const checkX = reached ? toX(reached.triggeredAt!) : null
    const checkY = reached ? (reached.line!.part === 'target' ? yt : yst) : null
    return (
      <g key={d.id}>
        <rect {...zone(yt)} fill={upColor} fillOpacity={opacity('target')} />
        <rect {...zone(yst)} fill={downColor} fillOpacity={opacity('stop')} />
        <line x1={left} x2={left + w} y1={yt} y2={yt} stroke={upColor} strokeWidth={selected ? 2 : 1} />
        <line x1={left} x2={left + w} y1={yst} y2={yst} stroke={downColor} strokeWidth={selected ? 2 : 1} />
        <line x1={left} x2={left + w} y1={ye} y2={ye} stroke={grey ? BOX_GREY : BOX_ENTRY} strokeWidth={1} />
        {/* PC: the whole box takes the mouse (drag, hover); phone: its three lines, picked by a tap (linePick). */}
        {!preview && !IS_MOBILE && selected && (
          <rect
            x={left}
            y={Math.min(yt, yst)}
            width={w}
            height={Math.abs(yst - yt)}
            fill="transparent"
            data-pick={d.id}
            style={{ pointerEvents: 'all', cursor: 'move' }}
            onPointerDown={(e) => startDrag(e, d, 'move')}
            onPointerEnter={() => setHoverBox(d.id)}
            onPointerLeave={() => setHoverBox((h) => (h === d.id ? null : h))}
          />
        )}
        {/* Not selected (and always on the phone) only the three lines catch the pointer, so the chart pans and shows its crosshair inside. */}
        {hit() &&
          [yt, ye, yst].map((y) => (
            <line
              key={y}
              x1={left}
              x2={left + w}
              y1={y}
              y2={y}
              {...hit()}
              onPointerEnter={IS_MOBILE ? undefined : () => setHoverBox(d.id)}
              onPointerLeave={IS_MOBILE ? undefined : () => setHoverBox((h) => (h === d.id ? null : h))}
            />
          ))}
        {full ? (
          <g fontSize={11} fontWeight={600} pointerEvents="none" {...halo}>
            <text {...at(targetLabel)} y={inside(yt)} fill={upColor}>
              {targetLabel}
            </text>
            <text {...at(stopLabel)} y={inside(yst)} fill={downColor}>
              {stopLabel}
            </text>
            <text {...(outside ? at(sideLabel) : { x: right - 6, textAnchor: 'end' as const })} y={ye - 4} fill={BOX_ENTRY}>
              {sideLabel}
            </text>
          </g>
        ) : (
          <g fontSize={11} fontWeight={600} pointerEvents="none" textAnchor="end" {...halo}>
            <text x={right - 6} y={inside(yt)} fill={upColor}>
              {pct(n.targetPct)}
            </text>
            <text x={right - 6} y={ye - 4} fill={BOX_ENTRY}>
              {ratio}
            </text>
            <text x={right - 6} y={inside(yst)} fill={downColor}>
              {pct(n.stopPct)}
            </text>
          </g>
        )}
        {checkX !== null && checkY !== null && (
          <g pointerEvents="none">
            <circle cx={checkX} cy={checkY} r={8} fill={reached!.line!.part === 'target' ? THEME.up : THEME.down} />
            <path d={`M${checkX - 4} ${checkY}l3 3 5-6`} fill="none" stroke={THEME.bg} strokeWidth={2} />
          </g>
        )}
        {handles}
      </g>
    )
  }

  const render = (d: Drawing, preview = false) => {
    const selected = d.id === selectedId
    // An own colour stays when selected (handles and the style bar show the selection), else it turns cyan.
    const stroke = d.color ?? (selected ? SELECTED : COLOR)
    const lineWidth = selected ? 2 : 1.5
    // A wide transparent twin of each line is the hit area; in cursor mode only these catch the mouse. On the phone only
    // the selected drawing can be grabbed (in finger reach); the others are picked by a tap (linePick) and let the
    // chart pan and zoom right over them.
    const hit = (cursor = 'move') =>
      preview
        ? null
        : {
            'data-pick': d.id,
            stroke: 'transparent',
            strokeWidth: IS_MOBILE && selected ? 2 * LINE_REACH : 10,
            fill: 'none',
            style: { pointerEvents: IS_MOBILE && !selected ? ('none' as const) : ('stroke' as const), cursor },
            onPointerDown: (e: React.PointerEvent) => startDrag(e, d, 'move')
          }

    if (d.type === 'hline') {
      const y = toY(d.price)
      if (y === null) return null
      return (
        <g key={d.id}>
          <line x1={0} x2={width} y1={y} y2={y} stroke={stroke} strokeWidth={selected ? 2 : 1} />
          {hit('ns-resize') && <line x1={0} x2={width} y1={y} y2={y} {...hit('ns-resize')} />}
          <text x={width - 6} y={y - 4} textAnchor="end" fill={stroke} fontSize={11}>
            {fmt(d.price)}
          </text>
        </g>
      )
    }

    if (d.type === 'vline') {
      const x = toX(d.time)
      if (x === null) return null
      return (
        <g key={d.id}>
          <line x1={x} x2={x} y1={0} y2={height} stroke={stroke} strokeWidth={selected ? 2 : 1} />
          {hit('ew-resize') && <line x1={x} x2={x} y1={0} y2={height} {...hit('ew-resize')} />}
          <text x={x + 4} y={height - 6} fill={stroke} fontSize={11}>
            {dateLabel(d.time)}
          </text>
        </g>
      )
    }

    if (d.type === 'avwap') {
      const at = anchorIndex(times, d.points[0].time, anchorStep, exact)
      const color = d.color ?? AVWAP
      // Each AVWAP's note gets its own line, so several notes at the same spot stay readable.
      const noteY = height - 24 - 14 * drawings.filter((x) => x.type === 'avwap').findIndex((x) => x.id === d.id)
      // Clicking the note or the line selects the drawing, so it can be moved, recoloured or deleted.
      const pick = preview ? undefined : (e: React.PointerEvent) => startDrag(e, d, 'move')
      // Placing and dragging keep the anchor on a bar; it can still fall outside them, e.g. on an after-hours
      // bar once pre/after market is switched off. A note keeps it visible and selectable.
      if (at === 'before' || at === 'after') {
        return (
          <text key={d.id} x={8} y={noteY} fill={color} fontSize={11} data-pick={d.id} style={{ pointerEvents: preview || (IS_MOBILE && !selected) ? 'none' : 'all', cursor: 'pointer' }} onPointerDown={pick}>
            {at === 'before' ? t('AVWAP: Anker vor den geladenen Kerzen') : t('AVWAP: Anker nach der letzten Kerze')}
          </text>
        )
      }
      const values = avwapOf(d.id, at)
      const ax = toX(data[at].time)
      if (ax === null) return null
      if (values.every(Number.isNaN)) {
        return (
          <text key={d.id} x={ax + 4} y={noteY} fill={color} fontSize={11} data-pick={d.id} style={{ pointerEvents: preview || (IS_MOBILE && !selected) ? 'none' : 'all', cursor: 'pointer' }} onPointerDown={pick}>
            {t('AVWAP: kein Volumen')}
          </text>
        )
      }
      // Only the bars in view: a line over 10,000 bars would cost as many coordinate look-ups every frame.
      const view = chart.timeScale().getVisibleRange()
      const from = view ? anchorIndex(times, view.from as number, anchorStep, exact) : at
      const to = view ? anchorIndex(times, view.to as number, anchorStep, exact) : data.length - 1
      const first = Math.max(at, typeof from === 'number' ? from - 1 : at)
      const last = to === 'before' ? -1 : to === 'after' ? data.length - 1 : Math.min(data.length - 1, to + 1)
      const line: string[] = []
      // Zoomed far out several bars share a pixel: one point per pixel keeps the line the same and the frame fast.
      let lastX = -Infinity
      for (let j = first; j <= last; j++) {
        const x = Number.isNaN(values[j]) ? null : toX(data[j].time)
        if (x === null || (x - lastX < 1 && j !== last)) continue
        const y = toY(values[j])
        if (y === null) continue
        line.push(`${x},${y}`)
        lastX = x
      }
      const ay = Number.isNaN(values[at]) ? toY(data[at].low) : toY(values[at])
      return (
        <g key={d.id}>
          <polyline points={line.join(' ')} fill="none" stroke={color} strokeWidth={selected ? 2 : 1.5} />
          {!preview && line.length > 1 && <polyline points={line.join(' ')} {...hit()!} />}
          {ay !== null && (
            <>
              {/* Near an edge the label grows inward, so it is not cut off at the last or first bar. */}
              <text x={ax} y={ay - 8} fill={color} fontSize={11} textAnchor={ax > width - 60 ? 'end' : ax < 60 ? 'start' : 'middle'} data-pick={d.id} style={{ pointerEvents: preview || (IS_MOBILE && !selected) ? 'none' : 'all', cursor: 'move' }} onPointerDown={pick}>
                AVWAP {dateLabel(data[at].time)}
              </text>
              {(selected || preview) && (
                <circle
                  cx={ax}
                  cy={ay}
                  r={5}
                  fill={THEME.bg}
                  stroke={color}
                  strokeWidth={1.5}
                  style={{ pointerEvents: preview ? 'none' : 'all', cursor: 'ew-resize' }}
                  onPointerDown={preview ? undefined : (e) => startDrag(e, d, 0)}
                />
              )}
            </>
          )}
        </g>
      )
    }

    const pts = pointsOf(d)
    const xy = pts.map((p) => [toX(p.time), toY(p.price)] as const)
    if (xy.some(([x, y]) => x === null || y === null)) return null
    const xs = xy.map(([x]) => x as number)
    const ys = xy.map(([, y]) => y as number)
    const handles = (selected || preview) &&
      xs.map((x, i) => (
        <g key={`h${i}`}>
          <circle
            cx={x}
            cy={ys[i]}
            r={5}
            fill={THEME.bg}
            stroke={stroke}
            strokeWidth={1.5}
            style={{ pointerEvents: preview ? 'none' : 'all', cursor: 'crosshair' }}
            onPointerDown={preview ? undefined : (e) => startDrag(e, d, i)}
          />
          {/* Phone: a finger-sized grip around the point; it comes after the line's grip, so the point wins. */}
          {IS_MOBILE && !preview && (
            <circle data-grip={i} data-x={x} data-y={ys[i]} cx={x} cy={ys[i]} r={LINE_REACH} fill="transparent" style={{ pointerEvents: 'all' }} onPointerDown={(e) => startDrag(e, d, i)} />
          )}
        </g>
      ))
    if (d.type === 'text') {
      return (
        <g key={d.id}>
          {d.id !== editing && (
            <text
              x={xs[0]}
              y={ys[0]}
              fill={stroke}
              fontSize={d.size ?? TEXT_SIZE}
              fontWeight={600}
              data-pick={preview ? undefined : d.id}
              style={{ pointerEvents: preview || (IS_MOBILE && !selected) ? 'none' : 'all', cursor: 'move', userSelect: 'none' }}
              onPointerDown={preview ? undefined : (e) => startDrag(e, d, 'move')}
              onDoubleClick={preview ? undefined : () => setEditing(d.id)}
            >
              {d.text}
            </text>
          )}
        </g>
      )
    }

    const seg = (a: number, b: number) => ({ x1: xs[a], y1: ys[a], x2: xs[b], y2: ys[b] })

    if (d.type === 'long' || d.type === 'short') return renderBox(d, xs, ys, selected, preview, hit, handles)

    if (d.type === 'trend' || (d.type === 'ray' && pts.length < 2)) {
      return (
        <g key={d.id}>
          <line {...seg(0, 1)} stroke={stroke} strokeWidth={lineWidth} />
          {hit() && <line {...seg(0, 1)} {...hit()} />}
          {handles}
        </g>
      )
    }

    if (d.type === 'ray') {
      // With an armed alarm the part to the right comes from the alarm's own line (alarmLines), not a second one.
      const [ex, ey] = alarmsOf(d.id).some(isArmed) ? [xs[1], ys[1]] : rayEnd(xs[0], ys[0], xs[1], ys[1], width)
      const ray = { x1: xs[0], y1: ys[0], x2: ex, y2: ey }
      return (
        <g key={d.id}>
          <line {...ray} stroke={stroke} strokeWidth={lineWidth} />
          {hit() && <line {...ray} {...hit()} />}
          {handles}
        </g>
      )
    }

    if (d.type === 'rect' || d.type === 'measure') {
      const box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.abs(xs[1] - xs[0]), height: Math.abs(ys[1] - ys[0]) }
      const up = pts[1].price >= pts[0].price
      const color = d.type === 'rect' ? stroke : (d.color ?? (up ? THEME.up : THEME.down))
      return (
        <g key={d.id}>
          <rect {...box} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={selected ? 2 : 1} />
          {hit() && <rect {...box} {...hit()} />}
          {d.type === 'measure' && (
            <>
              <line {...seg(0, 1)} stroke={color} strokeDasharray="4 3" />
              <text x={box.x + box.width / 2} y={up ? box.y - 6 : box.y + box.height + 14} textAnchor="middle" fill={color} fontSize={11} fontWeight={600}>
                {measureLabel(pts[0].price, pts[1].price, logicalOf(pts[1].time) - logicalOf(pts[0].time), fmt)}
              </text>
            </>
          )}
          {handles}
        </g>
      )
    }

    if (d.type === 'channel') {
      if (pts.length < 3) {
        return (
          <g key={d.id}>
            <line {...seg(0, 1)} stroke={stroke} strokeWidth={lineWidth} />
            {handles}
          </g>
        )
      }
      const offset = channelOffset(
        logicalOf(pts[0].time),
        pts[0].price,
        logicalOf(pts[1].time),
        pts[1].price,
        logicalOf(pts[2].time),
        pts[2].price
      )
      const parallel = [toY(pts[0].price + offset), toY(pts[1].price + offset)]
      const middle = [toY(pts[0].price + offset / 2), toY(pts[1].price + offset / 2)]
      if ([...parallel, ...middle].some((v) => v === null)) return null
      const [q0, q1] = parallel as number[]
      const [m0, m1] = middle as number[]
      const second = { x1: xs[0], y1: q0, x2: xs[1], y2: q1 }
      return (
        <g key={d.id}>
          <polygon points={`${xs[0]},${ys[0]} ${xs[1]},${ys[1]} ${xs[1]},${q1} ${xs[0]},${q0}`} fill={stroke} fillOpacity={0.08} />
          <line {...seg(0, 1)} stroke={stroke} strokeWidth={lineWidth} />
          <line {...second} stroke={stroke} strokeWidth={lineWidth} />
          <line x1={xs[0]} y1={m0} x2={xs[1]} y2={m1} stroke={stroke} strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.7} />
          {hit() && <line {...seg(0, 1)} {...hit()} />}
          {hit() && <line {...second} {...hit()} />}
          {handles}
        </g>
      )
    }

    if (d.type === 'fibext') {
      const path = xs.map((x, i) => `${x},${ys[i]}`).join(' ')
      const guide = (
        <>
          <polyline points={path} fill="none" stroke={stroke} strokeWidth={1} strokeDasharray="4 4" />
          {hit() && <polyline points={path} {...hit()} />}
        </>
      )
      if (pts.length < 3)
        return (
          <g key={d.id}>
            {guide}
            {handles}
          </g>
        )
      // Targets start at the pullback C and reach as far right as the pattern A → C is wide.
      const left = xs[2]
      const right = xs[2] + Math.max(40, Math.abs(xs[2] - xs[0]))
      return (
        <g key={d.id}>
          {FIB_EXT_LEVELS.map((lvl, i) => {
            const price = fibExtPrice(pts[0].price, pts[1].price, pts[2].price, lvl)
            const y = toY(price)
            if (y === null) return null
            const color = d.color ?? FIB_COLORS[i]
            return (
              <g key={lvl}>
                <line x1={left} x2={right} y1={y} y2={y} stroke={color} strokeWidth={selected ? 2 : 1} />
                {hit() && <line x1={left} x2={right} y1={y} y2={y} {...hit()} />}
                <text x={right + 4} y={y + 3} fill={color} fontSize={10}>
                  {lvl} ({fmt(price)})
                </text>
              </g>
            )
          })}
          {guide}
          {handles}
        </g>
      )
    }

    if (d.type === 'fibfan') {
      return (
        <g key={d.id}>
          {FIB_FAN_LEVELS.map((ratio, i) => {
            const through = toY(fanPrice(pts[0].price, pts[1].price, ratio))
            if (through === null) return null
            const [ex, ey] = rayEnd(xs[0], ys[0], xs[1], through, width)
            const color = ratio ? (d.color ?? FIB_COLORS[i + 1]) : stroke
            const ray = { x1: xs[0], y1: ys[0], x2: ex, y2: ey }
            return (
              <g key={ratio}>
                <line {...ray} stroke={color} strokeWidth={selected ? 2 : 1} />
                {hit() && <line {...ray} {...hit()} />}
                {ratio > 0 && (
                  <text x={xs[1] + 4} y={through - 3} fill={color} fontSize={10}>
                    {ratio}
                  </text>
                )}
              </g>
            )
          })}
          {handles}
        </g>
      )
    }

    if (d.type === 'fibtime') {
      const start = logicalOf(pts[0].time)
      const unit = logicalOf(pts[1].time) - start
      return (
        <g key={d.id}>
          {unit !== 0 &&
            FIB_TIME_ZONES.map((k) => {
              const x = xAt(start + k * unit)
              if (x === null || x < 0 || x > width) return null
              return (
                <g key={k}>
                  <line x1={x} x2={x} y1={0} y2={height} stroke={stroke} strokeWidth={selected ? 2 : 1} strokeOpacity={k ? 0.7 : 1} />
                  {hit() && <line x1={x} x2={x} y1={0} y2={height} {...hit()} />}
                  <text x={x + 3} y={height - 6} fill={stroke} fontSize={10}>
                    {k}
                  </text>
                </g>
              )
            })}
          {handles}
        </g>
      )
    }

    if (d.type === 'sine') {
      const l1 = logicalOf(pts[0].time)
      const l2 = logicalOf(pts[1].time)
      const half = Math.abs(l2 - l1)
      // From the first click to the right edge of the view, about 32 points per half wave and at most 2000.
      const end = Math.max(l1, l2, chart.timeScale().getVisibleLogicalRange()?.to ?? l2)
      const stepL = half ? Math.max(half / 32, (end - l1) / 2000) : end - l1 || 1
      const curve: string[] = []
      for (let l = l1; l <= end; l += stepL) {
        const x = xAt(l)
        const y = toY(sinePrice(l1, pts[0].price, l2, pts[1].price, l))
        if (x !== null && y !== null) curve.push(`${x},${y}`)
      }
      const path = curve.join(' ')
      return (
        <g key={d.id}>
          <polyline points={path} fill="none" stroke={stroke} strokeWidth={lineWidth} />
          {hit() && <polyline points={path} {...hit()} />}
          {handles}
        </g>
      )
    }

    if (isWave(d.type)) {
      const color = d.color ?? (selected ? SELECTED : WAVE_COLORS[d.type])
      const labels = WAVE_LABELS[d.type]
      const path =xs.map((x, i) => `${x},${ys[i]}`).join(' ')
      return (
        <g key={d.id}>
          <polyline points={path} fill="none" stroke={color} strokeWidth={lineWidth} />
          {hit() && <polyline points={path} {...hit()} />}
          {xs.map((x, i) => (
            <text
              key={`l${i}`}
              x={x}
              y={isTrough(ys, i) ? ys[i] + 16 : ys[i] - 8}
              textAnchor="middle"
              fill={color}
              fontSize={12}
              fontWeight={700}
            >
              ({labels[i]})
            </text>
          ))}
          {handles}
        </g>
      )
    }

    // Fibonacci: level 1 at the first click (swing high), level 0 at the second (swing low).
    const left = Math.min(xs[0], xs[1])
    const right = Math.max(xs[0], xs[1])
    const levels = FIB_LEVELS.map((lvl, i) => {
      const price = pts[1].price + (pts[0].price - pts[1].price) * lvl
      return { lvl, price, y: toY(price), color: d.color ?? FIB_COLORS[i] }
    })
    return (
      <g key={d.id}>
        {levels.slice(1).map((l, i) => {
          const a = levels[i].y
          if (a === null || l.y === null) return null
          return (
            <rect key={`band${i}`} x={left} y={Math.min(a, l.y)} width={right - left} height={Math.abs(a - l.y)} fill={l.color} fillOpacity={0.1} />
          )
        })}
        {levels.map(
          (l) =>
            l.y !== null && (
              <g key={l.lvl}>
                <line x1={left} x2={right} y1={l.y} y2={l.y} stroke={l.color} strokeWidth={selected ? 2 : 1} />
                {hit() && <line x1={left} x2={right} y1={l.y} y2={l.y} {...hit()} />}
                <text x={left + 4} y={l.y - 3} fill={l.color} fontSize={10}>
                  {l.lvl} ({fmt(l.price)})
                </text>
              </g>
            )
        )}
        <line {...seg(0, 1)} stroke={stroke} strokeDasharray="4 4" />
        {hit() && <line {...seg(0, 1)} {...hit()} />}
        {handles}
      </g>
    )
  }

  // Line alarms: each armed line runs on dashed to its end, drawn from the same table the alarm checks, so what is
  // shown is what reports. The end handle sets when the alarms stop (alarmUntil).
  const now = alarmClock(quote?.time)
  const view = chart.timeScale().getVisibleLogicalRange()
  const rightTime = view && axis.length ? logicalToTime(axis, Math.ceil(view.to), step) : now
  const leftTime = view && axis.length ? logicalToTime(axis, Math.floor(view.from), step) : now
  const alarmLines = (d: Drawing) => {
    const mine = alarmsOf(d.id)
    if (!mine.length) return null
    // A channel's lines end at its first two points; the third only sets the width.
    const pts = d.type === 'channel' ? pointsOf(d).slice(0, 2) : pointsOf(d)
    const lastPt = pts.length ? pts.reduce((a, b) => (a.time >= b.time ? a : b)) : null
    const armed = mine.filter(isArmed)
    // A position box draws its own lines and shows reached or run out itself; it only runs on dashed past its right
    // edge while it has no end, and its right edge is the end handle.
    const boxD = d.type === 'long' || d.type === 'short'
    if (!armed.length) {
      if (boxD) return null
      // Reached or run out: a grey clock at the drawing until it is armed again or switched off.
      const x = lastPt ? toX(lastPt.time) : width - 24
      const y = lastPt ? toY(lastPt.price) : d.type === 'hline' ? toY(d.price) : null
      return x === null || y === null ? null : (
        <text key={`al-${d.id}`} x={x + 6} y={y - 6} fontSize={11} opacity={0.45} style={{ filter: 'grayscale(1)', pointerEvents: 'none' }}>
          ⏰
        </text>
      )
    }
    const selected = d.id === selectedId
    const until = untilDrag?.id === d.id ? untilDrag.time : d.alarmUntil
    // Whole minutes and a table to the end (or a year from today), so the cached table holds while panning.
    const minute = Math.floor(now / 60) * 60
    const start = d.type === 'hline' || !lastPt ? minute : Math.min(minute, lastPt.time)
    // While the end handle moves, the stored table (or a year) is reused and only the drawn part follows the handle.
    const tableEnd = (untilDrag?.id === d.id ? undefined : d.alarmUntil) ?? Math.floor(now / 86_400) * 86_400 + LINE_HORIZON
    const end = Math.min(until ?? Infinity, rightTime)
    if (end <= start) return null
    const color = selected ? ALARM : (d.color ?? COLOR)
    const from = boxD ? (until === undefined ? Math.max(start, d.points[3].time) : Infinity) : start
    const samples = from < end ? [from, ...axis.filter((t) => t > Math.max(from, leftTime) && t < end), end] : []
    const lines = armed.flatMap((a) => {
      const k = lineTable(d, a.line!.part, symbol, start, tableEnd, a.line!.tf)
      if (!k) return []
      const xy = samples.flatMap((t) => {
        const x = toX(t)
        const p = linePrice(k, t)
        const y = p === null ? null : toY(p)
        return x === null || y === null ? [] : [[x, y] as const]
      })
      return xy.length || boxD ? [{ id: a.id, part: a.line!.part, k, xy }] : []
    })
    if (!lines.length) return null
    const tip = boxD ? undefined : lines[0].xy[lines[0].xy.length - 1]
    // The clock sits on each alarmed line where it is now (a horizontal line keeps its tag on the price axis).
    const nowX = toX(now)
    const clocks =
      d.type === 'hline' || nowX === null || nowX < 0 || nowX > width
        ? []
        : lines.flatMap((l) => {
            const price = clockAt(l.k, now, until)
            const y = price === null ? null : toY(price)
            return y === null ? [] : [{ key: `${d.id}|${l.part}`, x: nowX, y, price: price! }]
          })
    return (
      <g key={`al-${d.id}`}>
        {/* A horizontal line already spans the chart; it only gets the clock and the end handle. */}
        {d.type !== 'hline' &&
          lines.map((l) => (
            <polyline
              key={l.id}
              points={l.xy.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke={color}
              strokeWidth={selected ? 1.8 : 1}
              strokeOpacity={selected ? 1 : 0.45}
              strokeDasharray={selected ? '7 5' : '5 5'}
              pointerEvents="none"
            />
          ))}
        {/* Phone: the dashed part counts like the line for picking, and grabs the selected drawing. */}
        {IS_MOBILE &&
          d.type !== 'hline' &&
          lines.map((l) => (
            <polyline
              key={`pick-${l.id}`}
              data-pick={d.id}
              points={l.xy.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke="transparent"
              strokeWidth={2 * LINE_REACH}
              style={{ pointerEvents: selected ? 'stroke' : 'none' }}
              onPointerDown={(e) => {
                // This band lies over the drawing's grips (drawn later): a point in reach still wins.
                const r = svgRef.current!.getBoundingClientRect()
                const grip = nearestPoint(marked('grip'), e.clientX - r.left, e.clientY - r.top, LINE_REACH)
                startDrag(e, d, grip === null ? 'move' : Number(grip))
              }}
            />
          ))}
        {!tip ? null : selected && until !== undefined ? (
          <rect
            x={tip[0] - 6}
            y={tip[1] - 6}
            width={12}
            height={12}
            rx={3}
            fill={ALARM}
            style={{ cursor: 'ew-resize', pointerEvents: 'all' }}
            onPointerDown={(e) => startUntilDrag(e, d)}
          />
        ) : selected ? (
          // No end yet: the handle sits at the right edge and pulling it left sets one.
          <rect x={tip[0] - 6} y={tip[1] - 6} width={12} height={12} rx={3} fill="none" stroke={ALARM} strokeWidth={1.5} style={{ cursor: 'ew-resize', pointerEvents: 'all' }} onPointerDown={(e) => startUntilDrag(e, d)} />
        ) : d.type === 'hline' ? (
          <text x={tip[0] + 4} y={tip[1] + 4} fontSize={11} opacity={0.8} pointerEvents="none">
            ⏰
          </text>
        ) : null}
        {clocks.map((c) => {
          const held = heldPill === c.key
          const started = pills[c.key]
          const label = t('jetzt {price}', { price: formatPrice(c.price) })
          const w = label.length * 6.2 + 16
          // Near the right edge (the clock sits a few bars from it) the pill opens to the left instead.
          const left = pillLeft(c.x, w, width)
          const px = left ? c.x - 12 - w : c.x + 12
          return (
            <g key={c.key}>
              {(held || started !== undefined) && (
                // Opens from the clock, holds, then folds back into it (index.css); a new start replays it.
                <g key={held ? 'hold' : started} className={`alarm-pill${left ? ' alarm-pill-left' : ''}${held ? ' alarm-pill-hold' : ''}`} pointerEvents="none">
                  <rect x={px} y={c.y - 10} width={w} height={20} rx={10} fill={ALARM} />
                  <text x={px + w / 2} y={c.y + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={THEME.bg}>
                    {label}
                  </text>
                </g>
              )}
              <g
                data-clock={c.key}
                data-x={c.x}
                data-y={c.y}
                // Phone: picked by distance (chartTap), so the clock never blocks panning.
                style={{ pointerEvents: IS_MOBILE ? 'none' : 'all', cursor: 'pointer' }}
                onClick={() => {
                  select(d.id)
                  showPill([c.key])
                }}
                onPointerEnter={() => setHeldPill(c.key)}
                onPointerLeave={() => setHeldPill(null)}
              >
                <circle cx={c.x} cy={c.y} r={9} fill={ALARM} stroke={THEME.bg} strokeWidth={2} />
                <text x={c.x} y={c.y + 3.5} textAnchor="middle" fontSize={10}>
                  ⏰
                </text>
              </g>
            </g>
          )
        })}
      </g>
    )
  }

  // Dragging the end handle: the time under the pointer, never before now (exchange clock).
  const startUntilDrag = (e: React.PointerEvent, d: Drawing) => {
    // Like the drawing's own drag: only the first finger, a second one cancels.
    if (!e.isPrimary) return
    e.stopPropagation()
    e.preventDefault()
    select(d.id)
    const id = e.pointerId
    const at = (ev: { clientX: number; clientY: number }) => {
      const p = logicalAt(ev)
      return p ? Math.max(now, logicalToTime(axis, Math.round(p.logical), step)) : null
    }
    // A click without dragging (a few pixels of jitter) leaves the end as it is.
    const [x0, y0] = [e.clientX, e.clientY]
    let last: number | null = null
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      if (last === null && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return
      const t = at(ev)
      if (t === null) return
      last = t
      setUntilDrag({ id: d.id, time: t })
    }
    const end = (keep: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('pointerdown', other, true)
      if (keep && last !== null) setAlarmUntil(d.id, last)
      setUntilDrag(null)
    }
    const up = (ev: PointerEvent) => ev.pointerId === id && end(true)
    const cancel = () => end(false)
    // A second finger means zooming: the end stays where it was.
    const other = (ev: PointerEvent) => ev.pointerId !== id && end(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('pointerdown', other, true)
  }

  // The bar under a selected drawing: alarm on/off per line, and its end.
  const switchAlarm = (d: Drawing, part: string) => {
    const q = useQuotes.getState().quotes[symbol]
    // Switching off needs no price; switching on does (the direction comes from it).
    const on = alarmsOf(d.id).some((a) => a.line?.part === part)
    // A box whose trade is decided (reached, switched off, run out): target or stop arms the pair again together.
    const pair = alarmsOf(d.id).filter((a) => a.line?.part === 'target' || a.line?.part === 'stop')
    if ((part === 'target' || part === 'stop') && pair.length && !pair.some(isArmed)) {
      if (!q) return setAlarmHint(t('Aktueller Kurs nötig.'))
      armBoxAlarms(d.id, alarmClock(q.time), q.price)
      return showPill(pillsOf(d.id))
    }
    if (!q && !on) return setAlarmHint(t('Aktueller Kurs nötig.'))
    const r = toggleLineAlarm(d.id, part, alarmClock(q?.time), q?.price ?? 0)
    setAlarmHint(r === 'at-price' ? t('Der Kurs liegt schon dort.') : r === 'no-price' ? t('Diese Linie hat hier keinen Preis.') : '')
    if (!on && r === undefined) showPill([`${d.id}|${part}`])
  }
  const partLabel = (part: string) =>
    part === 'top'
      ? t('oben')
      : part === 'mid'
        ? t('Mitte')
        : part === 'bottom'
          ? t('unten')
          : part === 'target'
            ? t('Ziel')
            : part === 'stop'
              ? t('Stop')
              : part === 'entry'
                ? t('Einstieg')
                : `${+(Number(part) * 100).toFixed(1)}`

  const textEdit = drawings.find((d): d is Extract<Drawing, { type: 'text' }> => d.id === editing && d.type === 'text')
  const editAt = textEdit && [toX(textEdit.points[0].time), toY(textEdit.points[0].price)]
  // An emptied text is removed rather than kept as an invisible drawing.
  const commitText = (d: Extract<Drawing, { type: 'text' }>, value: string) => {
    setEditing(null)
    const text = value.trim()
    if (!text) removeDrawing(d.id)
    else if (text !== d.text) updateDrawing({ ...d, text })
  }

  const preview = tool !== 'cursor' && draft.length > 0 && hover ? build(tool, 'draft', [...draft, hover]) : null
  const styled = tool === 'cursor' && !drag && !editing ? drawings.find((d) => d.id === selectedId) : undefined
  // Finger-sized swatches on the phone.
  const swatch = `${IS_MOBILE ? 'h-8 w-8' : 'h-5 w-5'} rounded-full ring-offset-2 ring-offset-panel`
  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="absolute left-0 top-0"
        // While dragging, the svg swallows the mouse so the chart underneath does not pan along.
        style={{
          pointerEvents: drawingMode || drag ? 'all' : 'none',
          cursor: drag ? 'grabbing' : drawingMode ? 'crosshair' : 'default'
        }}
        onClick={onClick}
        onMouseMove={onMove}
        // The magnet mark belongs to the pointer: gone when it leaves the chart.
        onMouseLeave={() => setSnapMark(null)}
        onPointerDown={onAim}
        onPointerMove={onAim}
        onPointerUp={endFinger}
        onPointerCancel={endFinger}
        // The chart is a sibling, not a parent: hand the wheel over to whatever lies under the svg, so zooming works over drawings.
        onWheel={(e) =>
          document
            .elementsFromPoint(e.clientX, e.clientY)
            .find((el) => !svgRef.current?.contains(el))
            ?.dispatchEvent(new WheelEvent('wheel', e.nativeEvent))
        }
      >
        {drawings.map((d) => render(drag?.orig.id === d.id ? drag.current : d))}
        {/* While a drawing is dragged its alarms restart anyway; no new table on every pointer move. */}
        {/* Hidden only once a drag really moves: a tap on the selected drawing must still find its clock (onUp). */}
        {drawings.map((d) => (drag?.orig.id === d.id && drag.moved ? null : alarmLines(d)))}
        {preview && render(preview, true)}
        {snapMark && (drawingMode || drag) && (
          <g pointerEvents="none">
            <circle cx={snapMark.x} cy={snapMark.y} r={6} fill={SNAP_COLOR} fillOpacity={0.35} />
            <circle cx={snapMark.x} cy={snapMark.y} r={3.5} fill={SNAP_COLOR} />
            <text
              // Near the right edge the label goes left of the mark.
              {...(snapMark.x + 10 + labelWidth(snapMark.label) > width ? { x: snapMark.x - 10, textAnchor: 'end' as const } : { x: snapMark.x + 10 })}
              y={snapMark.y - 8} fill={SNAP_COLOR} fontSize={11} fontWeight={600} paintOrder="stroke" stroke={THEME.bg} strokeWidth={3}>
              {snapMark.label}
            </text>
          </g>
        )}
        {IS_MOBILE && drawingMode && aim && (
          <g pointerEvents="none">
            <line x1={0} x2={width} y1={aim.y} y2={aim.y} stroke={THEME.text} strokeDasharray="3 3" />
            <line x1={aim.x} x2={aim.x} y1={0} y2={height} stroke={THEME.text} strokeDasharray="3 3" />
            <circle cx={aim.x} cy={aim.y} r={4} fill="none" stroke={COLOR} strokeWidth={1.5} />
          </g>
        )}
      </svg>
      {IS_MOBILE && drawingMode && aim && series.coordinateToPrice(aim.y) !== null && (
        <span
          className="pointer-events-none absolute z-20 rounded bg-accent px-1 text-[11px] tabular-nums text-white"
          style={{ left: width + 2, top: aim.y - 8 }}
        >
          {fmt(series.coordinateToPrice(aim.y)!)}
        </span>
      )}
      {IS_MOBILE && drawingMode && (
        <button
          onClick={placeAim}
          disabled={!aim}
          aria-label={t('Punkt setzen')}
          className="absolute bottom-16 right-16 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-glow disabled:opacity-40"
        >
          <Crosshair size={26} />
        </button>
      )}
      {textEdit && editAt && editAt[0] !== null && editAt[1] !== null && (
        <input
          key={textEdit.id}
          autoFocus
          defaultValue={textEdit.text}
          placeholder={t('Text eingeben')}
          aria-label={t('Text eingeben')}
          onBlur={(e) => commitText(textEdit, e.currentTarget.value)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()}
          className="pointer-events-auto absolute z-20 w-48 rounded border border-accent/60 bg-panel px-1 font-semibold text-slate-100 outline-none"
          // Baseline of the input text roughly on the drawing's point, as with the 13 px default.
          style={{ left: editAt[0], top: editAt[1] - (textEdit.size ?? TEXT_SIZE) - 4, fontSize: textEdit.size ?? TEXT_SIZE }}
        />
      )}
      {styled && (
        // Bottom centre like the click hint, which only shows while a tool is active. Own mousedown, so the
        // chart underneath does not clear the selection.
        <div
          className={`pointer-events-auto absolute bottom-12 left-1/2 z-10 flex -translate-x-1/2 items-center rounded-lg bg-panel/90 text-xs ${IS_MOBILE ? 'w-max max-w-[calc(100vw-16px)] flex-wrap justify-center gap-2 px-3 py-2.5' : 'gap-1.5 px-2 py-1.5'} text-slate-200 shadow-glow ring-1 ring-accent/40 backdrop-blur`}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* A position box keeps its fixed teal/rose zones: no colour choice. */}
          {styled.type !== 'long' && styled.type !== 'short' && (
          <div role="group" aria-label={t('Farbe')} className={`flex items-center ${IS_MOBILE ? 'gap-2.5' : 'gap-1.5'}`}>
            {palette().map(({ color, name }) => {
              const active = (styled.color ?? null) === color
              return (
                <button
                  key={name}
                  aria-label={name}
                  title={name}
                  aria-pressed={active}
                  onClick={() => updateDrawing({ ...styled, color: color ?? undefined })}
                  className={`${swatch} ${active ? 'ring-2 ring-white' : 'hover:ring-1 hover:ring-slate-400'}`}
                  // "Standard" shows the drawing colour with a slash: the tool's own colours.
                  style={{ background: color ?? `linear-gradient(135deg, ${COLOR} 45%, ${THEME.bg} 45% 55%, ${COLOR} 55%)` }}
                />
              )
            })}
          </div>
          )}
          {IS_MOBILE && (
            // No Delete key on the phone.
            <button onClick={() => removeDrawing(styled.id)} aria-label={t('Zeichnung löschen')} className="ml-1 flex h-9 w-9 items-center justify-center border-l border-line pl-2 text-down">
              <Trash2 size={22} />
            </button>
          )}
          {lineParts(styled).length > 0 && (
            <div role="group" aria-label={t('Alarm')} className="ml-1 flex flex-wrap items-center gap-1 border-l border-line pl-2">
              {lineParts(styled).length === 1 ? (
                <button
                  aria-pressed={alarmsOf(styled.id).length > 0}
                  onClick={() => switchAlarm(styled, lineParts(styled)[0])}
                  className={`${IS_MOBILE ? 'px-2.5 py-1.5 text-sm' : 'px-1.5 py-0.5'} rounded ${alarmsOf(styled.id).length ? 'bg-violet-500/25 text-violet-200 ring-1 ring-violet-400' : 'text-muted hover:bg-line hover:text-white'}`}
                >
                  ⏰ {t('Alarm')}
                </button>
              ) : (
                <>
                  <span aria-hidden>⏰</span>
                  {(() => {
                    const button = (part: string) => {
                      const on = alarmsOf(styled.id).some((a) => a.line?.part === part)
                      return (
                        <button
                          key={part}
                          aria-pressed={on}
                          onClick={() => switchAlarm(styled, part)}
                          className={`${IS_MOBILE ? 'min-w-9 px-1.5 py-1.5 text-sm' : 'px-1 py-0.5'} rounded tabular-nums ${on ? 'bg-violet-500/25 text-violet-200 ring-1 ring-violet-400' : 'text-muted hover:bg-line hover:text-white'}`}
                        >
                          {partLabel(part)}
                        </button>
                      )
                    }
                    if (styled.type !== 'long' && styled.type !== 'short') return lineParts(styled).map(button)
                    // A box: the entry on its own, target and stop framed as the pair whose first hit decides.
                    return (
                      <>
                        {button('entry')}
                        <span className="flex items-center gap-0.5 rounded-md border border-violet-900 p-0.5" title={t('Der erste Treffer schaltet den anderen ab')}>
                          {button('target')}
                          <span className="px-0.5 text-violet-300">{t('oder')}</span>
                          {button('stop')}
                        </span>
                      </>
                    )
                  })()}
                </>
              )}
              {alarmsOf(styled.id).length > 0 && (
                <span className="flex items-center gap-1 rounded border border-dashed border-violet-400 px-1.5 py-0.5 tabular-nums text-violet-200">
                  {styled.alarmUntil !== undefined ? t('bis {date}', { date: dateLabel(styled.alarmUntil) }) : t('ohne Ende')}
                  {styled.alarmUntil !== undefined && (
                    <button aria-label={t('Ende entfernen')} title={t('Ende entfernen')} onClick={() => setAlarmUntil(styled.id, undefined)} className="text-muted hover:text-white">
                      ✕
                    </button>
                  )}
                </span>
              )}
              {alarmHint && <span className="text-amber-500">{alarmHint}</span>}
            </div>
          )}
          {styled.type === 'text' && (
            <div role="group" aria-label={t('Textgröße')} className="ml-1 flex items-center gap-0.5 border-l border-line pl-2">
              {TEXT_SIZES.map((n) => {
                const active = (styled.size ?? TEXT_SIZE) === n
                return (
                  <button
                    key={n}
                    aria-pressed={active}
                    title={t('Textgröße')}
                    onClick={() => updateDrawing({ ...styled, size: n === TEXT_SIZE ? undefined : n })}
                    className={`${IS_MOBILE ? 'min-w-9 py-1.5 text-sm' : 'min-w-6 py-0.5'} rounded px-1 tabular-nums ${active ? 'bg-brand text-white' : 'text-muted hover:bg-line hover:text-white'}`}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
      {tool !== 'cursor' && CLICKS[tool] > 1 && (
        // Bottom centre: the top is taken by the legend row.
        <div className="pointer-events-none absolute bottom-12 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-panel/90 px-2.5 py-1 text-xs text-slate-200 shadow-glow ring-1 ring-accent/40 backdrop-blur">
          {IS_MOBILE
            ? t('Fadenkreuz schieben · ⊕ setzt Punkt {n} von {total}', { n: draft.length + 1, total: CLICKS[tool] })
            : t('Punkt {n} von {total} · Esc bricht ab', { n: draft.length + 1, total: CLICKS[tool] })}
        </div>
      )}
    </>
  )
}
