import { Check, MoreVertical, Pencil, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { t } from '../shared/i18n'
import AboutModal from '../renderer/src/components/AboutModal'
import { InfoPanel } from '../renderer/src/components/CompanyInfo'
import { SaveDialog, SavedChartsPanel } from '../renderer/src/components/SavedCharts'
import { isCrypto } from '../shared/types'
import ChartArea from '../renderer/src/components/ChartArea'
import ChartTabs from '../renderer/src/components/ChartTabs'
import SettingsModal from '../renderer/src/components/SettingsModal'
import { IndicatorMenu, TimeframePicker } from '../renderer/src/components/TopBar'
import WelcomeModal from '../renderer/src/components/WelcomeModal'
import { useQuoteFeed } from '../renderer/src/services/quoteFeed'
import { useStore } from '../renderer/src/store/useStore'
import ActionMenu from './ActionMenu'
import AlarmPage from './AlarmPage'
import { startAlarmWatch } from './alarmWatch'
import DrawTools from './DrawTools'
import Layer from './Layer'
import Licenses from './Licenses'
import { shareChart } from './share'
import type { SheetPos } from './sheetSnap'
import { useBack } from './useBack'
import WatchSheet from './WatchSheet'

/** The phone layout: tabs and candle sizes on top, the chart, and (Task 5) the watchlist sheet below. */
export default function MobileApp() {
  const language = useStore((s) => s.language)
  const activeTab = useStore((s) => s.activeTab)
  const disclaimerAccepted = useStore((s) => s.disclaimerAccepted)
  const stockSource = useStore((s) => s.stockSource)
  const [menu, setMenu] = useState(false)
  const [indicators, setIndicators] = useState(false)
  const [settings, setSettings] = useState(false)
  const [about, setAbout] = useState(false)
  const [sheet, setSheet] = useState<SheetPos>('low')
  const [drawing, setDrawing] = useState(false)
  const [page, setPage] = useState<'charts' | 'info' | 'licenses' | 'alarms' | null>(null)
  const [alarmFor, setAlarmFor] = useState<string | null>(null)
  useEffect(() => startAlarmWatch(), [])
  const [saving, setSaving] = useState(false)
  const symbol = useStore((s) => s.symbol)
  const names = useStore((s) => s.names)
  // window.api.openLicenses on the phone asks for the license page (src/mobile/api.ts).
  useEffect(() => {
    const show = () => {
      // Opened from About, which would otherwise stay on top of it.
      setAbout(false)
      setPage('licenses')
    }
    window.addEventListener('kandleos:licenses', show)
    return () => window.removeEventListener('kandleos:licenses', show)
  }, [])
  useBack('save-as', saving, () => setSaving(false))
  const endDrawing = () => {
    useStore.getState().setTool('cursor')
    setDrawing(false)
  }
  useQuoteFeed()
  useBack('draw', drawing, endDrawing)
  useBack('indicators', indicators, () => setIndicators(false))
  useBack('settings', settings, () => setSettings(false))
  useBack('about', about, () => setAbout(false))

  return (
    <div key={language} className="mobile-app flex h-dvh flex-col bg-bg text-sm text-slate-300">
      <header className="mobile-chrome flex shrink-0 flex-col bg-panel">
        <div className="flex items-center gap-1 px-2 pt-1">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <TimeframePicker />
          </div>
          <div className="relative">
            <button onClick={() => setIndicators((o) => !o)} aria-label={t('Indikatoren')} className="mobile-icon">
              <SlidersHorizontal size={18} />
            </button>
            {indicators && (
              <div className="fixed inset-x-2 top-24 z-40">
                <IndicatorMenu onClose={() => setIndicators(false)} />
              </div>
            )}
          </div>
          <button
            onClick={() => (drawing ? endDrawing() : (setDrawing(true), setSheet('low')))}
            aria-label={drawing ? t('Zeichnen beenden') : t('Zeichnen')}
            aria-pressed={drawing}
            className={`mobile-icon ${drawing ? 'bg-brand text-white' : ''}`}
          >
            {drawing ? <Check size={18} /> : <Pencil size={18} />}
          </button>
          <button onClick={() => setMenu(true)} aria-label={t('Mehr')} className="mobile-icon">
            <MoreVertical size={18} />
          </button>
        </div>
        <ChartTabs />
      </header>
      {/* The low sheet (grip + search) covers the bottom 96 px; the chart ends above it. */}
      <main className={`relative min-h-0 flex-1 ${drawing ? '' : 'mb-24'}`}>
        <ChartArea key={activeTab} />
      </main>
      {/* While drawing, the tools take the sheet's place. */}
      {drawing ? (
        <DrawTools />
      ) : (
        <WatchSheet
          pos={sheet}
          onPos={setSheet}
          extraItems={(sym) => [
            {
              label: t('Kurs-Alarm …'),
              onPick: () => {
                setAlarmFor(sym)
                setPage('alarms')
              }
            }
          ]}
        />
      )}
      {menu && (
        <ActionMenu
          title="KandleOS"
          onClose={() => setMenu(false)}
          items={[
            { label: t('Chart-Stände'), onPick: () => setPage('charts') },
            {
              label: t('Kurs-Alarme'),
              onPick: () => {
                setAlarmFor(symbol)
                setPage('alarms')
              }
            },
            { label: t('Infos zum Wert'), disabled: isCrypto(symbol), onPick: () => setPage('info') },
            { label: t('Chart teilen'), onPick: () => void shareChart(document.querySelector('main')!, symbol).catch(() => {}) },
            { label: t('Einstellungen'), onPick: () => setSettings(true) },
            { label: t('Über KandleOS'), onPick: () => setAbout(true) }
          ]}
        />
      )}
      {page === 'charts' && (
        <Layer id="charts" title={t('Chart-Stände')} onClose={() => setPage(null)}>
          <SavedChartsPanel onDone={() => setPage(null)} onSaveAs={() => setSaving(true)} />
        </Layer>
      )}
      {saving && <SaveDialog onClose={() => setSaving(false)} />}
      {page === 'info' && (
        <Layer id="info" title={names[symbol] ?? symbol} onClose={() => setPage(null)}>
          <InfoPanel symbol={symbol} />
        </Layer>
      )}
      {page === 'alarms' && alarmFor && (
        <Layer id="alarms" title={t('Kurs-Alarme')} onClose={() => setPage(null)}>
          <AlarmPage symbol={alarmFor} />
        </Layer>
      )}
      {page === 'licenses' && (
        <Layer id="licenses" title={t('Lizenzen von Drittanbietern anzeigen')} onClose={() => setPage(null)}>
          <Licenses />
        </Layer>
      )}
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
      {(!disclaimerAccepted || !stockSource) && <WelcomeModal onOpenAbout={() => setAbout(true)} />}
      {about && <AboutModal onClose={() => setAbout(false)} />}
    </div>
  )
}
