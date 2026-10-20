import { useEffect, useState } from 'react'
import AboutModal from './components/AboutModal'
import ChartArea from './components/ChartArea'
import DrawingToolbar from './components/DrawingToolbar'
import SettingsModal from './components/SettingsModal'
import TopBar from './components/TopBar'
import Watchlist from './components/Watchlist'
import { watchQuotes } from './services/marketData'
import { setFeedStatus, setQuote, useStore } from './store/useStore'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const disclaimerAccepted = useStore((s) => s.disclaimerAccepted)
  const symbol = useStore((s) => s.symbol)
  const folders = useStore((s) => s.folders)
  const finnhubKey = useStore((s) => s.finnhubKey)
  // The chart symbol joins the quote feed so stock charts get live ticks even when it is not on the watchlist.
  const feed = [...new Set([...folders.flatMap((f) => f.symbols), symbol])].join(',')

  useEffect(() => watchQuotes(feed.split(','), finnhubKey, setQuote, setFeedStatus), [feed, finnhubKey])

  return (
    <div className="flex h-full select-none flex-col bg-bg text-sm text-slate-300">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} onOpenAbout={() => setAboutOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <DrawingToolbar />
        <main className="relative min-w-0 flex-1">
          <ChartArea />
        </main>
        <Watchlist />
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {(aboutOpen || !disclaimerAccepted) && (
        <AboutModal firstRun={!disclaimerAccepted} onClose={() => setAboutOpen(false)} />
      )}
    </div>
  )
}
