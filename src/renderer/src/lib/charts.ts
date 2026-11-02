import type { Timeframe } from '../../../shared/types'
import type { ChartTab, Drawing, Indicators } from '../store/useStore'

/** A named chart the user saved: symbol, candle size and drawings (indicators are kept but not applied on load). */
export interface SavedChart {
  id: string
  name: string
  symbol: string
  timeframe: Timeframe
  drawings: Drawing[]
  indicators: Indicators
  savedAt: number
}

/** Drawings belong to a tab and its symbol, so two tabs on the same symbol are separate charts. */
export const drawingsKey = (s: { activeTab: string; symbol: string }): string => `${s.activeTab}:${s.symbol}`

/** Whether the chart shown differs from what was saved (contents, so undoing a change makes it clean again). */
export function isDirty(saved: SavedChart, timeframe: Timeframe, drawings: Drawing[]): boolean {
  return saved.timeframe !== timeframe || JSON.stringify(saved.drawings) !== JSON.stringify(drawings)
}

export function toolCounts(drawings: Drawing[]): Partial<Record<Drawing['type'], number>> {
  const out: Partial<Record<Drawing['type'], number>> = {}
  for (const d of drawings) out[d.type] = (out[d.type] ?? 0) + 1
  return out
}

const norm = (s: string) => s.trim().toLocaleLowerCase()

export function findByName(charts: SavedChart[], symbol: string, name: string): SavedChart | undefined {
  return charts.find((c) => c.symbol === symbol && norm(c.name) === norm(name))
}

/** The saved chart a tab came from, as long as the tab still shows its symbol. */
export function linkedChart(tab: ChartTab, charts: SavedChart[]): SavedChart | undefined {
  return charts.find((c) => c.id === tab.chartId && c.symbol === tab.symbol)
}

export interface ChartGroup {
  symbol: string
  label: string
  current: boolean
  charts: SavedChart[]
}

/** Saved charts per symbol: the current symbol first, then by label; newest first; filtered by name, ticker or label. */
export function groupCharts(charts: SavedChart[], current: string, query: string, label: (symbol: string) => string): ChartGroup[] {
  const q = norm(query)
  const groups = new Map<string, ChartGroup>()
  for (const c of charts) {
    const l = label(c.symbol)
    if (q && ![c.name, c.symbol, l].some((s) => norm(s).includes(q))) continue
    const g = groups.get(c.symbol) ?? { symbol: c.symbol, label: l, current: c.symbol === current, charts: [] }
    g.charts.push(c)
    groups.set(c.symbol, g)
  }
  for (const g of groups.values()) g.charts.sort((a, b) => b.savedAt - a.savedAt)
  return [...groups.values()].sort((a, b) => Number(b.current) - Number(a.current) || a.label.localeCompare(b.label))
}

export type LoadTarget = { kind: 'switch'; tabId: string } | { kind: 'here' } | { kind: 'new' } | { kind: 'confirm' }

/**
 * Where a saved chart opens: the tab already showing it (the active one reloads it), the active tab if it has no drawings to lose,
 * else a new tab, or – with all tabs open – the active tab after the user confirms.
 */
export function loadTarget(
  chart: SavedChart,
  s: { tabs: ChartTab[]; activeTab: string; drawings: Record<string, Drawing[]> },
  max: number
): LoadTarget {
  const open = s.tabs.find((t) => t.chartId === chart.id && t.symbol === chart.symbol)
  // Already in the active tab: load it there again, so the saved state comes back.
  if (open?.id === s.activeTab) return { kind: 'here' }
  if (open) return { kind: 'switch', tabId: open.id }
  const active = s.tabs.find((t) => t.id === s.activeTab)
  // The tab's drawings for the loaded symbol count too: loading would replace them unseen.
  const busy = [active?.symbol, chart.symbol].some((sym) => sym && s.drawings[drawingsKey({ activeTab: s.activeTab, symbol: sym })]?.length)
  if (!busy) return { kind: 'here' }
  return s.tabs.length < max ? { kind: 'new' } : { kind: 'confirm' }
}
