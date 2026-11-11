// Colours for the chart canvas and the drawing layer, which Tailwind classes cannot reach.
// Keep in sync with the @theme block in index.css.
export const THEME = {
  bg: '#0a0c16',
  line: '#1e2336',
  grid: '#141828',
  text: '#8b91ad',
  up: '#14b8a6',
  down: '#f43f5e',
  brandFrom: '#6366f1',
  brandTo: '#06b6d4',
  /** Drawings: indigo from the icon, the selected one in its cyan. */
  drawing: '#818cf8',
  selected: '#22d3ee',
  /** Event badges: a step lighter than the candles (up/down) so a badge stands out against the bars it sits on. */
  eventBuy: '#34d399',
  eventSell: '#fb7185',
  eventNote: '#a5b4fc',
  /** Buys and sells on one bar. */
  eventMixed: '#f59e0b'
} as const
