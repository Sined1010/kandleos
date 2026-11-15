const GAP = 17 // tag height plus 1 px: closer tags are pushed apart, as the chart does with its own labels
const TAG_HALF = 8.5 // half the tag height (17 px)

/** Spreads sorted tag positions (top to bottom) so none overlaps the one above it. */
export function spread(ys: number[]): number[] {
  const out: number[] = []
  for (const y of ys) out.push(out.length && y - out[out.length - 1] < GAP ? out[out.length - 1] + GAP : y)
  return out
}

/**
 * The axis numbers (their y) that a tag at one of `tagYs` would partly cover; `textHalf` is half their text height.
 * Those are hidden whole: a number half under a rounded tag looks broken (the library draws its numbers regardless).
 */
export function coveredTicks(tickYs: number[], tagYs: number[], textHalf: number): number[] {
  return tickYs.filter((t) => tagYs.some((y) => Math.abs(t - y) < TAG_HALF + textHalf))
}
