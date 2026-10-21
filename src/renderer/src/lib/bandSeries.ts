import {
  customSeriesDefaultOptions,
  type CustomData,
  type CustomSeriesOptions,
  type CustomSeriesWhitespaceData,
  type ICustomSeriesPaneRenderer,
  type ICustomSeriesPaneView,
  type PaneRendererCustomData,
  type PriceToCoordinateConverter,
  type Time
} from 'lightweight-charts'

// lightweight-charts has no fill between two lines; this custom series paints the area between
// an upper and a lower value per bar (a forecast range).

export interface BandData extends CustomData<Time> {
  upper: number
  lower: number
}
export interface BandOptions extends CustomSeriesOptions {
  fill: string
}

class BandRenderer implements ICustomSeriesPaneRenderer {
  data: PaneRendererCustomData<Time, BandData> | null = null
  fill = 'transparent'

  draw(target: Parameters<ICustomSeriesPaneRenderer['draw']>[0], price: PriceToCoordinateConverter): void {
    const bars = this.data?.bars
    if (!bars || bars.length < 2) return
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      ctx.beginPath()
      // Along the upper edge, then back along the lower one; points off-screen are clipped by the canvas.
      const edge = (key: 'upper' | 'lower', order: typeof bars) =>
        order.forEach((b, i) => {
          const y = price(b.originalData[key])
          if (y === null) return
          if (key === 'upper' && i === 0) ctx.moveTo(b.x * hr, y * vr)
          else ctx.lineTo(b.x * hr, y * vr)
        })
      edge('upper', bars)
      edge('lower', [...bars].reverse())
      ctx.closePath()
      ctx.fillStyle = this.fill
      ctx.fill()
    })
  }
}

export class BandSeries implements ICustomSeriesPaneView<Time, BandData, BandOptions> {
  private readonly view = new BandRenderer()

  renderer(): ICustomSeriesPaneRenderer {
    return this.view
  }
  update(data: PaneRendererCustomData<Time, BandData>, options: BandOptions): void {
    this.view.data = data
    this.view.fill = options.fill
  }
  priceValueBuilder(row: BandData): number[] {
    return [row.lower, row.upper]
  }
  isWhitespace(row: BandData | CustomSeriesWhitespaceData<Time>): row is CustomSeriesWhitespaceData<Time> {
    return (row as BandData).upper === undefined
  }
  defaultOptions(): BandOptions {
    return { ...customSeriesDefaultOptions, fill: 'rgba(255, 213, 79, 0.15)' }
  }
}

// Background shading for bars outside the regular session (pre-market, after-hours). Only the bars to shade
// are in the data; each is painted full height across its bar slot.

export interface ShadeData extends CustomData<Time> {
  shade: true
}
export interface ShadeOptions extends CustomSeriesOptions {
  fill: string
}

class ShadeRenderer implements ICustomSeriesPaneRenderer {
  data: PaneRendererCustomData<Time, ShadeData> | null = null
  fill = 'transparent'

  draw(target: Parameters<ICustomSeriesPaneRenderer['draw']>[0]): void {
    const d = this.data
    if (!d?.bars.length) return
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, bitmapSize }) => {
      ctx.fillStyle = this.fill
      const w = d.barSpacing * hr
      for (const b of d.bars) ctx.fillRect(Math.round(b.x * hr - w / 2), 0, Math.ceil(w), bitmapSize.height)
    })
  }
}

export class ShadeSeries implements ICustomSeriesPaneView<Time, ShadeData, ShadeOptions> {
  private readonly view = new ShadeRenderer()

  renderer(): ICustomSeriesPaneRenderer {
    return this.view
  }
  update(data: PaneRendererCustomData<Time, ShadeData>, options: ShadeOptions): void {
    this.view.data = data
    this.view.fill = options.fill
  }
  priceValueBuilder(): number[] {
    return [0]
  }
  isWhitespace(row: ShadeData | CustomSeriesWhitespaceData<Time>): row is CustomSeriesWhitespaceData<Time> {
    return !(row as ShadeData).shade
  }
  defaultOptions(): ShadeOptions {
    return { ...customSeriesDefaultOptions, fill: 'rgba(139, 147, 167, 0.08)' }
  }
}
