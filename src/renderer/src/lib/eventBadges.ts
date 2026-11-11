import type {
  CandlestickData,
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitiveHoveredItem,
  SeriesAttachedParameter,
  Time
} from 'lightweight-charts'
import { stackLevels, stemLength } from '../../../shared/eventChart'
import { THEME } from './theme'

// Event markers, design A ("pill badges"): a rounded badge on a thin stem from the candle's wick, ▲ and the amount
// below the bar for buys, ▼ above for sells. lightweight-charts' own markers cannot draw this, so it is a series
// primitive on the candle series. It draws whatever list it was given; the phone can use it as it is (empty texts).

export interface Badge {
  /** Hover/click id (EventLayer: the bar's time, or 'tmp'). */
  id: string
  time: number
  /** Bar index in the candles, for its high and low. */
  index: number
  kind: 'buy' | 'sell' | 'mixed' | 'note'
  text: string
  /** Heavy deal (big or in a cluster): longer stem, stronger fill, glow. */
  strong: boolean
  /** Temporary marker of a list entry: dashed stem. */
  temp?: boolean
}

const COLOR = { buy: THEME.eventBuy, sell: THEME.eventSell, mixed: THEME.eventMixed, note: THEME.eventNote }
const ICON = { buy: '▲', sell: '▼', mixed: '◆', note: '●' }
const H = 20
const FONT = '600 11px system-ui, "Segoe UI", sans-serif'
const ICON_FONT = '10px system-ui, "Segoe UI", sans-serif'

type Box = { id: string; x1: number; y1: number; x2: number; y2: number }

class Renderer implements IPrimitivePaneRenderer {
  constructor(private readonly owner: EventBadges) {}

  draw(target: Parameters<IPrimitivePaneRenderer['draw']>[0]): void {
    const { chart, series, badges } = this.owner
    const boxes: Box[] = []
    this.owner.boxes = boxes
    if (!chart || !series || !badges.length) return
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.save()
      ctx.font = FONT
      const placed = badges.flatMap((b) => {
        const x = chart.timeScale().timeToCoordinate(b.time as Time)
        const bar = series.dataByIndex(b.index) as CandlestickData | null
        if (x === null || !bar) return []
        const above = b.kind !== 'buy'
        const y = series.priceToCoordinate(above ? bar.high : bar.low)
        if (y === null) return []
        const w = (b.text ? ctx.measureText(b.text).width + 8 : 0) + 22
        return [{ b, x, y, w, above, strong: b.strong }]
      })
      const levels = stackLevels(placed, H)
      placed.forEach(({ b, x, y, w, above }, i) => {
        const col = COLOR[b.kind]
        const dir = above ? -1 : 1
        if (levels[i] < 0) {
          // Zoomed far out: no room for another badge, a dot at the wick keeps the deal visible.
          ctx.fillStyle = col
          ctx.beginPath()
          ctx.arc(x, y + dir * 8, 2.5, 0, Math.PI * 2)
          ctx.fill()
          boxes.push({ id: b.id, x1: x - 5, y1: y + dir * 8 - 5, x2: x + 5, y2: y + dir * 8 + 5 })
          return
        }
        const stem = stemLength(b.strong, levels[i])
        const end = y + dir * stem
        const top = above ? end - H : end
        const left = x - w / 2
        ctx.strokeStyle = col
        ctx.globalAlpha = 0.7
        ctx.lineWidth = 1
        ctx.setLineDash(b.temp ? [2, 2] : [])
        ctx.beginPath()
        ctx.moveTo(x, y + dir * 3)
        ctx.lineTo(x, end)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.roundRect(left, top, w, H, H / 2)
        ctx.globalAlpha = b.strong ? 0.28 : 0.14
        ctx.fillStyle = col
        if (b.strong) {
          ctx.shadowColor = col
          ctx.shadowBlur = 8
        }
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.globalAlpha = b.strong ? 0.95 : 0.5
        ctx.stroke()
        ctx.globalAlpha = 1
        // The icon is centred by its drawn shape: 'middle' centres the font's em box, which leaves ▲ and ▼ off centre.
        ctx.font = ICON_FONT
        ctx.textBaseline = 'alphabetic'
        const icon = ctx.measureText(ICON[b.kind])
        // Left edge of the drawn glyph: after the badge's rim with text, else centred on the stem.
        const iconX = b.text ? left + 8 : x - (icon.actualBoundingBoxLeft + icon.actualBoundingBoxRight) / 2
        ctx.fillText(ICON[b.kind], iconX + icon.actualBoundingBoxLeft, top + H / 2 + (icon.actualBoundingBoxAscent - icon.actualBoundingBoxDescent) / 2)
        if (b.text) {
          ctx.font = FONT
          ctx.textBaseline = 'middle'
          ctx.fillStyle = '#f1f5f9'
          ctx.fillText(b.text, left + 20, top + H / 2 + 0.5)
        }
        boxes.push({ id: b.id, x1: left, y1: top, x2: left + w, y2: top + H })
      })
      ctx.restore()
    })
  }
}

class View implements IPrimitivePaneView {
  private readonly view: Renderer
  constructor(owner: EventBadges) {
    this.view = new Renderer(owner)
  }
  zOrder() {
    return 'top' as const
  }
  renderer(): IPrimitivePaneRenderer {
    return this.view
  }
}

export class EventBadges implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null
  series: ISeriesApi<'Candlestick'> | null = null
  badges: Badge[] = []
  /** Where the badges were drawn last (media pixels), for hover and click. */
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
  /** New badges; the chart redraws once. Zoom, scroll and new bars redraw on their own. */
  set(badges: Badge[]): void {
    this.badges = badges
    this.request?.()
  }
  paneViews(): readonly IPrimitivePaneView[] {
    return this.views
  }
  /** The whole badge is the hover and click area; its id reaches the chart as hoveredObjectId. */
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const b = this.boxes.find((r) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2)
    return b ? { externalId: b.id, zOrder: 'top', cursorStyle: 'pointer', itemType: 'marker' } : null
  }
}
