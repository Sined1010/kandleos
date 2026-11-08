import { Plus, X } from 'lucide-react'
import { t } from '../../../shared/i18n'
import { tfLabel } from '../../../shared/types'
import { drawingsKey, isDirty, linkedChart } from '../lib/charts'
import { MAX_TABS, useStore } from '../store/useStore'
import { ask } from '../../../mobile/MessageBox'

/** Closes a tab after asking when something would be lost (unsaved changes to its saved chart, or its drawings). */
export async function closeTabAsked(tabId: string): Promise<void> {
  const { tabs, charts, drawings, names, closeTab } = useStore.getState()
  const tab = tabs.find((x) => x.id === tabId)
  if (!tab) return
  const name = names[tab.symbol] ?? tab.symbol
  // Unsaved changes to a saved chart are lost with the tab; the saved chart itself stays.
  const saved = linkedChart(tab, charts)
  const key = drawingsKey({ activeTab: tab.id, symbol: tab.symbol })
  const changed = saved && isDirty(saved, tab.timeframe, drawings[key] ?? [])
  // All drawings of this tab (any symbol) go with it, except those kept in its saved chart.
  const lost = Object.entries(drawings).reduce((n, [k, d]) => n + (k.startsWith(`${tab.id}:`) && !(saved && k === key) ? d.length : 0), 0)
  const ok = changed
    ? await ask(t('Ungespeicherte Änderungen an „{name}“ verwerfen?', { name: saved.name }), t('Verwerfen'), { danger: true })
    : !lost || (await ask(t('Tab „{name}“ schließen? Seine Zeichnungen ({count}) gehen verloren.', { name, count: lost }), t('Tab schließen'), { danger: true }))
  if (ok) closeTab(tab.id)
}

/** Tabs above the chart: up to MAX_TABS charts, each with its own symbol, candle size and range. */
export default function ChartTabs() {
  const tabs = useStore((s) => s.tabs)
  const active = useStore((s) => s.activeTab)
  const names = useStore((s) => s.names)
  const selectTab = useStore((s) => s.selectTab)
  const addTab = useStore((s) => s.addTab)
  const full = tabs.length >= MAX_TABS

  return (
    <div className={`flex h-8 shrink-0 items-end gap-1 border-b border-line bg-panel px-2`} role="tablist" aria-label="Charts">
      {tabs.map((tab) => {
        const on = tab.id === active
        const name = names[tab.symbol] ?? tab.symbol
        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={on}
            title={`${tab.symbol} · ${tfLabel(tab.timeframe)}`}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && selectTab(tab.id)}
            className={`group -mb-px flex h-7 min-w-0 max-w-52 cursor-pointer items-center gap-1.5 rounded-t-lg border border-b-0 pl-3 pr-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-accent ${
              on ? 'border-line bg-bg text-white' : 'border-transparent text-muted hover:bg-line/50 hover:text-white'
            }`}
          >
            <span className="truncate font-medium">{name}</span>
            <span className="shrink-0 text-muted">{tfLabel(tab.timeframe)}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  void closeTabAsked(tab.id)
                }}
                aria-label={t('{name} schließen', { name })}
                title={t('Tab schließen')}
                className={`shrink-0 rounded p-0.5 text-muted hover:bg-line hover:text-white ${on ? '' : 'opacity-0 group-hover:opacity-100'}`}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )
      })}
      <button
        onClick={addTab}
        disabled={full}
        title={full ? t('Höchstens {max} Charts gleichzeitig', { max: MAX_TABS }) : t('Neuer Chart-Tab')}
        aria-label={t('Neuer Chart-Tab')}
        className="mb-1 rounded p-1 text-muted enabled:hover:bg-line enabled:hover:text-white disabled:opacity-30"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
