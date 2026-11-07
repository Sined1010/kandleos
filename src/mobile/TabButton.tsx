import { useEffect, useState } from 'react'
import { t } from '../shared/i18n'
import { tfLabel } from '../shared/types'
import { closeTabAsked } from '../renderer/src/components/ChartTabs'
import { MAX_TABS, useStore } from '../renderer/src/store/useStore'
import ActionMenu from './ActionMenu'
import TabIcon from './TabIcon'
import { nextTabAction } from './tabCycle'
import { useLongPress } from './useLongPress'

/** The phone's tab switcher: a tap goes to the next tab (or opens a second), a long press lists all tabs. */
export default function TabButton() {
  const tabs = useStore((s) => s.tabs)
  const active = useStore((s) => s.activeTab)
  const names = useStore((s) => s.names)
  const hintSeen = useStore((s) => s.tabHintSeen)
  const [list, setList] = useState(false)
  const index = Math.max(0, tabs.findIndex((x) => x.id === active))
  const hint = !hintSeen && tabs.length >= 2

  const dismissHint = () => useStore.getState().setTabHintSeen()
  useEffect(() => {
    if (!hint) return
    const timer = setTimeout(dismissHint, 5000)
    return () => clearTimeout(timer)
  }, [hint])

  const tap = () => {
    const s = useStore.getState()
    const next = nextTabAction(
      s.tabs.map((x) => x.id),
      s.activeTab
    )
    if (next.kind === 'add') s.addTab()
    else s.selectTab(next.id)
  }
  const press = useLongPress(() => {
    dismissHint()
    setList(true)
  }, tap)

  return (
    <div className="relative shrink-0">
      <button {...press} aria-label={t('Tab {n} von {count}', { n: index + 1, count: tabs.length })} className="mobile-icon">
        <TabIcon n={index + 1} count={tabs.length} />
      </button>
      {hint && (
        <button
          onClick={dismissHint}
          className="absolute left-0 top-full z-40 mt-2 w-max max-w-60 rounded-lg bg-accent px-3 py-2 text-left text-xs font-medium text-white shadow-xl"
        >
          {t('Lange drücken zeigt alle Tabs')}
        </button>
      )}
      {list && (
        <ActionMenu
          title={t('Tabs')}
          onClose={() => setList(false)}
          items={[
            ...tabs.map((tab) => ({
              label: `${tab.id === active ? '● ' : ''}${names[tab.symbol] ?? tab.symbol} · ${tfLabel(tab.timeframe)}`,
              onPick: () => useStore.getState().selectTab(tab.id),
              onRemove: tabs.length > 1 ? () => closeTabAsked(tab.id) : undefined
            })),
            ...(tabs.length < MAX_TABS ? [{ label: t('+ Neuer Tab'), onPick: () => useStore.getState().addTab() }] : [])
          ]}
        />
      )}
    </div>
  )
}
