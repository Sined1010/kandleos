import { Activity, ChevronDown, Folder as FolderIcon, FolderPlus, Info, Plus, Search, Settings } from 'lucide-react'
import { useState } from 'react'
import { locale, msg, t } from '../../../shared/i18n'
import { isCrypto, tfLabel, type StockSource, type Timeframe } from '../../../shared/types'
import type { FeedStatus } from '../services/marketData'
import { useQuotes, useStore, type Indicators } from '../store/useStore'
import Logo from './Logo'
import SymbolSearch from './SymbolSearch'

export default function TopBar({ onOpenSettings, onOpenAbout }: { onOpenSettings: () => void; onOpenAbout: () => void }) {
  const symbol = useStore((s) => s.symbol)
  const setSymbol = useStore((s) => s.setSymbol)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="relative flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <Logo />
      {/* Hairline in the icon's gradient under the bar. */}
      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-brand opacity-40" />

      <div className="flex items-center gap-2 rounded-lg bg-bg px-2.5 py-1.5 ring-1 ring-line transition focus-within:shadow-glow focus-within:ring-accent">
        <Search size={14} className="text-muted" />
        <SymbolSearch
          value={symbol}
          onPick={setSymbol}
          placeholder={t('Symbol oder Name suchen')}
          inputClassName="w-44 bg-transparent font-medium uppercase text-white outline-none placeholder:normal-case placeholder:font-normal placeholder:text-muted/60"
        />
        <span className="rounded bg-line px-1.5 text-[10px] uppercase text-muted">{isCrypto(symbol) ? t('Krypto') : t('Aktie')}</span>
      </div>

      <AddToWatchlist symbol={symbol} />

      <TimeframePicker />

      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-muted hover:bg-line hover:text-white"
        >
          <Activity size={15} /> {t('Indikatoren')}
        </button>
        {menuOpen && <IndicatorMenu onClose={() => setMenuOpen(false)} />}
      </div>

      <FeedBadge onClick={onOpenSettings} />
      <button
        onClick={onOpenSettings}
        className="rounded p-1.5 text-muted hover:bg-line hover:text-white"
        title={t('Einstellungen')}
        aria-label={t('Einstellungen')}
      >
        <Settings size={16} />
      </button>
      <button
        onClick={onOpenAbout}
        className="rounded p-1.5 text-muted hover:bg-line hover:text-white"
        title={t('Über KandleOS, Haftung, Datenschutz, Lizenzen')}
        aria-label={t('Über KandleOS')}
      >
        <Info size={16} />
      </button>
    </header>
  )
}

// Shown as buttons; every candle size, these included, is in the dropdown next to them.
const MAIN: Timeframe[] = ['15m', '1h', '4h', '1D', '1W', '1M']
const GROUPS: [title: string, items: [Timeframe, string][]][] = [
  [msg('Minuten'), [['1m', msg('1 Minute')], ['5m', msg('5 Minuten')], ['15m', msg('15 Minuten')], ['30m', msg('30 Minuten')]]],
  [msg('Stunden'), [['1h', msg('1 Stunde')], ['2h', msg('2 Stunden')], ['4h', msg('4 Stunden')]]],
  [msg('Tage'), [['1D', msg('1 Tag')], ['1W', msg('1 Woche')]]],
  [msg('Monate'), [['1M', msg('1 Monat')], ['3M', msg('1 Quartal')], ['6M', msg('1 Halbjahr')], ['12M', msg('1 Jahr')]]]
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
  const btn = (active: boolean) => `rounded-md px-2 py-0.5 text-xs ${active ? 'bg-brand text-white shadow-glow' : 'text-muted hover:text-white'}`
  return (
    <div className="relative flex rounded-lg bg-bg p-0.5 ring-1 ring-line" role="group" aria-label={t('Zeiteinheit')}>
      {MAIN.map((tf) => (
        <button key={tf} onClick={() => pick(tf)} aria-pressed={tf === timeframe} className={btn(tf === timeframe)}>
          {tfLabel(tf)}
        </button>
      ))}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t('Alle Kerzengrößen')}
        className={`${btn(other)} flex items-center gap-0.5 ${other ? '' : 'px-1'}`}
      >
        {other && tfLabel(timeframe)}
        <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-line bg-panel/95 backdrop-blur py-1 shadow-2xl shadow-black/50">
            {GROUPS.map(([title, items]) => (
              <div key={title}>
                <p className="px-3 pb-0.5 pt-1.5 text-[10px] uppercase tracking-wider text-muted">{t(title)}</p>
                {items.map(([tf, name]) => (
                  <button
                    key={tf}
                    role="menuitemradio"
                    aria-checked={tf === timeframe}
                    onClick={() => pick(tf)}
                    className={`flex w-full items-center px-3 py-1 text-left text-sm hover:bg-bg ${tf === timeframe ? 'text-accent' : 'text-white'}`}
                  >
                    {t(name)}
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

/** Without Finnhub the badge names the stock source. */
const SOURCE: Record<StockSource, [dot: string, label: string, hint: string]> = {
  alpaca: ['bg-up', msg('Alpaca · IEX'), msg('Aktienkurse über Alpaca: Echtzeit von der Börse IEX, alle 5 s. Klicken für die Einstellungen.')],
  yahoo: ['bg-muted', msg('Yahoo · verzögert'), msg('Aktienkurse alle 15 s über Yahoo Finance (nur für private Zwecke). Klicken für die Einstellungen.')],
  none: ['bg-muted', msg('Nur Krypto'), msg('Keine Datenquelle für Aktien gewählt. Klicken für die Einstellungen.')]
}

const FEED: Record<Exclude<FeedStatus['state'], 'off'>, [dot: string, label: string, hint: string]> = {
  checking: ['bg-yellow-400 animate-pulse', msg('Finnhub · prüfe Key…'), msg('API-Key wird geprüft.')],
  connecting: ['bg-yellow-400 animate-pulse', msg('Finnhub · verbinde…'), msg('Key gültig, Echtzeit-Verbindung wird aufgebaut.')],
  live: ['bg-up', msg('Finnhub · live'), msg('Key gültig, Echtzeit-Verbindung aktiv.')],
  error: ['bg-down', msg('Finnhub · Fehler'), msg('Aktienkurse kommen ersatzweise über die gewählte Datenquelle.')]
}

/** Stock data source, or the Finnhub connection when a key is set; opens the settings on click. */
function FeedBadge({ onClick }: { onClick: () => void }) {
  const feed = useQuotes((s) => s.feed)
  const source = useStore((s) => s.stockSource) ?? 'none'
  const [dot, label, hint] = feed.state === 'off' ? SOURCE[source] : FEED[feed.state]
  const details = [
    feed.detail,
    t(hint),
    feed.state === 'live' &&
      (feed.lastTrade
        ? t('Letzter Trade: {time}', { time: new Date(feed.lastTrade * 1000).toLocaleTimeString(locale()) })
        : t('Noch keine Trades empfangen (Börse evtl. geschlossen).'))
  ]
  return (
    <button
      onClick={onClick}
      title={details.filter(Boolean).join('\n')}
      className="ml-auto flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted hover:bg-line hover:text-white"
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {t(label)}
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
        title={t('{symbol} zur Watchlist hinzufügen', { symbol })}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-accent ring-1 ring-accent/50 transition hover:bg-accent/15 hover:shadow-glow"
      >
        <Plus size={14} /> Watchlist
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-line bg-panel/95 backdrop-blur py-1 shadow-2xl shadow-black/50">
            <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted">{t('{symbol} hinzufügen zu', { symbol })}</p>
            {folders.map((f) => (
              <button key={f.id} role="menuitem" onClick={() => put(f.id)} className={`${item} text-white`}>
                <FolderIcon size={14} className="shrink-0 text-muted" />
                <span className="truncate">{f.name}</span>
                <span className="ml-auto text-xs text-muted/60">{f.symbols.length}</span>
              </button>
            ))}
            <div className="my-1 h-px bg-line" />
            <button role="menuitem" onClick={() => put(addFolder(t('Neuer Ordner')))} className={`${item} text-muted`}>
              <FolderPlus size={14} className="shrink-0" /> {t('Neuer Ordner')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// [field, label, step]
const ROWS: Record<keyof Indicators, { label: string; params: [string, string, number?][] }> = {
  sma: { label: 'SMA', params: [['period', msg('Periode')]] },
  ema: { label: 'EMA', params: [['period', msg('Periode')]] },
  ema3: { label: msg('3-fach EMA'), params: [['fast', msg('Kurz')], ['mid', msg('Mittel')], ['slow', msg('Lang')]] },
  bb: { label: 'Bollinger Bands', params: [['period', msg('Periode')], ['mult', msg('StdAbw'), 0.1]] },
  vwap: { label: 'VWAP', params: [] },
  supertrend: { label: 'Supertrend', params: [['period', msg('ATR-Periode')], ['mult', msg('Faktor'), 0.1]] },
  rsi: { label: 'RSI', params: [['period', msg('Periode')]] },
  macd: { label: 'MACD', params: [['fast', 'Fast'], ['slow', 'Slow'], ['signal', 'Signal']] },
  stoch: { label: msg('Stochastik'), params: [['period', msg('Periode')], ['smoothK', '%K'], ['smoothD', '%D']] },
  atr: { label: 'ATR', params: [['period', msg('Periode')]] }
}

function IndicatorMenu({ onClose }: { onClose: () => void }) {
  const indicators = useStore((s) => s.indicators)
  const setIndicator = useStore((s) => s.setIndicator)

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute left-0 top-full z-20 mt-1 w-80 rounded-lg border border-line bg-panel/95 backdrop-blur p-2 shadow-2xl shadow-black/50">
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
                <span className="text-white">{t(ROWS[name].label)}</span>
              </label>
              {ROWS[name].params.map(([field, label, step = 1]) => (
                <input
                  key={field}
                  type="number"
                  title={t(label)}
                  aria-label={`${t(ROWS[name].label)} ${t(label)}`}
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
