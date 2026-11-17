import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time
} from 'lightweight-charts'
import { t } from '../../../shared/i18n'
import type { Candle } from '../../../shared/types'
import { volumeProfile, type VolumeProfile } from './indicators'

// Volume by price level of the bars in view, as bars from the right edge. A series primitive drawn behind the
// candles ('bottom'), so it moves with zoom and scroll in the same frame and never covers the latest bars.

const WIDTH = 0.28
const ROW = '#6366f126'
const VALUE_AREA = '#6366f155'
// Cyan, not amber: amber belongs to the AI forecast alone.
const POC = '#22d3ee'
const FONT = '11px system-ui, "Segoe UI", sans-serif'

/** First index whose time is at least `t` (times ascending). */
function lowerBound(c: Candle[], t: number): number {
  let lo = 0
  let hi = c.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (c[mid].time < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

class Renderer implements IPrimitivePaneRenderer {
  constructor(private readonly owner: VolumeProfileView) {}

  draw(target: Parameters<IPrimitivePaneRenderer['draw']>[0]): void {
    const { chart, series } = this.owner
    if (!chart || !series) return
    const p = this.owner.profile()
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const w = mediaSize.width
      ctx.save()
      ctx.font = FONT
      if (p === 'none') {
        ctx.fillStyle = '#8b91ad'
        ctx.textAlign = 'right'
        // Bottom right: the top right of the pane is under the forecast button.
        // Translated on each draw, so the note follows a language switch.
        ctx.fillText(t('Volume Profile: kein Volumen'), w - 8, mediaSize.height - 8)
      } else if (p) {
        const max = p.rows[p.poc]
        p.rows.forEach((v, k) => {
          const y1 = series.priceToCoordinate(p.low + (k + 1) * p.step)
          const y2 = series.priceToCoordinate(p.low + k * p.step)
          if (y1 === null || y2 === null || !(v > 0)) return
          const len = (v / max) * w * WIDTH
          ctx.fillStyle = k === p.poc ? POC + 'cc' : k >= p.vaLow && k <= p.vaHigh ? VALUE_AREA : ROW
          ctx.fillRect(w - len, y1 + 0.5, len, Math.max(1, y2 - y1 - 1))
        })
        const price = p.low + (p.poc + 0.5) * p.step
        const y = series.priceToCoordinate(price)
        if (y !== null) {
          ctx.strokeStyle = POC
          ctx.lineWidth = 1
          ctx.setLineDash([4, 3])
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(w, y)
          ctx.stroke()
          ctx.fillStyle = POC
          ctx.fillText(`POC ${series.priceFormatter().format(price)}`, 8, y - 4)
        }
      }
      ctx.restore()
    })
  }
}

class View implements IPrimitivePaneView {
  private readonly view: Renderer
  constructor(owner: VolumeProfileView) {
    this.view = new Renderer(owner)
  }
  zOrder() {
    return 'bottom' as const
  }
  renderer(): IPrimitivePaneRenderer {
    return this.view
  }
}

export class VolumeProfileView implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null
  series: ISeriesApi<'Candlestick'> | null = null
  private candles: Candle[] = []
  private rows: number
  private request: (() => void) | null = null
  private readonly views = [new View(this)]
  private cache: { key: string; profile: VolumeProfile | 'none' | null } = { key: '', profile: null }

  constructor(rows: number) {
    this.rows = rows
  }

  attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>): void {
    this.chart = chart
    this.series = series as ISeriesApi<'Candlestick'>
    this.request = requestUpdate
  }
  detached(): void {
    this.chart = this.series = this.request = null
  }
  setCandles(c: Candle[]): void {
    this.candles = c
    this.request?.()
  }
  paneViews(): readonly IPrimitivePaneView[] {
    return this.views
  }

  /** Profile of the bars in view; computed again only when the view or those bars changed. 'none': no volume. */
  profile(): VolumeProfile | 'none' | null {
    const c = this.candles
    const range = this.chart?.timeScale().getVisibleRange()
    if (!range || !c.length) return null
    // By time, not by logical index: other series can put their own times on the shared time scale.
    const from = lowerBound(c, range.from as number)
    const to = lowerBound(c, (range.to as number) + 1)
    if (to <= from) return null
    const last = c[to - 1]
    const key = `${from}|${to}|${c.length}|${c[from].time}|${last.time}|${last.high}|${last.low}|${last.volume}|${this.rows}`
    if (key !== this.cache.key) this.cache = { key, profile: volumeProfile(c.slice(from, to), this.rows) ?? 'none' }
    return this.cache.profile
  }
}
