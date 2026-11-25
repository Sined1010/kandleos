import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitiveHoveredItem,
  SeriesAttachedParameter,
  Time
} from 'lightweight-charts'
import { stemLength } from '../../../shared/eventChart'
import { PATTERN_HIT } from './patternHit'
import { THEME } from './theme'

// Candlestick patterns at the last finished bars: a dashed frame around the pattern's candles and a pill with its
// name below (or above, where an event badge already hangs below). A series primitive like EventBadges, so it moves
// with zoom and scroll without lag.

export interface PatternMark {
  /** Hover/click id 'pat:<end bar time>'; never all digits, those are event badges. */
  id: string
  /** Bar times of the first and last candle of each framed piece (several when shaded pre/post bars lie between). */
  pieces: { from: number; to: number }[]
  /** High and low of the pattern bars. */
  hi: number
  lo: number
  label: string
  side: 'below' | 'above'
  /** Both sides taken by event badges: the pill goes beyond the outermost badge. */
  outer: boolean
}

type Box = { id: string; x1: number; y1: number; x2: number; y2: number }

const H = 20
const PAD = 6
const STEM = 14
const FONT = '500 11px system-ui, "Segoe UI", sans-serif'

class Renderer implements IPrimitivePaneRenderer {
  constructor(private readonly owner: PatternMarks) {}

  draw(target: Parameters<IPrimitivePaneRenderer['draw']>[0]): void {
    const { chart, series, marks } = this.owner
    const boxes: Box[] = []
    this.owner.boxes = boxes
    if (!chart || !series || !marks.length) return
    const ts = chart.timeScale()
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      ctx.save()
      ctx.font = FONT
      ctx.strokeStyle = THEME.pattern
      ctx.lineWidth = 1
      for (const m of marks) {
        // High and low of the pattern bars only: shaded pre/post bars between them stay out of the frame.
        const yHi = series.priceToCoordinate(m.hi)
        const yLo = series.priceToCoordinate(m.lo)
        if (yHi === null || yLo === null) continue
        const top = yHi - PAD
        const bottom = yLo + PAD
        const half = Math.max(3, ts.options().barSpacing / 2) + 2
        let last: { left: number; right: number } | null = null
        for (const p of m.pieces) {
          const x1 = ts.timeToCoordinate(p.from as Time)
          const x2 = ts.timeToCoordinate(p.to as Time)
          if (x1 === null || x2 === null) continue
          const left = x1 - half
          const right = x2 + half
          ctx.beginPath()
          ctx.roundRect(left, top, right - left, bottom - top, 6)
          ctx.fillStyle = THEME.pattern
          ctx.globalAlpha = 0.08
          ctx.fill()
          ctx.globalAlpha = 0.55
          ctx.setLineDash([4, 3])
          ctx.stroke()
          ctx.setLineDash([])
          boxes.push({ id: m.id, x1: left, y1: top, x2: right, y2: bottom })
          last = { left, right }
        }
        if (!last) continue

        // The pill hangs at the last piece (the newest bars) and stays inside the pane on every side.
        const text = m.label + '  ⓘ'
        const w = ctx.measureText(text).width + 16
        const mid = (last.left + last.right) / 2
        const cx = Math.max(w / 2 + 2, Math.min(mid, mediaSize.width - w / 2 - 2))
        const dir = m.side === 'below' ? 1 : -1
        const edge = m.side === 'below' ? bottom : top
        // Beyond event badges: up to their third level, as EventBadges stacks them.
        const stem = m.outer ? stemLength(true, 3) + H + 4 : STEM
        const end = edge + dir * stem
        const pillTop = Math.max(2, Math.min(m.side === 'below' ? end : end - H, mediaSize.height - H - 2))
        ctx.globalAlpha = 0.6
        ctx.beginPath()
        ctx.moveTo(mid, edge)
        ctx.lineTo(mid, m.side === 'below' ? pillTop : pillTop + H)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.roundRect(cx - w / 2, pillTop, w, H, H / 2)
        ctx.fillStyle = THEME.bg
        ctx.fill()
        ctx.globalAlpha = 0.7
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.fillStyle = THEME.pattern
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'center'
        ctx.fillText(text, cx, pillTop + H / 2 + 0.5)
        boxes.push({ id: m.id, x1: cx - w / 2, y1: pillTop, x2: cx + w / 2, y2: pillTop + H })
      }
      ctx.restore()
    })
  }
}

class View implements IPrimitivePaneView {
  private readonly view: Renderer
  constructor(owner: PatternMarks) {
    this.view = new Renderer(owner)
  }
  zOrder() {
    return 'top' as const
  }
  renderer(): IPrimitivePaneRenderer {
    return this.view
  }
}

export class PatternMarks implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null
  series: ISeriesApi<'Candlestick'> | null = null
  marks: PatternMark[] = []
  /** Frames and pills as drawn last (media pixels), for hover and click. */
  boxes: Box[] = []
  private request: (() => void) | null = null
  private readonly views = [new View(this)]

  attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>): void {
    this.chart = chart
    this.series = series as ISeriesApi<'Candlestick'>
    this.request = requestUpdate
  }
  detached(): void {
    this.chart = this.series = this.request = null
  }
  setMarks(marks: PatternMark[]): void {
    this.marks = marks
    this.request?.()
  }
  paneViews(): readonly IPrimitivePaneView[] {
    return this.views
  }
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const b = this.boxes.find((r) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2)
    return b ? { externalId: b.id, ...PATTERN_HIT } : null
  }
}
