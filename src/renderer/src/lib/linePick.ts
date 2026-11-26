// Phone: which drawing a tap means. Instead of geometry per tool, the drawn hit lines (data-pick) are asked whether
// the point would lie in their stroke at a growing width; the first drawing to answer yes is the nearest.

/** How far (px, each side) a tap may miss a line on the phone. Events and patterns keep their own 16. */
export const LINE_REACH = 22

export function nearestId(candidates: { id: string; hit: (width: number) => boolean }[], reach: number, step = 2): string | null {
  const widths: number[] = []
  for (let w = 2 * step; w < 2 * reach; w += 2 * step) widths.push(w)
  // Each ask costs a style recalculation: drawings out of reach answer once, only the rest are narrowed down.
  const near = candidates.filter((c) => c.hit(2 * reach))
  for (const w of widths) {
    const c = near.find((c) => c.hit(w))
    if (c) return c.id
  }
  return near[0]?.id ?? null
}

/** The key of the point (a clock, a grip) nearest to (x, y) within `reach`, else null. */
export function nearestPoint(clocks: { key: string; x: number; y: number }[], x: number, y: number, reach: number): string | null {
  const near = clocks
    .map((c) => ({ key: c.key, d: Math.hypot(c.x - x, c.y - y) }))
    .filter((c) => c.d <= reach)
    .sort((a, b) => a.d - b.d)[0]
  return near?.key ?? null
}

/** Whether a pill of width `w` beside a clock at `x` would run past the chart's right edge: then it goes left. */
export const pillLeft = (x: number, w: number, width: number): boolean => x + 12 + w > width

/** The drawing under (x, y) in svg px, from the elements marked data-pick; null when none is within `reach`. */
export function pickAt(svg: SVGSVGElement, x: number, y: number, reach: number): string | null {
  const point = new DOMPoint(x, y)
  const candidates = [...svg.querySelectorAll<SVGElement>('[data-pick]')].map((el) => ({
    id: el.dataset.pick!,
    hit: (width: number) => {
      if (el instanceof SVGGeometryElement) {
        const before = el.style.strokeWidth
        const cap = el.style.strokeLinecap
        el.style.strokeWidth = `${width}px`
        // Round ends: a tap just past a line's end point still counts.
        el.style.strokeLinecap = 'round'
        try {
          return el.isPointInStroke(point)
        } finally {
          el.style.strokeWidth = before
          el.style.strokeLinecap = cap
        }
      }
      // Text has no stroke to ask: its box, grown by half the width.
      if (el instanceof SVGGraphicsElement) {
        const b = el.getBBox()
        const h = width / 2
        return x >= b.x - h && x <= b.x + b.width + h && y >= b.y - h && y <= b.y + b.height + h
      }
      return false
    }
  }))
  return nearestId(candidates, reach)
}
