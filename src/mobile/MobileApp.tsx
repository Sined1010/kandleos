import { App as CapApp } from '@capacitor/app'
import { useEffect, useState } from 'react'
import { t } from '../shared/i18n'
import AboutModal from '../renderer/src/components/AboutModal'
import { InfoPanel } from '../renderer/src/components/CompanyInfo'
import { SaveDialog, SavedChartsPanel } from '../renderer/src/components/SavedCharts'
import { isCrypto } from '../shared/types'
import ChartArea from '../renderer/src/components/ChartArea'
import ChartBoundary from '../renderer/src/components/ChartBoundary'
import EventsPanel from '../renderer/src/components/EventsPanel'
import { toggleEvents, useUnseen } from '../renderer/src/components/EventsButton'
import SettingsModal from '../renderer/src/components/SettingsModal'
import { openEvents } from '../renderer/src/services/events'
import { useEventsUi } from '../renderer/src/store/eventsUi'
import WelcomeModal from '../renderer/src/components/WelcomeModal'
import { useQuoteFeed } from '../renderer/src/services/quoteFeed'
import { useStore } from '../renderer/src/store/useStore'
import ActionMenu from './ActionMenu'
import AlarmPage from './AlarmPage'
import { startAlarmWatch } from './alarmWatch'
import { startLink, usePcStatus } from './link'
import PcLink from './PcLink'
import DrawTools from './DrawTools'
import Layer from './Layer'
import Licenses from './Licenses'
import MessageBox from './MessageBox'
import MobileHeader, { FullscreenBar } from './MobileHeader'
import Notice from './Notice'
import { setFullscreen } from './statusBar'
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
  const [settings, setSettings] = useState(false)
  // Field to focus when the settings open from elsewhere (the Events sheet asks for the Finnhub key).
  const [settingsFocus, setSettingsFocus] = useState<string | undefined>()
  const [about, setAbout] = useState(false)
  const [sheet, setSheet] = useState<SheetPos>('low')
  const [drawing, setDrawing] = useState(false)
  const [full, setFull] = useState(false)
  const [page, setPage] = useState<'charts' | 'info' | 'licenses' | 'alarms' | 'pc' | 'events' | null>(null)
  const [alarmFor, setAlarmFor] = useState<string | null>(null)
  useEffect(() => startAlarmWatch(), [])
  useEffect(() => startLink(), [])
  // Back after more than 5 minutes away: the chart loads afresh. Live prices only move the last candle, so the
  // candles of the time away would be missing (and a chart left open for weeks would show weeks-old candles).
  const [wake, setWake] = useState(0)
  useEffect(() => {
    let away = 0
    const pause = CapApp.addListener('pause', () => void (away = Date.now()))
    const resume = CapApp.addListener('resume', () => away && Date.now() - away > 5 * 60_000 && setWake((n) => n + 1))
    return () => {
      void pause.then((l) => l.remove())
      void resume.then((l) => l.remove())
    }
  }, [])
  const pc = usePcStatus()
  const [saving, setSaving] = useState(false)
  const symbol = useStore((s) => s.symbol)
  const names = useStore((s) => s.names)
  const unseen = useUnseen(symbol).length
  // window.api.openLicenses on the phone asks for the license page (src/mobile/api.ts).
  useEffect(() => {
    const show = () => {
      // Opened from About, which would otherwise stay on top of it.
      setAbout(false)
      setPage('licenses')
    }
    // The forecast button without a paired PC asks for the pairing page (ChartArea.tsx).
    const pair = () => setPage('pc')
    // "Alle Events" on the chart's event card.
    const events = () => openEventsSheet()
    // The Events sheet's Finnhub button (EventsPanel.tsx).
    const settingsAt = (e: Event) => {
      closeEventsSheet()
      setSettingsFocus((e as CustomEvent<string>).detail)
      setSettings(true)
    }
    window.addEventListener('kandleos:licenses', show)
    window.addEventListener('kandleos:pair', pair)
    window.addEventListener('kandleos:events', events)
    window.addEventListener('kandleos:settings', settingsAt)
    return () => {
      window.removeEventListener('kandleos:licenses', show)
      window.removeEventListener('kandleos:pair', pair)
      window.removeEventListener('kandleos:events', events)
      window.removeEventListener('kandleos:settings', settingsAt)
    }
  }, [])
  const openEventsSheet = () => {
    setPage('events')
    openEvents()
  }
  // Back to 'watchlist': while the side says 'events', every load counts as seen (services/events.ts) and the dot would never show.
  const closeEventsSheet = () => {
    setPage(null)
    useEventsUi.setState({ side: 'watchlist' })
  }

  useBack('save-as', saving, () => setSaving(false))
  const endDrawing = () => {
    useStore.getState().setTool('cursor')
    setDrawing(false)
  }
  // The sheet goes low, so after drawing it does not pop up at the height it had before.
  const toggleDraw = () => (drawing ? endDrawing() : (setDrawing(true), setSheet('low')))
  useQuoteFeed()
  useBack('draw', drawing, endDrawing)
  useBack('settings', settings, () => setSettings(false))
  useBack('about', about, () => setAbout(false))
  useBack('fullscreen', full, () => setFull(false))
  useEffect(() => setFullscreen(full), [full])

  return (
    <div key={language} className={`mobile-app flex h-dvh flex-col bg-bg text-sm text-slate-300 ${full ? 'mobile-full' : ''} ${drawing ? 'mobile-drawing' : ''}`}>
      <header className="mobile-chrome flex shrink-0 flex-col border-b border-line bg-bg">
        <MobileHeader
          drawing={drawing}
          onDraw={toggleDraw}
          onMenu={() => setMenu(true)}
          onPc={() => setPage('pc')}
          onAlarm={() => {
            setAlarmFor(symbol)
            setPage('alarms')
          }}
          onFull={() => setFull(true)}
        />
      </header>
      {/* The low sheet (grip + search) and the drawing tools both cover the bottom 96 px; the chart ends above
          them and keeps its size when drawing starts. */}
      <main className="relative mb-24 min-h-0 flex-1">
        <ChartBoundary key={`${activeTab}:${wake}`}>
          <ChartArea full={full} />
        </ChartBoundary>
      </main>
      {/* While drawing, the tools take the sheet's place; the sheet stays mounted (hidden), so leaving drawing
          does not rebuild the whole watchlist. */}
      {drawing && <DrawTools />}
      <div hidden={drawing}>
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
      </div>
      {full && <FullscreenBar drawing={drawing} onDraw={toggleDraw} onExit={() => setFull(false)} />}
      {menu && (
        <ActionMenu
          title="KandleOS"
          onClose={() => setMenu(false)}
          items={[
            {
              label: unseen > 0 ? t('Events · {n} neu', { n: unseen }) : t('Events'),
              section: t('Chart'),
              // As the old header chip: switches Events on if needed and opens the sheet (switching off is in the sheet).
              onPick: () => {
                if (!useStore.getState().eventsOn) toggleEvents()
                openEventsSheet()
              }
            },
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
            { label: t('Mit PC koppeln'), section: t('App'), onPick: () => setPage('pc') },
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
          <InfoPanel symbol={symbol} page />
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
      {page === 'events' && (
        <Layer id="events" title={t('Events')} onClose={closeEventsSheet}>
          <EventsPanel page onJump={closeEventsSheet} />
        </Layer>
      )}
      {page === 'pc' && (
        <Layer id="pc" title={t('Mit PC koppeln')} onClose={() => setPage(null)}>
          <div className="mobile-page">
            <PcLink />
          </div>
        </Layer>
      )}
      {settings && <SettingsModal onClose={() => (setSettings(false), setSettingsFocus(undefined))} keysFromPc={pc.state !== 'none'} focus={settingsFocus} />}
      {(!disclaimerAccepted || !stockSource) && <WelcomeModal onOpenAbout={() => setAbout(true)} />}
      {about && <AboutModal onClose={() => setAbout(false)} />}
      <MessageBox />
      <Notice />
    </div>
  )
}
