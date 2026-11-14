import {
  ArrowLeft,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronUp,
  GripVertical,
  LayoutGrid,
  List,
  Pin,
  Plus,
  Search
} from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { t } from '../shared/i18n'
import { isCrypto } from '../shared/types'
import { InfoPanel } from '../renderer/src/components/CompanyInfo'
import { ExtIcon, extTitle, MarketDot } from '../renderer/src/components/MarketBadge'
import SymbolSearch from '../renderer/src/components/SymbolSearch'
import { removeFromWatchlist } from '../renderer/src/components/WatchStar'
import { useSymbolNames } from '../renderer/src/components/Watchlist'
import { AlarmMark, ChangePill, folderOf, FolderAvg, sortOptions, UpDownCount, usePinned, useSortedSymbols } from '../renderer/src/components/WatchParts'
import { formatChange, formatPrice } from '../renderer/src/lib/format'
import { MAX_TABS, useQuotes, useStore, type Folder } from '../renderer/src/store/useStore'
import ActionMenu, { type ActionItem } from './ActionMenu'
import AskDialog, { type Ask } from './AskDialog'
import Layer from './Layer'
import { ask as confirmBox } from './MessageBox'
import Sheet from './Sheet'
import type { SheetPos } from './sheetSnap'
import { useBack } from './useBack'
import { useLongPress } from './useLongPress'

type Menu = { title: string; items: ActionItem[] }
/** Where a dragged row would land: before `before` in folder `folder` (null = at the end). */
type Drop = { folder: string; before: string | null }

/** The watchlist as a sheet below the chart, with the search on top (layout C). */
export default function WatchSheet({ pos, onPos, extraItems }: { pos: SheetPos; onPos(p: SheetPos): void; extraItems?: (symbol: string) => ActionItem[] }) {
  const folders = useStore((s) => s.folders)
  const count = new Set(folders.flatMap((f) => f.symbols)).size
  const anyOpen = folders.some((f) => !f.collapsed)
  // Actions and values read when a menu opens; the lists below subscribe on their own.
  const s = useStore.getState()
  const [menu, setMenu] = useState<Menu | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [drag, setDrag] = useState<{ symbol: string; from: string; drop: Drop | null } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useSymbolNames()
  const sort = useStore((st) => st.watchlistSort)
  const storedView = useStore((st) => st.watchlistView)
  // "Reorder" mode: grips on, always in the list. It never writes the stored view, so closing leaves the device's view as it was.
  const [ordering, setOrdering] = useState(false)
  const view = ordering ? 'list' : storedView
  // Folder open in the folder view (kept while reordering, so "Done" returns to it).
  const [openId, setOpenId] = useState<string | null>(null)
  const openFolder = view === 'folders' ? folders.find((f) => f.id === openId) : undefined
  // Here, not inside <Sheet>: the sheet's own back entry must lie below these (parent effects run after the child's).
  useBack('ordering', ordering && pos !== 'low', () => setOrdering(false))
  useBack('watch-folder', !!openFolder && pos !== 'low', () => setOpenId(null))
  useEffect(() => {
    if (pos === 'low') setOrdering(false)
  }, [pos])
  // A deleted folder cannot stay open.
  useEffect(() => {
    if (openId && !folders.some((f) => f.id === openId)) setOpenId(null)
  }, [folders, openId])

  const startOrdering = () => {
    s.setWatchlistSort('own')
    setOrdering(true)
    // From an open folder: unfold it in the list, so its grips show.
    if (openFolder?.collapsed) s.toggleFolder(openFolder.id)
  }
  const sortMenu = (): Menu => ({
    title: t('Sortieren'),
    items: [
      ...sortOptions().map((o) => ({ label: `${o.value === sort ? '✓ ' : ''}${o.label}`, onPick: () => s.setWatchlistSort(o.value) })),
      { label: t('Reihenfolge ändern …'), onPick: startOrdering }
    ]
  })

  const open = (symbol: string) => {
    s.setSymbol(symbol)
    onPos('low')
  }

  /** pinned: opened from the pinned rows, where deleting means the whole watchlist (the symbol may sit in two folders). */
  const rowMenu = (symbol: string, folderId: string, pinned?: boolean): Menu => {
    const others = folders.filter((f) => f.id !== folderId)
    return {
      title: s.names[symbol] ?? symbol,
      items: [
        { label: t('Öffnen'), onPick: () => open(symbol) },
        {
          label: t('In neuem Tab öffnen'),
          disabled: s.tabs.length >= MAX_TABS,
          onPick: () => {
            s.addTab()
            open(symbol)
          }
        },
        {
          label: s.pinned.includes(symbol) ? t('Nicht mehr anheften') : t('Oben anheften'),
          onPick: () => s.togglePin(symbol)
        },
        { label: t('Infos zum Wert'), disabled: isCrypto(symbol), onPick: () => setInfo(symbol) },
        ...(extraItems?.(symbol) ?? []),
        {
          label: t('Umbenennen'),
          onPick: () =>
            setAsk({
              title: t('Anzeigename'),
              value: s.names[symbol] ?? symbol,
              ok: t('Speichern'),
              allowEmpty: true,
              onOk: (n) => s.setName(symbol, n === symbol ? '' : n)
            })
        },
        {
          label: t('Verschieben nach …'),
          disabled: !others.length,
          onPick: () =>
            setMenu({
              title: t('Verschieben nach …'),
              items: others.map((f) => ({ label: f.name, onPick: () => s.moveSymbol(symbol, folderId, f.id) }))
            })
        },
        pinned
          ? { label: t('Aus Watchlist löschen'), danger: true, onPick: () => void removeFromWatchlist(symbol) }
          : { label: t('Aus Watchlist löschen'), danger: true, onPick: async () =>
            (await confirmBox(t('„{name}“ aus der Watchlist löschen?', { name: s.names[symbol] ?? symbol }), t('Löschen'), { danger: true })) &&
            s.removeFromFolder(folderId, symbol)
        }
      ]
    }
  }

  const folderMenu = (id: string, name: string): Menu => ({
    title: name,
    items: [
      {
        label: t('Umbenennen'),
        onPick: () => setAsk({ title: t('Ordnername'), value: name, ok: t('Speichern'), onOk: (n) => s.renameFolder(id, n) })
      },
      {
        label: t('Ordner löschen'),
        danger: true,
        onPick: async () => (await confirmBox(t('Ordner „{name}“ mit allen Werten löschen?', { name }), t('Löschen'), { danger: true })) && s.removeFolder(id)
      }
    ]
  })

  const newFolder = () => setAsk({ title: t('Neuer Ordner'), ok: t('Anlegen'), onOk: (n) => void s.addFolder(n) })

  // Reordering by the grip: the row under the finger is the drop target.
  const dropAt = (x: number, y: number): Drop | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-row], [data-folder-end]')
    if (!el) return null
    if (el.dataset.folderEnd) return { folder: el.dataset.folderEnd, before: null }
    return { folder: el.dataset.folder!, before: el.dataset.row! }
  }

  return (
    <>
      <Sheet
        pos={pos}
        onPos={onPos}
        head={
          <div className="relative px-3 pb-1" onFocus={() => pos === 'low' && onPos('full')}>
            <Search size={18} className="pointer-events-none absolute left-6 top-3 z-10 text-muted" aria-hidden />
            <SymbolSearch
              compact
              placeholder={t('Aktien, ETF oder Krypto suchen')}
              // A found value opens at once; the star in the header adds it to the watchlist.
              onPick={open}
              inputClassName="w-full rounded-xl bg-bg py-2.5 pl-10 pr-3 text-base text-white outline-none ring-1 ring-line placeholder:text-muted focus:ring-accent"
            />
            <div className="flex items-center">
              {/* Same word in both languages; shows in the folded sheet too, so it is clear what is pulled up. Not a
                  <button>: the sheet's head is dragged from here and a tap on it opens or folds the sheet (Sheet.tsx). */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={pos !== 'low'}
                // Touches toggle through the sheet's own tap (Sheet.tsx); keyboard and TalkBack clicks come without a pointer (detail 0).
                onClick={(e) => e.detail === 0 && onPos(pos === 'low' ? 'half' : 'low')}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  onPos(pos === 'low' ? 'half' : 'low')
                }}
                className="flex min-h-8 w-fit items-center gap-1.5 px-1 pt-0.5 text-sm font-bold text-white"
              >
                Watchlist
                {pos === 'low' ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
                <span className="text-xs font-medium text-muted">{count === 1 ? t('{n} Wert', { n: count }) : t('{n} Werte', { n: count })}</span>
              </div>
              {/* Folded: today's rising and falling values. Not a button, so a tap on it opens the sheet too. */}
              {pos === 'low' && <UpDownCount symbols={folders.flatMap((f) => f.symbols)} className="ml-auto pr-1 text-[13px]" />}
              {/* <button>s, so the sheet ignores their taps; 36 px look, 44 px to tap. */}
              {pos !== 'low' && ordering && (
                <button type="button" onClick={() => setOrdering(false)} className="ml-auto flex h-11 items-center">
                  <span className="rounded-[10px] bg-brand px-4 py-2 text-sm font-semibold text-white">{t('Fertig')}</span>
                </button>
              )}
              {pos !== 'low' && !ordering && (
                <span className="-mr-1 ml-auto flex">
                  <HeadButton
                    onClick={() => s.setWatchlistView(view === 'list' ? 'folders' : 'list')}
                    label={view === 'list' ? t('Ordneransicht') : t('Listenansicht')}
                  >
                    {view === 'list' ? <LayoutGrid size={17} /> : <List size={17} />}
                  </HeadButton>
                  <HeadButton onClick={() => setMenu(sortMenu())} label={t('Sortieren')} on={sort !== 'own'}>
                    <ArrowUpDown size={17} />
                  </HeadButton>
                  {view === 'list' && folders.length > 0 && (
                    // Like the PC: closes all while any is open, otherwise opens all.
                    <HeadButton
                      onClick={() => s.setAllCollapsed(anyOpen)}
                      label={anyOpen ? t('Alle Ordner zuklappen') : t('Alle Ordner aufklappen')}
                    >
                      {anyOpen ? <ChevronsDownUp size={17} /> : <ChevronsUpDown size={17} />}
                    </HeadButton>
                  )}
                </span>
              )}
            </div>
          </div>
        }
      >
        <div ref={listRef} className="pb-4">
          {view === 'list' && (
            <>
              {!ordering && <PinnedRows shown={pos !== 'low'} onOpen={open} onMenu={(sym) => setMenu(rowMenu(sym, folderOf(sym), true))} />}
              {folders.map((f) => (
                <FolderRows
                  shown={pos !== 'low'}
                  key={f.id}
                  folder={f}
                  ordering={ordering}
                  drop={drag?.drop?.folder === f.id ? drag.drop.before : undefined}
                  onToggle={() => s.toggleFolder(f.id)}
                  onFolderMenu={() => setMenu(folderMenu(f.id, f.name))}
                  onOpen={open}
                  onMenu={(sym) => setMenu(rowMenu(sym, f.id))}
                  onGrip={(sym, e) => {
                    setDrag({ symbol: sym, from: f.id, drop: null })
                    // Keeps the moves coming while the finger leaves the grip (fails only for synthetic events).
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId)
                    } catch {
                      // not capturable: the row still gets the moves while the finger stays on it
                    }
                  }}
                  onGripMove={(e) => drag && setDrag({ ...drag, drop: dropAt(e.clientX, e.clientY) })}
                  onGripUp={() => {
                    if (drag?.drop && drag.drop.before !== drag.symbol) s.moveSymbol(drag.symbol, drag.from, drag.drop.folder, drag.drop.before)
                    setDrag(null)
                  }}
                />
              ))}
              <button onClick={() => newFolder()} className="mx-3 mt-2 flex min-h-12 items-center gap-2 text-muted active:text-white">
                <Plus size={16} /> {t('Neuer Ordner')}
              </button>
            </>
          )}
          {view === 'folders' && !openFolder && (
            <PinnedTiles shown={pos !== 'low'} onOpen={open} onMenu={(sym) => setMenu(rowMenu(sym, folderOf(sym), true))} />
          )}
          {view === 'folders' && !openFolder && (
            <div className="grid grid-cols-3 gap-1.5 px-3 pt-1">
              {folders.map((f) => (
                <FolderTile key={f.id} folder={f} onOpen={() => setOpenId(f.id)} onMenu={() => setMenu(folderMenu(f.id, f.name))} />
              ))}
              <button
                onClick={() => newFolder()}
                className="flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-xs text-muted active:bg-line/40 active:text-white"
              >
                <Plus size={20} />
                {t('Neuer Ordner')}
              </button>
            </div>
          )}
          {openFolder && (
            <>
              <button
                onClick={() => setOpenId(null)}
                className="flex min-h-11 w-full items-center gap-2 border-y border-line px-3 text-left font-semibold text-white active:bg-line/40"
              >
                <ArrowLeft size={18} className="shrink-0 text-muted" />
                <span className="sr-only">{t('Zurück zu den Ordnern')}</span>
                <span className="min-w-0 truncate">{openFolder.name}</span>
                <span className="shrink-0 text-xs font-normal text-muted">· {openFolder.symbols.length}</span>
                <FolderAvg symbols={openFolder.symbols} className="ml-auto pl-2 text-xs" />
              </button>
              <FolderTiles shown={pos !== 'low'} folder={openFolder} onOpen={open} onMenu={(sym) => setMenu(rowMenu(sym, openFolder.id))} />
            </>
          )}
        </div>
      </Sheet>
      {menu && <ActionMenu title={menu.title} items={menu.items} onClose={() => setMenu(null)} />}
      {ask && <AskDialog ask={ask} onClose={() => setAsk(null)} />}
      {info && (
        <Layer id="info" title={s.names[info] ?? info} onClose={() => setInfo(null)}>
          <InfoPanel symbol={info} page />
        </Layer>
      )}
    </>
  )
}

/** Header button: 36 px look, 44 px tap area. */
function HeadButton(p: { onClick(): void; label: string; on?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={p.onClick} aria-label={p.label} aria-pressed={p.on} className="flex h-11 w-11 items-center justify-center">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-[10px] ring-1 ${p.on ? 'bg-accent/15 text-white ring-accent' : 'text-muted ring-line'}`}
      >
        {p.children}
      </span>
    </button>
  )
}

/** One folder in the list: its head and rows. A component of its own, so the sort hook is not called in a loop. */
function FolderRows(p: {
  folder: Folder
  ordering: boolean
  /** The sheet is pulled up: re-sorts at once when it opens. */
  shown: boolean
  /** Drop marker in this folder: before this symbol, null = at the end, undefined = none. */
  drop: string | null | undefined
  onToggle(): void
  onFolderMenu(): void
  onOpen(symbol: string): void
  onMenu(symbol: string): void
  onGrip(symbol: string, e: PointerEvent<HTMLButtonElement>): void
  onGripMove(e: PointerEvent): void
  onGripUp(): void
}) {
  const f = p.folder
  const sorted = useSortedSymbols(f.symbols, p.shown)
  const order = p.ordering ? f.symbols : sorted
  return (
    <section>
      <FolderHead folder={f} onToggle={p.onToggle} onMenu={p.onFolderMenu} />
      {!f.collapsed &&
        order.map((sym) => (
          <Row
            key={sym}
            symbol={sym}
            folder={f.id}
            marked={p.drop === sym}
            ordering={p.ordering}
            onOpen={() => p.onOpen(sym)}
            onMenu={() => p.onMenu(sym)}
            onGrip={(e) => p.onGrip(sym, e)}
            onGripMove={p.onGripMove}
            onGripUp={p.onGripUp}
          />
        ))}
      {!f.collapsed && <div data-folder-end={f.id} className={`h-3 ${p.drop === null ? 'border-t-2 border-accent' : ''}`} />}
    </section>
  )
}

function FolderHead(p: { folder: Folder; onToggle(): void; onMenu(): void }) {
  const press = useLongPress(p.onMenu, p.onToggle)
  const f = p.folder
  return (
    <div {...press} className="flex min-h-11 items-center gap-1 bg-bg/60 px-3 text-xs uppercase tracking-wider text-muted active:bg-line/40">
      {f.collapsed ? <ChevronRight size={14} className="shrink-0" /> : <ChevronDown size={14} className="shrink-0" />}
      <span className="min-w-0 truncate font-semibold">{f.name}</span>
      <span className="shrink-0">· {f.symbols.length}</span>
      {/* Also for a folded folder: the feed covers the whole watchlist. */}
      <FolderAvg symbols={f.symbols} className="ml-auto shrink-0 pl-2 normal-case tracking-normal" />
    </div>
  )
}

/** Heading of the pinned symbols, above the folders. */
function PinnedHead({ count }: { count: number }) {
  return (
    <div className="flex min-h-11 items-center gap-1.5 px-3 text-xs uppercase tracking-wider text-muted">
      <Pin size={14} className="shrink-0 text-accent" />
      <span className="font-semibold">{t('Angeheftet')}</span>
      <span className="shrink-0">· {count}</span>
    </div>
  )
}

/** Pinned symbols as rows above the folders; a tap opens, a long press is the row menu (which unpins). */
function PinnedRows(p: { shown: boolean; onOpen(symbol: string): void; onMenu(symbol: string): void }) {
  const order = useSortedSymbols(usePinned(), p.shown)
  if (!order.length) return null
  const none = () => {}
  return (
    <section className="mb-2 bg-accent/[0.06]">
      <PinnedHead count={order.length} />
      {order.map((sym) => (
        <Row
          key={sym}
          symbol={sym}
          folder=""
          marked={false}
          ordering={false}
          onOpen={() => p.onOpen(sym)}
          onMenu={() => p.onMenu(sym)}
          onGrip={none}
          onGripMove={none}
          onGripUp={none}
        />
      ))}
      <div className="h-3" />
    </section>
  )
}

/** Folder view: the pinned symbols as value tiles above the folder tiles. */
function PinnedTiles(p: { shown: boolean; onOpen(symbol: string): void; onMenu(symbol: string): void }) {
  const order = useSortedSymbols(usePinned(), p.shown)
  if (!order.length) return null
  return (
    <section className="mb-2 border-b border-line bg-accent/[0.06] pb-3">
      <PinnedHead count={order.length} />
      <div className="grid grid-cols-2 gap-2 px-3 pt-2">
        {order.map((sym) => (
          <ValueTile key={sym} symbol={sym} onOpen={() => p.onOpen(sym)} onMenu={() => p.onMenu(sym)} />
        ))}
      </div>
    </section>
  )
}

/** Name (+ alarm bell) and, below, market dot with ticker, or pre-/after-market price and change for US stocks. */
function Names({ symbol, big }: { symbol: string; big?: boolean }) {
  const q = useQuotes((s) => s.quotes[symbol])
  const name = useStore((s) => s.names[symbol])
  const ext = q?.ext
  const dot = <MarketDot symbol={symbol} timeZone={q?.timezone} />
  const second = ext ? (
    <span className="flex min-w-0 items-center gap-1 tabular-nums" title={extTitle(ext)}>
      {dot}
      <ExtIcon phase={ext.phase} size={11} />
      <span className="text-slate-200">{formatPrice(ext.price)}</span>
      <span className={ext.changePct >= 0 ? 'text-up' : 'text-down'}>{formatChange(ext.changePct)}</span>
    </span>
  ) : (
    name && (
      <span className="flex min-w-0 items-center gap-1.5">
        {dot}
        <span className="truncate">{symbol}</span>
      </span>
    )
  )
  return (
    <div className="min-w-0 flex-1">
      <p className={`flex min-w-0 items-center gap-1.5 font-semibold text-white ${big ? 'text-[14.5px]' : 'text-sm'}`}>
        {!name && !ext && dot}
        <span className="truncate">{name ?? symbol}</span>
        <AlarmMark symbol={symbol} />
      </p>
      {second && <div className="text-[11px] text-muted">{second}</div>}
    </div>
  )
}

function Row(p: {
  symbol: string
  folder: string
  marked: boolean
  ordering: boolean
  onOpen(): void
  onMenu(): void
  onGrip(e: PointerEvent<HTMLButtonElement>): void
  onGripMove(e: PointerEvent): void
  onGripUp(): void
}) {
  const q = useQuotes((s) => s.quotes[p.symbol])
  const press = useLongPress(p.onMenu, p.onOpen)
  return (
    <div
      data-row={p.symbol}
      data-folder={p.folder}
      className={`flex min-h-[50px] items-stretch border-b border-line/50 pl-3 active:bg-line/40 ${p.ordering ? '' : 'pr-3'} ${p.marked ? 'border-t-2 border-t-accent' : ''}`}
    >
      <div {...press} className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5">
        <Names symbol={p.symbol} big />
        <span className="shrink-0 text-right text-[14.5px] font-semibold tabular-nums text-white">{q ? formatPrice(q.price) : '—'}</span>
        <ChangePill change={q?.changePct} className="w-16 shrink-0 py-1 text-xs" />
      </div>
      {/* Grips only while reordering: the row has more room the rest of the time. */}
      {p.ordering && (
        <button
          aria-label={t('Verschieben')}
          data-grip
          className="flex w-11 shrink-0 touch-none items-center justify-center text-muted"
          onPointerDown={p.onGrip}
          onPointerMove={p.onGripMove}
          onPointerUp={p.onGripUp}
          onPointerCancel={p.onGripUp}
        >
          <GripVertical size={18} />
        </button>
      )}
    </div>
  )
}

/** Folder view: a folder as a tile (icon with count, name, Ø); tap opens, long press is the folder menu. */
function FolderTile(p: { folder: Folder; onOpen(): void; onMenu(): void }) {
  const press = useLongPress(p.onMenu, p.onOpen)
  const f = p.folder
  return (
    <div
      {...press}
      role="button"
      aria-label={t('{name} öffnen', { name: f.name })}
      className="flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 pb-2 pt-2.5 active:bg-line/40"
    >
      <span className="relative block h-10 w-[52px]">
        <span className="absolute left-0 top-0 h-2 w-5 rounded-t-sm bg-brand-from/80" />
        <span className="absolute inset-x-0 bottom-0 top-1 rounded-md rounded-tl-none bg-brand shadow-glow" />
        <span className="absolute bottom-1 right-1 rounded bg-bg/60 px-1 text-[10px] tabular-nums text-white">{f.symbols.length}</span>
      </span>
      <span className="w-full truncate text-center text-xs text-white">{f.name}</span>
      <FolderAvg symbols={f.symbols} className="text-[11.5px]" />
    </div>
  )
}

/** The open folder's symbols as tiles, two per row, in the chosen order. */
function FolderTiles(p: { shown: boolean; folder: Folder; onOpen(symbol: string): void; onMenu(symbol: string): void }) {
  const order = useSortedSymbols(p.folder.symbols, p.shown)
  if (!order.length) return <p className="px-4 py-6 text-center text-sm text-muted">{t('Leer – Werte über die Suche oben hinzufügen')}</p>
  return (
    <div className="grid grid-cols-2 gap-2 px-3 pt-2">
      {order.map((sym) => (
        <ValueTile key={sym} symbol={sym} onOpen={() => p.onOpen(sym)} onMenu={() => p.onMenu(sym)} />
      ))}
    </div>
  )
}

function ValueTile(p: { symbol: string; onOpen(): void; onMenu(): void }) {
  const q = useQuotes((s) => s.quotes[p.symbol])
  const press = useLongPress(p.onMenu, p.onOpen)
  return (
    <div {...press} className="flex min-w-0 rounded-xl bg-bg px-2.5 py-2 ring-1 ring-line active:bg-line/40">
      <div className="flex min-w-0 flex-1 flex-col">
        <Names symbol={p.symbol} />
        {/* A long price pushes the pill to the next line rather than being cut. */}
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-1 gap-y-0.5 tabular-nums">
          <span className="text-[13.5px] font-semibold text-white">{q ? formatPrice(q.price) : '—'}</span>
          <ChangePill change={q?.changePct} className="ml-auto shrink-0 px-1.5 py-px text-[11px]" />
        </div>
      </div>
    </div>
  )
}
