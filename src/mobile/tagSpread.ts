const GAP = 17 // tag height plus 1 px: closer tags are pushed apart, as the chart does with its own labels

/** Spreads sorted tag positions (top to bottom) so none overlaps the one above it. */
export function spread(ys: number[]): number[] {
  const out: number[] = []
  for (const y of ys) out.push(out.length && y - out[out.length - 1] < GAP ? out[out.length - 1] + GAP : y)
  return out
}
