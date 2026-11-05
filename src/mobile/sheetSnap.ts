export type SheetPos = 'low' | 'half' | 'full'
const ORDER: SheetPos[] = ['low', 'half', 'full']

/** Visible sheet height per position: low shows the grip and the search field. */
export const sheetHeights = (viewport: number): Record<SheetPos, number> => ({
  low: 96,
  half: Math.round(viewport / 2),
  full: Math.round(viewport * 0.9)
})

/** Where a released sheet settles; a quick flick (|v| > 0.5 px/ms, up positive) moves on in its direction. */
export function snapTo(height: number, velocity: number, viewport: number): SheetPos {
  const h = sheetHeights(viewport)
  if (velocity > 0.5) return ORDER.find((p) => h[p] > height) ?? 'full'
  if (velocity < -0.5) return [...ORDER].reverse().find((p) => h[p] < height) ?? 'low'
  return ORDER.reduce((best, p) => (Math.abs(h[p] - height) < Math.abs(h[best] - height) ? p : best))
}
