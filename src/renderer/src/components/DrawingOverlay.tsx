import type { IChartApi, ISeriesApi, Logical } from 'lightweight-charts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { futureTimes } from '../../../shared/calendar'
import { locale, t } from '../../../shared/i18n'
import { logicalToTime, timeToLogical } from '../../../shared/candles'
import { TF_MONTHS, TF_SECONDS, type Candle } from '../../../shared/types'
import { channelOffset, isTrough, measureLabel, rayEnd } from '../lib/geometry'
import { THEME } from '../lib/theme'
import { useStore, type Drawing, type Point, type Tool } from '../store/useStore'

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
const FIB_COLORS = ['#787b86', '#f23645', '#ff9800', '#4caf50', '#089981', '#00bcd4', '#787b86']
const COLOR = THEME.drawing
const SELECTED = THEME.selected
const WAVE_COLORS = { elliott: '#ab47bc', abc: '#ff7043' }
const WAVE_LABELS = { elliott: ['0', '1', '2', '3', '4', '5'], abc: ['0', 'A', 'B', 'C'] }
const NO_DRAWINGS: Drawing[] = []
// How far right of the last candle drawings follow the trading calendar; beyond that, even steps.
const FUTURE_BARS = 500

/** Clicks each tool needs; the drawing is created on the last one. */
const CLICKS: Record<Exclude<Tool, 'cursor'>, number> = {
  trend: 2,
  ray: 2,
  hline: 1,
  vline: 1,
  fib: 2,
  rect: 2,
  channel: 3,
  elliott: 6,
  abc: 4,
  measure: 2
}

/** 'move' drags the whole drawing, a number drags that point. */
type Handle = 'move' | number
interface DragState {
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
  const drawings = useStore((s) => s.drawings[s.symbol] ?? NO_DRAWINGS)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const addDrawing = useStore((s) => s.addDrawing)
  const removeDrawing = useStore((s) => s.removeDrawing)
  const updateDrawing = useStore((s) => s.updateDrawing)
  const svgRef = useRef<SVGSVGElement>(null)
  // Clicked points of the drawing in progress, plus the point under the mouse for the preview.
  const [draft, setDraft] = useState<Point[]>([])
  const [hover, setHover] = useState<Point | null>(null)
  // Edits are previewed locally and committed on mouseup, so the store file is written once per drag.
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [, redraw] = useState(0)
  const times = useMemo(() => data.map((c) => c.time), [data])
  const step = TF_SECONDS[timeframe]
  // Bar times plus the coming bars on the exchange's trading calendar. Points right of the last candle are
  // stored as real trading times (not "last bar + n × step", which lands in nights and weekends), so a
  // drawing keeps its place when the bars change, e.g. when pre-market and after-hours candles are added.
  // Rebuilt only when a bar is added, not on every tick of the open bar.
  const lastTime = times[times.length - 1]
  const axis = useMemo(
    () => (times.length ? [...times, ...futureTimes(times, step, FUTURE_BARS, timeZone, TF_MONTHS[timeframe])] : times),
    [times.length, lastTime, step, timeZone, timeframe]
  )

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
        redraw((n) => n + 1)
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [chart, series])

  useEffect(() => {
    setDraft([])
    setHover(null)
  }, [tool, symbol])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
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
  const toX = (time: number) => (times.length ? chart.timeScale().logicalToCoordinate(logicalOf(time) as Logical) : null)
  const toY = (price: number) => series.priceToCoordinate(price)
  const fmt = (price: number) => series.priceFormatter().format(price)

  const logicalAt = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const logical = chart.timeScale().coordinateToLogical(e.clientX - rect.left)
    const price = series.coordinateToPrice(e.clientY - rect.top)
    return logical === null || price === null || !times.length ? null : { logical, price }
  }
  const pointAt = (e: { clientX: number; clientY: number }): Point | null => {
    const at = logicalAt(e)
    return at && { time: logicalToTime(axis, at.logical, step), price: at.price }
  }

  const startDrag = (e: React.MouseEvent, d: Drawing, handle: Handle) => {
    e.stopPropagation()
    e.preventDefault()
    select(d.id)
    const from = logicalAt(e)
    if (!from) return
    dragRef.current = { handle, from, orig: d, current: d }
    setDrag(dragRef.current)
  }

  // Window listeners: the pointer may leave the line (or the svg) while dragging.
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      const at = logicalAt(e)
      if (!d || !at) return
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
            : d.handle === 'move'
              ? withPoints(o, pointsOf(o).map((p) => ({ time: shiftTime(p.time), price: p.price + dPrice })))
              : withPoints(o, pointsOf(o).map((p, i) => (i === d.handle ? cursor : p)))
      dragRef.current = { ...d, current }
      setDrag(dragRef.current)
    }
    const onUp = () => {
      const d = dragRef.current
      if (d && d.current !== d.orig) updateDrawing(d.current)
      dragRef.current = null
      setDrag(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // Handlers read the live drag via dragRef; the axis only changes on new bars, which is harmless mid-drag.
  }, [dragging])

  const onClick = (e: React.MouseEvent) => {
    const p = pointAt(e)
    if (!p || tool === 'cursor') return
    const pts = [...draft, p]
    if (pts.length < CLICKS[tool]) return setDraft(pts)
    addDrawing(build(tool, crypto.randomUUID(), pts))
    setTool('cursor')
  }

  const onMove = (e: React.MouseEvent) => {
    if (draft.length) setHover(pointAt(e))
  }

  const width = chart.timeScale().width()
  const height = chart.panes()[0]?.getHeight() ?? 0
  const drawingMode = tool !== 'cursor'

  const render = (d: Drawing, preview = false) => {
    const selected = d.id === selectedId
    const stroke = selected ? SELECTED : COLOR
    const lineWidth = selected ? 2 : 1.5
    // A wide transparent twin of each line is the hit area; in cursor mode only these catch the mouse.
    const hit = (cursor = 'move') =>
      preview
        ? null
        : {
            stroke: 'transparent',
            strokeWidth: 10,
            fill: 'none',
            style: { pointerEvents: 'stroke' as const, cursor },
            onMouseDown: (e: React.MouseEvent) => startDrag(e, d, 'move')
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
            {new Date(d.time * 1000).toLocaleString(locale(), { dateStyle: 'short', timeStyle: step < 86400 ? 'short' : undefined })}
          </text>
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
        <circle
          key={`h${i}`}
          cx={x}
          cy={ys[i]}
          r={5}
          fill={THEME.bg}
          stroke={stroke}
          strokeWidth={1.5}
          style={{ pointerEvents: preview ? 'none' : 'all', cursor: 'crosshair' }}
          onMouseDown={preview ? undefined : (e) => startDrag(e, d, i)}
        />
      ))
    const seg = (a: number, b: number) => ({ x1: xs[a], y1: ys[a], x2: xs[b], y2: ys[b] })

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
      const [ex, ey] = rayEnd(xs[0], ys[0], xs[1], ys[1], width)
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
      const color = d.type === 'rect' ? stroke : up ? THEME.up : THEME.down
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

    if (d.type === 'elliott' || d.type === 'abc') {
      const color = selected ? SELECTED : WAVE_COLORS[d.type]
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
      return { lvl, price, y: toY(price), color: FIB_COLORS[i] }
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

  const preview = tool !== 'cursor' && draft.length > 0 && hover ? build(tool, 'draft', [...draft, hover]) : null
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
      >
        {drawings.map((d) => render(drag?.orig.id === d.id ? drag.current : d))}
        {preview && render(preview, true)}
      </svg>
      {tool !== 'cursor' && CLICKS[tool] > 1 && (
        // Bottom centre: the top is taken by the legend row.
        <div className="pointer-events-none absolute bottom-12 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-panel/90 px-2.5 py-1 text-xs text-slate-200 shadow-glow ring-1 ring-accent/40 backdrop-blur">
          {t('Punkt {n} von {total} · Esc bricht ab', { n: draft.length + 1, total: CLICKS[tool] })}
        </div>
      )}
    </>
  )
}
