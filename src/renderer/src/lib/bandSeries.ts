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
