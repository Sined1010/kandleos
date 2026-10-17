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
  const svgRef = useRef<SVGSVGElement>(null)
  const [draft, setDraft] = useState<{ p1: Point; p2: Point } | null>(null)
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
      if (e.key === 'Escape') setTool('cursor')
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) removeDrawing(selectedId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, setTool, removeDrawing])

  const toX = (time: number) =>
    times.length ? chart.timeScale().logicalToCoordinate(timeToLogical(times, time, step) as Logical) : null
  const toY = (price: number) => series.priceToCoordinate(price)
  const fmt = (price: number) => series.priceFormatter().format(price)

  const pointAt = (e: React.MouseEvent): Point | null => {
    const rect = svgRef.current!.getBoundingClientRect()
    const logical = chart.timeScale().coordinateToLogical(e.clientX - rect.left)
    const price = series.coordinateToPrice(e.clientY - rect.top)
    if (logical === null || price === null || !times.length) return null
    return { time: logicalToTime(times, logical, step), price }
  }

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
          style: { pointerEvents: 'stroke' as const, cursor: 'pointer' },
          onMouseDown: (e: React.MouseEvent) => {
            e.stopPropagation()
            select(d.id)
          }
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
    const handles = (selected || preview) && (
      <>
        <circle cx={x1} cy={y1} r={4} fill="#0b0e14" stroke={stroke} strokeWidth={1.5} />
        <circle cx={x2} cy={y2} r={4} fill="#0b0e14" stroke={stroke} strokeWidth={1.5} />
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
      style={{ pointerEvents: drawingMode ? 'all' : 'none', cursor: drawingMode ? 'crosshair' : 'default' }}
      onClick={onClick}
      onMouseMove={onMove}
    >
      {drawings.map((d) => render(d))}
      {draft && (tool === 'trend' || tool === 'fib') && render({ id: 'draft', type: tool, ...draft }, true)}
    </svg>
  )
}
