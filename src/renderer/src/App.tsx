import { useEffect, useState } from 'react'
import MessageBox from '../../mobile/MessageBox'
import AboutModal from './components/AboutModal'
import ChartArea from './components/ChartArea'
import ChartBoundary from './components/ChartBoundary'
import ChartTabs from './components/ChartTabs'
import DrawingToolbar from './components/DrawingToolbar'
import { FULLSCREEN_ID } from './components/FullscreenButton'
import SettingsModal from './components/SettingsModal'
import TopBar from './components/TopBar'
import { checkForUpdate } from './components/UpdateBadge'
import Watchlist from './components/Watchlist'
import WelcomeModal from './components/WelcomeModal'
import { settleDue } from './services/archive'
import { useQuoteFeed } from './services/quoteFeed'
import { answerPhone, startStamping } from './services/sync'
import { startPcAlarmWatch } from './services/alarmWatch'
import { useStore } from './store/useStore'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const disclaimerAccepted = useStore((s) => s.disclaimerAccepted)
  const language = useStore((s) => s.language)
  const stockSource = useStore((s) => s.stockSource)
  const activeTab = useStore((s) => s.activeTab)
  const updateCheck = useStore((s) => s.updateCheck)
  useQuoteFeed()
  useEffect(() => {
    if (updateCheck) void checkForUpdate()
  }, [updateCheck])
  // Settle finished forecasts of every symbol once, after the first chart had time to load.
  useEffect(() => {
    const timer = setTimeout(() => void settleDue(), 10_000)
    return () => clearTimeout(timer)
  }, [])
  // Phone link: note local changes for sync, and answer a paired phone's sync requests (main/link.ts forwards them).
  useEffect(() => startStamping(), [])
  useEffect(() => startPcAlarmWatch(), [])
  useEffect(
    () => window.api.link.onRequest((op, args, device) => (op === 'sync' ? answerPhone(device, args) : Promise.reject(new Error('unknown-op')))),
    []
  )

  return (
    // Keyed by language: a switch redraws the whole window, so every text, number and chart label follows it.
    <div key={language} className="flex h-full select-none flex-col bg-bg text-sm text-slate-300">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} onOpenAbout={() => setAboutOpen(true)} />
      <div className="flex min-h-0 flex-1">
        {/* The chart with its tabs and drawing tools; this is what the fullscreen mode shows. */}
        <div id={FULLSCREEN_ID} className="flex min-w-0 flex-1 bg-bg">
          <DrawingToolbar />
          <div className="flex min-w-0 flex-1 flex-col">
            <ChartTabs />
            <main className="relative min-h-0 flex-1">
              {/* Keyed by tab: switching tabs starts the chart afresh, so no forecast or panel of one tab
                  carries over to another. */}
              <ChartBoundary key={activeTab}>
                <ChartArea />
              </ChartBoundary>
            </main>
          </div>
          {/* Questions and notices in KandleOS style; in here so they also show in fullscreen. */}
          <MessageBox />
        </div>
        <Watchlist />
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {/* First start, and once for users from before the stock source choice. */}
      {(!disclaimerAccepted || !stockSource) && <WelcomeModal onOpenAbout={() => setAboutOpen(true)} />}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  )
}
