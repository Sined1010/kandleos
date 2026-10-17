import type { IChartApi, ISeriesApi, Logical } from 'lightweight-charts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { logicalToTime, timeToLogical } from '../../../shared/candles'
import { TF_SECONDS, type Candle } from '../../../shared/types'
import { useStore, type Drawing, type Point } from '../store/useStore'

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
const FIB_COLORS = ['#787b86', '#f23645', '#ff9800', '#4caf50', '#089981', '#00bcd4', '#787b86']
const COLOR = '#2962ff'
const SELECTED = '#f5c542'
const NO_DRAWINGS: Drawing[] = []

type Handle = 'move' | 'p1' | 'p2'
interface DragState {
  handle: Handle
  from: { logical: number; price: number }
  orig: Drawing
  current: Drawing
}

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  data: Candle[]
}

/** SVG layer over the main pane. Drawings are stored as {time, price} and projected to pixels on every render. */
export default function DrawingOverlay({ chart, series, data }: Props) {
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
  const [draft, setDraft] = useState<{ p1: Point; p2: Point } | null>(null)
  // Edits are previewed locally and committed on mouseup, so the store file is written once per drag.
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [, redraw] = useState(0)
  const times = useMemo(() => data.map((c) => c.time), [data])
  const step = TF_SECONDS[timeframe]

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

  useEffect(() => setDraft(null), [tool, symbol])

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

  const toX = (time: number) =>
    times.length ? chart.timeScale().logicalToCoordinate(timeToLogical(times, time, step) as Logical) : null
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
    return at && { time: logicalToTime(times, at.logical, step), price: at.price }
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
      // Shift in bar space, not seconds, so a line keeps its shape across weekend/overnight gaps.
      const shift = (p: Point): Point => ({
        time: logicalToTime(times, timeToLogical(times, p.time, step) + at.logical - d.from.logical, step),
        price: p.price + dPrice
      })
      const o = d.orig
      const current: Drawing =
        o.type === 'hline'
          ? { ...o, price: o.price + dPrice }
          : d.handle === 'move'
            ? { ...o, p1: shift(o.p1), p2: shift(o.p2) }
            : { ...o, [d.handle]: { time: logicalToTime(times, at.logical, step), price: at.price } }
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
    // Handlers read the live drag via dragRef; times/step only change on new bars, which is harmless mid-drag.
  }, [dragging])

  const onClick = (e: React.MouseEvent) => {
    const p = pointAt(e)
    if (!p || tool === 'cursor') return
    if (tool === 'hline') {
      addDrawing({ id: crypto.randomUUID(), type: 'hline', price: p.price })
      setTool('cursor')
    } else if (!draft) setDraft({ p1: p, p2: p })
    else {
      addDrawing({ id: crypto.randomUUID(), type: tool, p1: draft.p1, p2: p })
      setTool('cursor')
    }
  }

  const onMove = (e: React.MouseEvent) => {
    const p = draft && pointAt(e)
    if (p) setDraft({ p1: draft.p1, p2: p })
  }

  const width = chart.timeScale().width()
  const height = chart.panes()[0]?.getHeight() ?? 0
  const drawingMode = tool !== 'cursor'

  const render = (d: Drawing, preview = false) => {
    const selected = d.id === selectedId
    const stroke = selected ? SELECTED : COLOR
    // A wide transparent twin of each line is the hit area; in cursor mode only these catch the mouse.
    const hit = preview
      ? null
      : {
          stroke: 'transparent',
          strokeWidth: 10,
          style: { pointerEvents: 'stroke' as const, cursor: d.type === 'hline' ? 'ns-resize' : 'move' },
          onMouseDown: (e: React.MouseEvent) => startDrag(e, d, 'move')
        }

    if (d.type === 'hline') {
      const y = toY(d.price)
      if (y === null) return null
      return (
        <g key={d.id}>
          <line x1={0} x2={width} y1={y} y2={y} stroke={stroke} strokeWidth={selected ? 2 : 1} />
          {hit && <line x1={0} x2={width} y1={y} y2={y} {...hit} />}
          <text x={width - 6} y={y - 4} textAnchor="end" fill={stroke} fontSize={11}>
            {fmt(d.price)}
          </text>
        </g>
      )
    }

    const x1 = toX(d.p1.time)
    const x2 = toX(d.p2.time)
    const y1 = toY(d.p1.price)
    const y2 = toY(d.p2.price)
    if (x1 === null || x2 === null || y1 === null || y2 === null) return null
    const ends = { x1, y1, x2, y2 }
    const handle = (cx: number, cy: number, h: Handle) => (
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill="#0b0e14"
        stroke={stroke}
        strokeWidth={1.5}
        style={{ pointerEvents: preview ? 'none' : 'all', cursor: 'crosshair' }}
        onMouseDown={preview ? undefined : (e) => startDrag(e, d, h)}
      />
    )
    const handles = (selected || preview) && (
      <>
        {handle(x1, y1, 'p1')}
        {handle(x2, y2, 'p2')}
      </>
    )

    if (d.type === 'trend') {
      return (
        <g key={d.id}>
          <line {...ends} stroke={stroke} strokeWidth={selected ? 2 : 1.5} />
          {hit && <line {...ends} {...hit} />}
          {handles}
        </g>
      )
    }

    // Fibonacci: level 1 at the first click (swing high), level 0 at the second (swing low).
    const left = Math.min(x1, x2)
    const right = Math.max(x1, x2)
    const levels = FIB_LEVELS.map((lvl, i) => {
      const price = d.p2.price + (d.p1.price - d.p2.price) * lvl
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
                {hit && <line x1={left} x2={right} y1={l.y} y2={l.y} {...hit} />}
                <text x={left + 4} y={l.y - 3} fill={l.color} fontSize={10}>
                  {l.lvl} ({fmt(l.price)})
                </text>
              </g>
            )
        )}
        <line {...ends} stroke={stroke} strokeDasharray="4 4" />
        {hit && <line {...ends} {...hit} />}
        {handles}
      </g>
    )
  }

  return (
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
      {draft && (tool === 'trend' || tool === 'fib') && render({ id: 'draft', type: tool, ...draft }, true)}
    </svg>
  )
}
