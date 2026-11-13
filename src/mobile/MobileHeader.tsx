import { Bell, Check, ChevronDown, Maximize, Minimize, MoreVertical, Pencil, SlidersHorizontal } from 'lucide-react'
import { useState, type MouseEvent } from 'react'
import { t } from '../shared/i18n'
import { tfLabel } from '../shared/types'
import MarketBadge, { ExtIcon, extTitle } from '../renderer/src/components/MarketBadge'
import { IndicatorMenu } from '../renderer/src/components/TopBar'
import { formatChange, formatPrice } from '../renderer/src/lib/format'
import { usePcStatus } from '../renderer/src/lib/pcStatus'
import { metaFor, useChartMeta } from '../renderer/src/store/chartMeta'
import { useQuotes, useStore } from '../renderer/src/store/useStore'
import { useUnseen } from '../renderer/src/components/EventsButton'
import ActionMenu, { type ActionItem } from './ActionMenu'
import AskDialog, { type Ask } from './AskDialog'
import WatchStar, { removeFromWatchlist } from '../renderer/src/components/WatchStar'
import { notice } from './Notice'
import TabButton from './TabButton'
import TimeframeGrid from './TimeframeGrid'
import { useBack } from './useBack'

/** Below the clicked element: where a popup under a header button starts. */
const below = (e: MouseEvent<HTMLElement>) => e.currentTarget.getBoundingClientRect().bottom + 6
const cell = 'flex h-10 min-w-0 items-center justify-center gap-1 rounded-[10px] bg-bg text-muted ring-1 ring-line active:bg-line active:text-white'

/**
 * The phone's header: tab button, name with star, market state and PC, price with currency, ⋮; below it six equal
 * buttons (candle size, drawing, indicators, alarms, full screen, and a cell the chart fills with its forecast button).
 */
export default function MobileHeader(p: { drawing: boolean; onDraw(): void; onMenu(): void; onPc(): void; onAlarm(): void; onFull(): void }) {
  const symbol = useStore((s) => s.symbol)
  const timeframe = useStore((s) => s.timeframe)
  const names = useStore((s) => s.names)
  const folders = useStore((s) => s.folders)
  const quote = useQuotes((s) => s.quotes[symbol])
  const { currency, timeZone } = metaFor(useChartMeta(), symbol)
  const pc = usePcStatus((s) => s.state)
  const unseen = useUnseen(symbol).length
  const [grid, setGrid] = useState<number | null>(null)
  const [indicators, setIndicators] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ title: string; items: ActionItem[] } | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  useBack('indicators', indicators !== null, () => setIndicators(null))
  const name = names[symbol] ?? symbol
  const inWatchlist = folders.some((f) => f.symbols.includes(symbol))

  const star = () => {
    if (inWatchlist) return void removeFromWatchlist(symbol)
    const s = useStore.getState()
    const add = (id: string, folder: string) => {
      s.addToFolder(id, symbol)
      notice(t('Zu „{name}“ hinzugefügt', { name: folder }))
    }
    setMenu({
      title: t('Zur Watchlist hinzufügen …'),
      items: [
        ...s.folders.map((f) => ({ label: f.name, onPick: () => add(f.id, f.name) })),
        {
          label: t('Neuer Ordner …'),
          onPick: () => setAsk({ title: t('Neuer Ordner'), ok: t('Anlegen'), onOk: (n) => add(s.addFolder(n), n) })
        }
      ]
    })
  }

  return (
    <>
      <div className="flex items-center gap-2 px-2 pt-1">
        <TabButton />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-bold text-white">{name}</span>
            <WatchStar
              on={inWatchlist}
              onClick={star}
              title={inWatchlist ? t('Aus Watchlist löschen') : t('Zur Watchlist hinzufügen …')}
              small
            />
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
            <MarketBadge symbol={symbol} timeZone={timeZone} plain />
            {/* Only while paired: green = PC reachable, grey = PC off (tap for details in the settings). */}
            {pc !== 'none' && (
              <button
                onClick={p.onPc}
                aria-label={pc === 'online' ? t('PC erreichbar') : t('PC aus')}
                className={`shrink-0 px-1 font-semibold ${pc === 'online' ? 'text-up' : 'text-muted'}`}
              >
                · PC
              </button>
            )}
          </div>
        </div>
        {quote && (
          <div className="shrink-0 text-right tabular-nums">
            <div className="text-[15px] font-semibold text-white">
              {formatPrice(quote.price)}
              {currency && <span className="ml-1 text-[11px] font-semibold text-muted">{currency}</span>}
            </div>
            <div className={`text-xs font-medium ${quote.changePct >= 0 ? 'text-up' : 'text-down'}`}>{formatChange(quote.changePct)}</div>
            {/* Pre-market or after-hours price (US stocks), as the chart legend shows it on the PC. */}
            {quote.ext && (
              <div className="flex items-center justify-end gap-1 text-[11px]" title={extTitle(quote.ext)}>
                <ExtIcon phase={quote.ext.phase} size={11} />
                <span className="text-slate-200">{formatPrice(quote.ext.price)}</span>
                <span className={quote.ext.changePct >= 0 ? 'text-up' : 'text-down'}>{formatChange(quote.ext.changePct)}</span>
              </div>
            )}
          </div>
        )}
        {/* Events are in this menu; the yellow dot says there are unseen important events. */}
        <button onClick={p.onMenu} aria-label={unseen > 0 ? t('Mehr – neue Events') : t('Mehr')} className="mobile-icon relative w-8">
          <MoreVertical size={18} />
          {unseen > 0 && <span aria-hidden className="absolute right-0.5 top-1.5 h-2 w-2 rounded-full bg-amber-500" />}
        </button>
      </div>
      <div className="grid grid-cols-6 gap-2 px-2 pb-2 pt-1.5">
        <button onClick={(e) => setGrid(below(e))} aria-label={t('Alle Kerzengrößen')} aria-expanded={grid !== null} className="flex h-10 min-w-0 items-center justify-center gap-1 rounded-[10px] bg-brand text-sm font-semibold text-white shadow-glow active:brightness-110">
          {tfLabel(timeframe)}
          <ChevronDown size={16} className="text-white/80" />
        </button>
        <button
          onClick={p.onDraw}
          aria-label={p.drawing ? t('Zeichnen beenden') : t('Zeichnen')}
          aria-pressed={p.drawing}
          className={`${cell} ${p.drawing ? 'bg-brand text-white' : ''}`}
        >
          {p.drawing ? <Check size={18} /> : <Pencil size={18} />}
        </button>
        <button
          onClick={(e) => {
            // Read the position now: React calls the updater later, when the event no longer has its button.
            const top = below(e)
            setIndicators((o) => (o === null ? top : null))
          }}
          aria-label={t('Indikatoren')}
          aria-expanded={indicators !== null}
          className={cell}
        >
          <SlidersHorizontal size={18} />
        </button>
        <button onClick={p.onAlarm} aria-label={t('Kurs-Alarme')} className={cell}>
          <Bell size={18} />
        </button>
        <button onClick={p.onFull} aria-label={t('Vollbild')} className={cell}>
          <Maximize size={18} />
        </button>
        {/* ChartArea renders the forecast button in here (it owns the forecast's state). */}
        <div id="mobile-ki" className="h-10 min-w-0" />
      </div>
      {grid !== null && <TimeframeGrid top={grid} onClose={() => setGrid(null)} />}
      {indicators !== null && (
        <div className="fixed inset-x-2 z-40" style={{ top: indicators - 4 }}>
          <IndicatorMenu onClose={() => setIndicators(null)} />
        </div>
      )}
      {menu && <ActionMenu title={menu.title} items={menu.items} onClose={() => setMenu(null)} />}
      {ask && <AskDialog ask={ask} onClose={() => setAsk(null)} />}
    </>
  )
}

/** In full screen only the candle size, drawing and the way out stay, small and see-through left of the price axis. */
export function FullscreenBar({ drawing, onDraw, onExit }: { drawing: boolean; onDraw(): void; onExit(): void }) {
  const timeframe = useStore((s) => s.timeframe)
  const [grid, setGrid] = useState<number | null>(null)
  const small = 'flex h-9 items-center justify-center gap-0.5 rounded-[10px] bg-panel/70 text-slate-200 ring-1 ring-line backdrop-blur active:bg-line'
  return (
    <>
      <div className="fixed z-30 flex gap-1.5" style={{ top: 'calc(max(env(safe-area-inset-top), var(--safe-area-inset-top, 0px)) + 8px)', right: 'calc(var(--axis-w, 56px) + 8px)' }}>
        <button onClick={(e) => setGrid(below(e))} aria-label={t('Alle Kerzengrößen')} className={`${small} px-2.5 text-sm font-semibold`}>
          {tfLabel(timeframe)}
          <ChevronDown size={15} className="text-muted" />
        </button>
        <button
          onClick={onDraw}
          aria-label={drawing ? t('Zeichnen beenden') : t('Zeichnen')}
          aria-pressed={drawing}
          className={`${small} w-9 ${drawing ? 'bg-brand text-white' : ''}`}
        >
          {drawing ? <Check size={17} /> : <Pencil size={17} />}
        </button>
        <button onClick={onExit} aria-label={t('Vollbild beenden')} className={`${small} w-9`}>
          <Minimize size={17} />
        </button>
      </div>
      {grid !== null && <TimeframeGrid top={grid} onClose={() => setGrid(null)} />}
    </>
  )
}
