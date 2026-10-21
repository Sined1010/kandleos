import { Activity, ChevronDown, Folder as FolderIcon, FolderPlus, Info, Plus, Search, Settings } from 'lucide-react'
import { useState } from 'react'
import { isCrypto, tfLabel, type Timeframe } from '../../../shared/types'
import type { FeedStatus } from '../services/marketData'
import { useQuotes, useStore, type Indicators } from '../store/useStore'
import SymbolSearch from './SymbolSearch'

export default function TopBar({ onOpenSettings, onOpenAbout }: { onOpenSettings: () => void; onOpenAbout: () => void }) {
  const symbol = useStore((s) => s.symbol)
  const setSymbol = useStore((s) => s.setSymbol)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <span className="font-semibold tracking-wide text-white">KandleOS</span>

      <div className="flex items-center gap-2 rounded bg-bg px-2 py-1 ring-1 ring-line focus-within:ring-accent">
        <Search size={14} className="text-muted" />
        <SymbolSearch
          value={symbol}
          onPick={setSymbol}
          placeholder="Symbol oder Name suchen"
          inputClassName="w-44 bg-transparent font-medium uppercase text-white outline-none placeholder:normal-case placeholder:font-normal placeholder:text-muted/60"
        />
        <span className="rounded bg-line px-1.5 text-[10px] uppercase text-muted">{isCrypto(symbol) ? 'Krypto' : 'Aktie'}</span>
      </div>

      <AddToWatchlist symbol={symbol} />

      <TimeframePicker />

      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-muted hover:bg-line hover:text-white"
        >
          <Activity size={15} /> Indikatoren
        </button>
        {menuOpen && <IndicatorMenu onClose={() => setMenuOpen(false)} />}
      </div>

      <FeedBadge onClick={onOpenSettings} />
      <button
        onClick={onOpenSettings}
        className="rounded p-1.5 text-muted hover:bg-line hover:text-white"
        title="Einstellungen"
        aria-label="Einstellungen"
      >
        <Settings size={16} />
      </button>
      <button
        onClick={onOpenAbout}
        className="rounded p-1.5 text-muted hover:bg-line hover:text-white"
        title="Über KandleOS, Haftung, Datenschutz, Lizenzen"
        aria-label="Über KandleOS"
      >
        <Info size={16} />
      </button>
    </header>
  )
}

// Shown as buttons; every candle size, these included, is in the dropdown next to them.
const MAIN: Timeframe[] = ['15m', '1h', '4h', '1D', '1W', '1M']
const GROUPS: [title: string, items: [Timeframe, string][]][] = [
  ['Minuten', [['1m', '1 Minute'], ['5m', '5 Minuten'], ['15m', '15 Minuten'], ['30m', '30 Minuten']]],
  ['Stunden', [['1h', '1 Stunde'], ['2h', '2 Stunden'], ['4h', '4 Stunden']]],
  ['Tage', [['1D', '1 Tag'], ['1W', '1 Woche']]],
  ['Monate', [['1M', '1 Monat'], ['3M', '1 Quartal'], ['6M', '1 Halbjahr'], ['12M', '1 Jahr']]]
]

/** Main candle sizes as buttons, the rest in a dropdown; a size picked there shows on the dropdown button. */
function TimeframePicker() {
  const timeframe = useStore((s) => s.timeframe)
  const setTimeframe = useStore((s) => s.setTimeframe)
  const [open, setOpen] = useState(false)
  const pick = (tf: Timeframe) => {
    setTimeframe(tf)
    setOpen(false)
  }
  const other = !MAIN.includes(timeframe)
  const btn = (active: boolean) => `rounded px-2 py-0.5 text-xs ${active ? 'bg-accent text-white' : 'text-muted hover:text-white'}`
  return (
    <div className="relative flex rounded bg-bg p-0.5 ring-1 ring-line" role="group" aria-label="Zeiteinheit">
      {MAIN.map((tf) => (
        <button key={tf} onClick={() => pick(tf)} aria-pressed={tf === timeframe} className={btn(tf === timeframe)}>
          {tfLabel(tf)}
        </button>
      ))}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Alle Kerzengrößen"
        className={`${btn(other)} flex items-center gap-0.5 ${other ? '' : 'px-1'}`}
      >
        {other && tfLabel(timeframe)}
        <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-44 rounded border border-line bg-panel py-1 shadow-xl">
            {GROUPS.map(([title, items]) => (
              <div key={title}>
                <p className="px-3 pb-0.5 pt-1.5 text-[10px] uppercase tracking-wider text-muted">{title}</p>
                {items.map(([tf, name]) => (
                  <button
                    key={tf}
                    role="menuitemradio"
                    aria-checked={tf === timeframe}
                    onClick={() => pick(tf)}
                    className={`flex w-full items-center px-3 py-1 text-left text-sm hover:bg-bg ${tf === timeframe ? 'text-accent' : 'text-white'}`}
                  >
                    {name}
                    <span className="ml-auto text-xs text-muted/60">{tfLabel(tf)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const FEED: Record<FeedStatus['state'], [dot: string, label: string, hint: string]> = {
  off: ['bg-muted', 'Yahoo · verzögert', 'Kein Finnhub-Key: Aktienkurse alle 15 s über Yahoo. Klicken zum Eintragen.'],
  checking: ['bg-yellow-400 animate-pulse', 'Finnhub · prüfe Key…', 'API-Key wird geprüft.'],
  connecting: ['bg-yellow-400 animate-pulse', 'Finnhub · verbinde…', 'Key gültig, Echtzeit-Verbindung wird aufgebaut.'],
  live: ['bg-up', 'Finnhub · live', 'Key gültig, Echtzeit-Verbindung aktiv.'],
  error: ['bg-down', 'Finnhub · Fehler', 'Aktienkurse kommen ersatzweise über Yahoo.']
}

/** Finnhub connection status; opens the settings on click. */
function FeedBadge({ onClick }: { onClick: () => void }) {
  const feed = useQuotes((s) => s.feed)
  const [dot, label, hint] = FEED[feed.state]
  const details = [
    feed.detail,
    hint,
    feed.state === 'live' &&
      (feed.lastTrade
        ? `Letzter Trade: ${new Date(feed.lastTrade * 1000).toLocaleTimeString('de-DE')}`
        : 'Noch keine Trades empfangen (Börse evtl. geschlossen).')
  ]
  return (
    <button
      onClick={onClick}
      title={details.filter(Boolean).join('\n')}
      className="ml-auto flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted hover:bg-line hover:text-white"
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {label}
      {feed.state === 'error' && feed.detail && <span className="text-down">({feed.detail})</span>}
    </button>
  )
}

/** Shown only while the open chart is in no folder; puts it into the chosen one. */
function AddToWatchlist({ symbol }: { symbol: string }) {
  const folders = useStore((s) => s.folders)
  const addToFolder = useStore((s) => s.addToFolder)
  const addFolder = useStore((s) => s.addFolder)
  const [open, setOpen] = useState(false)
  if (folders.some((f) => f.symbols.includes(symbol))) return null

  const put = (folderId: string) => {
    addToFolder(folderId, symbol)
    setOpen(false)
  }
  const item = 'flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-bg'
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={`${symbol} zur Watchlist hinzufügen`}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-accent ring-1 ring-accent/50 hover:bg-accent/15"
      >
        <Plus size={14} /> Watchlist
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-56 rounded border border-line bg-panel py-1 shadow-xl">
            <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted">{symbol} hinzufügen zu</p>
            {folders.map((f) => (
              <button key={f.id} role="menuitem" onClick={() => put(f.id)} className={`${item} text-white`}>
                <FolderIcon size={14} className="shrink-0 text-muted" />
                <span className="truncate">{f.name}</span>
                <span className="ml-auto text-xs text-muted/60">{f.symbols.length}</span>
              </button>
            ))}
            <div className="my-1 h-px bg-line" />
            <button role="menuitem" onClick={() => put(addFolder('Neuer Ordner'))} className={`${item} text-muted`}>
              <FolderPlus size={14} className="shrink-0" /> Neuer Ordner
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// [field, label, step]
const ROWS: Record<keyof Indicators, { label: string; params: [string, string, number?][] }> = {
  sma: { label: 'SMA', params: [['period', 'Periode']] },
  ema: { label: 'EMA', params: [['period', 'Periode']] },
  ema3: { label: '3-fach EMA', params: [['fast', 'Kurz'], ['mid', 'Mittel'], ['slow', 'Lang']] },
  bb: { label: 'Bollinger Bands', params: [['period', 'Periode'], ['mult', 'StdAbw', 0.1]] },
  vwap: { label: 'VWAP', params: [] },
  supertrend: { label: 'Supertrend', params: [['period', 'ATR-Periode'], ['mult', 'Faktor', 0.1]] },
  rsi: { label: 'RSI', params: [['period', 'Periode']] },
  macd: { label: 'MACD', params: [['fast', 'Fast'], ['slow', 'Slow'], ['signal', 'Signal']] },
  stoch: { label: 'Stochastik', params: [['period', 'Periode'], ['smoothK', '%K'], ['smoothD', '%D']] },
  atr: { label: 'ATR', params: [['period', 'Periode']] }
}

function IndicatorMenu({ onClose }: { onClose: () => void }) {
  const indicators = useStore((s) => s.indicators)
  const setIndicator = useStore((s) => s.setIndicator)

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute left-0 top-full z-20 mt-1 w-80 rounded border border-line bg-panel p-2 shadow-xl">
        {(Object.keys(ROWS) as (keyof Indicators)[]).map((name) => {
          const cfg = indicators[name] as unknown as Record<string, number | boolean>
          return (
            <div key={name} className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-bg">
              <label className="flex flex-1 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={cfg.on as boolean}
                  onChange={(e) => setIndicator(name, { on: e.target.checked })}
                  className="accent-accent"
                />
                <span className="text-white">{ROWS[name].label}</span>
              </label>
              {ROWS[name].params.map(([field, label, step = 1]) => (
                <input
                  key={field}
                  type="number"
                  title={label}
                  aria-label={`${ROWS[name].label} ${label}`}
                  min={step}
                  max={500}
                  step={step}
                  value={cfg[field] as number}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (v >= step && v <= 500) setIndicator(name, { [field]: v })
                  }}
                  className="w-12 rounded bg-bg px-1 py-0.5 text-right text-xs outline-none ring-1 ring-line focus:ring-accent"
                />
              ))}
            </div>
          )
        })}
      </div>
    </>
  )
}
