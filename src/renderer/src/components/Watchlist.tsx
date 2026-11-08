import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FolderPlus,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Trash2,
  X
} from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { t } from '../../../shared/i18n'
import { isCrypto } from '../../../shared/types'
import { formatChange, formatPrice } from '../lib/format'
import { insertTarget } from '../lib/watchlist'
import { MAX_TABS, useQuotes, useStore, type Folder } from '../store/useStore'
import AlarmsModal from './AlarmsModal'
import { InfoPanel } from './CompanyInfo'
import { ExtIcon, extTitle, MarketDot } from './MarketBadge'
import SymbolSearch from './SymbolSearch'

type Drag = RefObject<{ symbol: string; from: string } | null>
/** Marks drags that started on a watchlist symbol. */
const DRAG_TYPE = 'application/x-kandleos-symbol'
/**
 * A right-clicked watchlist row: which symbol in which folder, where the mouse was, the row's left edge and how
 * to start renaming it (the row edits its own name).
 */
type RowAt = { symbol: string; folderId: string; x: number; y: number; left: number; rename: () => void }
type MenuItem = { label: string; run?: () => void; reason?: string; danger?: boolean }

const deleteFolder = (f: Folder) =>
  (!f.symbols.length || confirm(t('Ordner „{name}“ mit {count} Symbolen löschen?', { name: f.name, count: f.symbols.length }))) &&
  useStore.getState().removeFolder(f.id)

const removeSymbol = (folderId: string, symbol: string) => {
  const { names, removeFromFolder } = useStore.getState()
  if (confirm(t('„{name}“ aus der Watchlist löschen?', { name: names[symbol] ?? symbol }))) removeFromFolder(folderId, symbol)
}

/** Folder menu shared by the list heading, the open folder's bar and the folder tile; only the first entry differs. */
const folderMenu = (f: Folder, first: MenuItem, rename: () => void, add: () => void): MenuItem[] => [
  first,
  { label: t('Umbenennen'), run: rename },
  { label: t('Symbol hinzufügen'), run: add },
  { label: t('Ordner löschen'), run: () => deleteFolder(f), danger: true }
]

function FolderNameInput({ folder: f, onDone, className }: { folder: Folder; onDone: () => void; className: string }) {
  const rename = useStore((s) => s.renameFolder)
  return (
    <input
      autoFocus
      defaultValue={f.name}
      maxLength={40}
      aria-label={t('Ordnername')}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.target.select()}
      onBlur={(e) => {
        rename(f.id, e.target.value.trim() || f.name)
        onDone()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.currentTarget.value = f.name
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
      }}
      className={`min-w-0 rounded bg-bg px-1 text-xs text-white outline-none ring-1 ring-accent ${className}`}
    />
  )
}

/** Fills in readable names for symbols that have none yet (new symbols, or after a reset); shared with the phone. */
export function useSymbolNames(): RefObject<Set<string>> {
  const folders = useStore((s) => s.folders)
  const names = useStore((s) => s.names)
  const setName = useStore((s) => s.setName)
  // Symbols already looked up this session, so a symbol Yahoo does not know is not asked for again.
  const looked = useRef(new Set<string>())
  useEffect(() => {
    for (const s of new Set(folders.flatMap((f) => f.symbols))) {
      if (names[s] || looked.current.has(s)) continue
      looked.current.add(s)
      window.api
        .symbolName(s)
        // A name typed by the user while the lookup ran wins.
        .then((n) => n && !useStore.getState().names[s] && setName(s, n))
        .catch(() => {})
    }
  }, [folders, names, setName])
  return looked
}

export default function Watchlist() {
  const folders = useStore((s) => s.folders)
  const addFolder = useStore((s) => s.addFolder)
  const view = useStore((s) => s.watchlistView)
  const setView = useStore((s) => s.setWatchlistView)
  const [editing, setEditing] = useState<string | null>(null)
  // Folder whose symbol search is open.
  const [addingId, setAddingId] = useState<string | null>(null)
  // Folder opened in the folder view; null shows the folder tiles.
  const [openId, setOpenId] = useState<string | null>(null)
  const open = view === 'list' ? undefined : folders.find((f) => f.id === openId)
  // A deleted folder cannot stay open.
  useEffect(() => {
    if (openId && !folders.some((f) => f.id === openId)) setOpenId(null)
  }, [folders, openId])
  // Folder just left, so its tile gets the focus back; keyboard focus would otherwise fall to the page.
  const lastOpen = useRef<string | null>(null)
  const closeFolder = () => {
    // Not while dragging back to the tiles: the drop target is the user's to pick.
    lastOpen.current = drag.current ? null : openId
    setOpenId(null)
  }
  const asideRef = useRef<HTMLElement>(null)
  // Whether the last click or focus was in the watchlist: Backspace elsewhere belongs to the chart (deletes a drawing).
  const inside = useRef(false)
  useEffect(() => {
    const track = (e: Event) => (inside.current = !!asideRef.current?.contains(e.target as Node))
    window.addEventListener('pointerdown', track, true)
    window.addEventListener('focusin', track, true)
    return () => {
      window.removeEventListener('pointerdown', track, true)
      window.removeEventListener('focusin', track, true)
    }
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      // Backspace while typing edits the text, it does not navigate.
      if (e.key !== 'Backspace' || !inside.current || el.closest('input, textarea, [contenteditable="true"]')) return
      // Caught before the chart's listener, which would delete a drawing still selected there.
      e.stopPropagation()
      closeFolder()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])
  const drag = useRef<{ symbol: string; from: string } | null>(null)
  const setName = useStore((s) => s.setName)
  const looked = useSymbolNames()

  const resetName = (s: string) => {
    looked.current.delete(s)
    setName(s, '')
  }

  const anyOpen = folders.some((f) => !f.collapsed)
  const [menu, setMenu] = useState<RowAt | null>(null)
  const [info, setInfo] = useState<RowAt | null>(null)
  const [alarmFor, setAlarmFor] = useState<string | null>(null)
  // Second menu of "Move to …": the other folders.
  const [moveMenu, setMoveMenu] = useState<RowAt | null>(null)
  const moveSymbol = useStore((s) => s.moveSymbol)
  useEffect(() => {
    // A row dragged back to the folder tiles unmounts and never gets its dragend, so the ref can outlive its drag.
    // Any drag that is not one of ours (a file, text from elsewhere) forgets it before it reaches a drop target.
    const forget = (e: DragEvent) => !e.dataTransfer?.types.includes(DRAG_TYPE) && (drag.current = null)
    window.addEventListener('dragenter', forget, true)
    return () => window.removeEventListener('dragenter', forget, true)
  }, [])
  useEffect(() => {
    if (!menu && !info) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setMenu(null)
      setInfo(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, info])

  return (
    <aside ref={asideRef} className="flex w-64 shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Watchlist</span>
        <span className="flex items-center gap-1">
          <span className="mr-1 flex overflow-hidden rounded border border-line">
            {(
              [
                ['list', List, t('Listenansicht')],
                ['folders', LayoutGrid, t('Ordneransicht')]
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                title={label}
                aria-label={label}
                className={`p-0.5 ${view === v ? 'bg-brand text-white' : 'text-muted hover:bg-line hover:text-white'}`}
              >
                <Icon size={14} />
              </button>
            ))}
          </span>
          {view === 'list' && folders.length > 0 && (
            // Closes all while any is open, otherwise opens all.
            <button
              onClick={() => useStore.getState().setAllCollapsed(anyOpen)}
              title={anyOpen ? t('Alle Ordner zuklappen') : t('Alle Ordner aufklappen')}
              aria-label={anyOpen ? t('Alle Ordner zuklappen') : t('Alle Ordner aufklappen')}
              className="rounded p-0.5 text-muted hover:bg-line hover:text-white"
            >
              {anyOpen ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
            </button>
          )}
          <button
            onClick={() => {
              // A new folder shows up among the tiles, so leave an open folder.
              setOpenId(null)
              setEditing(addFolder(t('Neuer Ordner')))
            }}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-line hover:text-white"
          >
            <FolderPlus size={15} /> {t('Ordner')}
          </button>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {(view === 'list' ? folders : open ? [open] : []).map((f) => (
          <FolderSection
            key={f.id}
            folder={f}
            editing={editing === f.id}
            onEdit={() => setEditing(f.id)}
            onEditDone={() => setEditing(null)}
            adding={addingId === f.id}
            onAdding={(on) => setAddingId(on ? f.id : null)}
            onBack={open && closeFolder}
            onNameReset={resetName}
            onMenu={setMenu}
            drag={drag}
          />
        ))}
        {view !== 'list' && !open && (
          <FolderGrid
            folders={folders}
            editing={editing}
            onOpen={setOpenId}
            onEdit={setEditing}
            onEditDone={() => setEditing(null)}
            onAdd={(id) => {
              setOpenId(id)
              setAddingId(id)
            }}
            focus={lastOpen}
            drag={drag}
          />
        )}
        {!folders.length && <p className="p-4 text-xs text-muted">{t('Noch keine Ordner – oben „Ordner“ klicken.')}</p>}
      </div>
      {menu && (
        <RowMenu
          at={menu}
          canMove={folders.length > 1}
          onInfo={() => setInfo(menu)}
          onAlarm={() => setAlarmFor(menu.symbol)}
          onMove={() => setMoveMenu(menu)}
          onClose={() => setMenu(null)}
        />
      )}
      {moveMenu && (
        <ContextMenu
          x={moveMenu.x}
          y={moveMenu.y}
          label={t('Verschieben nach …')}
          items={folders
            .filter((f) => f.id !== moveMenu.folderId)
            .map((f) => ({ label: f.name, run: () => moveSymbol(moveMenu.symbol, moveMenu.folderId, f.id, null) }))}
          onClose={() => setMoveMenu(null)}
        />
      )}
      {alarmFor && <AlarmsModal symbol={alarmFor} onClose={() => setAlarmFor(null)} />}
      {info && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setInfo(null)} />
          {/* Opens left of the watchlist (it sits at the window's right edge) so the list stays readable. */}
          <div
            className="fixed z-50"
            style={{ left: Math.max(8, info.left - 392), top: Math.max(8, Math.min(info.y, window.innerHeight - 480)) }}
          >
            <InfoPanel symbol={info.symbol} />
          </div>
        </>
      )}
    </aside>
  )
}

/** Right-click menu of a watchlist row. Unavailable entries stay visible with the reason underneath. */
function RowMenu(props: { at: RowAt; canMove: boolean; onInfo: () => void; onAlarm: () => void; onMove: () => void; onClose: () => void }) {
  const { at, canMove, onInfo, onAlarm, onMove, onClose } = props
  const setSymbol = useStore((s) => s.setSymbol)
  const addTab = useStore((s) => s.addTab)
  const tabsFull = useStore((s) => s.tabs.length >= MAX_TABS)
  const s = at.symbol
  const items: MenuItem[] = [
    { label: t('Öffnen'), run: () => setSymbol(s) },
    tabsFull
      ? { label: t('In neuem Tab öffnen'), reason: t('Höchstens {max} Charts gleichzeitig', { max: MAX_TABS }) }
      : {
          label: t('In neuem Tab öffnen'),
          // The new tab starts as a copy of the current chart, then shows this symbol.
          run: () => {
            addTab()
            setSymbol(s)
          }
        },
    isCrypto(s) ? { label: t('Infos zum Wert'), reason: t('Infos gibt es nur für Aktien.') } : { label: t('Infos zum Wert'), run: onInfo },
    { label: t('Kurs-Alarm …'), run: onAlarm },
    { label: t('Umbenennen'), run: at.rename },
    canMove ? { label: t('Verschieben nach …'), run: onMove } : { label: t('Verschieben nach …'), reason: t('Kein anderer Ordner') },
    { label: t('Aus Watchlist löschen'), run: () => removeSymbol(at.folderId, s), danger: true }
  ]
  return <ContextMenu x={at.x} y={at.y} label={t('Aktionen für {symbol}', { symbol: s })} items={items} onClose={onClose} />
}

/** Menu at the mouse position; unavailable entries stay visible with the reason underneath. */
function ContextMenu({ x, y, label, items, onClose }: { x: number; y: number; label: string; items: MenuItem[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        role="menu"
        aria-label={label}
        className="fixed z-50 max-h-[calc(100vh-16px)] w-52 overflow-y-auto rounded-lg border border-line bg-panel/95 py-1 text-xs shadow-2xl shadow-black/50 backdrop-blur"
        // Long menus ("Move to …" with many folders) start at the top and scroll instead of leaving the window.
        style={{ left: Math.min(x, window.innerWidth - 216), top: Math.max(8, Math.min(y, window.innerHeight - 40 * items.length - 10)) }}
      >
        {items.map((item, i) => (
          <button
            // Folder names can repeat ("Move to …" lists them), so the position is the key.
            key={i}
            role="menuitem"
            autoFocus={i === 0}
            disabled={!item.run}
            onClick={() => {
              item.run?.()
              onClose()
            }}
            className={`block w-full px-3 py-1.5 text-left outline-none disabled:cursor-default disabled:text-muted ${
              item.danger ? 'text-down hover:bg-down/10 focus:bg-down/10' : 'text-white hover:bg-line focus:bg-line'
            } disabled:hover:bg-transparent`}
          >
            {item.label}
            {item.reason && <span className="block text-[10px] text-muted/70">{item.reason}</span>}
          </button>
        ))}
      </div>
    </>
  )
}

interface SectionProps {
  folder: Folder
  editing: boolean
  onEdit: () => void
  onEditDone: () => void
  adding: boolean
  onAdding: (on: boolean) => void
  /** Set when the folder is open in the folder view: the heading becomes a bar with a back button. */
  onBack?: () => void
  onNameReset: (symbol: string) => void
  onMenu: (row: RowAt) => void
  drag: Drag
}

function FolderSection(props: SectionProps) {
  const { folder: f, editing, onEdit, onEditDone, adding, onAdding, onBack, onNameReset, onMenu, drag } = props
  const active = useStore((s) => s.symbol)
  const setSymbol = useStore((s) => s.setSymbol)
  const toggle = useStore((s) => s.toggleFolder)
  const addToFolder = useStore((s) => s.addToFolder)
  const moveSymbol = useStore((s) => s.moveSymbol)
  const quotes = useQuotes((s) => s.quotes)
  const names = useStore((s) => s.names)
  const setName = useStore((s) => s.setName)
  const [renaming, setRenaming] = useState<string | null>(null)
  // Right-click menu of the folder heading, at the mouse position.
  const [headMenu, setHeadMenu] = useState<{ x: number; y: number } | null>(null)
  // An open folder always shows its symbols; its collapsed state belongs to the list view.
  const shown = !!onBack || !f.collapsed
  const tiles = !!onBack
  const startAdding = () => {
    onAdding(true)
    if (!shown) toggle(f.id)
  }
  const [dropTarget, setDropTarget] = useState(false)
  // Where a dragged symbol would land: in front of this symbol, null = at the end, undefined = nowhere.
  const [insertBefore, setInsertBefore] = useState<string | null | undefined>(undefined)
  // Tiles: the tile whose right edge carries the marker, since the slot after a right-column tile starts the next row.
  const [markRight, setMarkRight] = useState<string | undefined>(undefined)
  // Holding a dragged symbol on the back button returns to the folder tiles, where it can be dropped on another folder.
  const spring = useRef<number | undefined>(undefined)
  const [springing, setSpringing] = useState(false)
  const stopSpring = () => {
    clearTimeout(spring.current)
    spring.current = undefined
    setSpringing(false)
  }
  useEffect(() => () => clearTimeout(spring.current), [])
  const endDrag = () => {
    setDropTarget(false)
    setInsertBefore(undefined)
    setMarkRight(undefined)
    stopSpring()
  }
  // Dropping a symbol right where it already is changes nothing, so no marker for it.
  const dragged = drag.current
  const own = dragged?.from === f.id ? f.symbols.indexOf(dragged.symbol) : -1
  const noop = own >= 0 && (insertBefore === dragged!.symbol || insertBefore === (f.symbols[own + 1] ?? null))
  const markerAt = noop ? undefined : insertBefore

  const iconBtn = 'rounded p-1 text-muted hover:bg-line hover:text-white'
  return (
    <section
      onDragOver={(e) => {
        if (!drag.current) return
        e.preventDefault()
        setDropTarget(true)
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && endDrag()}
      onDrop={(e) => {
        e.preventDefault()
        if (drag.current) moveSymbol(drag.current.symbol, drag.current.from, f.id, insertBefore ?? null)
        drag.current = null
        endDrag()
      }}
      // Another folder lights up as a whole; within the own folder only the insertion line shows.
      className={dropTarget && dragged?.from !== f.id ? 'bg-accent/10 ring-1 ring-inset ring-accent' : ''}
    >
      {headMenu && (
        <ContextMenu
          x={headMenu.x}
          y={headMenu.y}
          label={t('Aktionen für {symbol}', { symbol: f.name })}
          items={folderMenu(
            f,
            onBack
              ? { label: t('Zurück zu den Ordnern'), run: onBack }
              : { label: f.collapsed ? t('Aufklappen') : t('Zuklappen'), run: () => toggle(f.id) },
            onEdit,
            startAdding
          )}
          onClose={() => setHeadMenu(null)}
        />
      )}
      <div
        className={`group/head flex items-center gap-1 px-2 ${onBack ? 'mb-1 border-b border-line py-1.5' : 'pb-1 pt-3'}`}
        onContextMenu={(e) => {
          e.preventDefault()
          if (!editing) setHeadMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        {onBack ? (
          <button
            // Opening a folder by keyboard would otherwise leave the focus on the page.
            autoFocus
            onClick={onBack}
            onDragEnter={() => {
              // The icon inside fires its own dragenter; one timer is enough.
              if (!drag.current || spring.current) return
              setSpringing(true)
              spring.current = window.setTimeout(onBack, 600)
            }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && stopSpring()}
            title={t('Zurück zu den Ordnern')}
            aria-label={t('Zurück zu den Ordnern')}
            className={`rounded border px-1 py-0.5 ${
              springing ? 'border-accent bg-accent/20 text-white' : 'border-line text-muted hover:bg-line hover:text-white'
            }`}
          >
            <ArrowLeft size={14} />
          </button>
        ) : (
          <button
            onClick={() => toggle(f.id)}
            aria-label={f.collapsed ? t('{name} aufklappen', { name: f.name }) : t('{name} zuklappen', { name: f.name })}
            aria-expanded={!f.collapsed}
            className="text-muted hover:text-white"
          >
            {f.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
        {editing ? (
          <FolderNameInput folder={f} onDone={onEditDone} className="flex-1" />
        ) : onBack ? (
          <span className="min-w-0 flex-1 truncate text-xs text-muted">
            {t('Ordner')} › <span className="font-semibold text-white">{f.name}</span>{' '}
            <span className="text-muted/50">{f.symbols.length}</span>
          </span>
        ) : (
          // Double-click renames; its two clicks toggle twice, so the folder stays as it was.
          <span
            onClick={() => toggle(f.id)}
            onDoubleClick={onEdit}
            title={t('Doppelklick zum Umbenennen')}
            className="min-w-0 flex-1 cursor-pointer truncate text-[11px] font-semibold uppercase tracking-wider text-muted"
          >
            {f.name} <span className="font-normal text-muted/50">{f.symbols.length}</span>
          </span>
        )}
        <div className={`flex ${onBack ? '' : 'opacity-0 focus-within:opacity-100 group-hover/head:opacity-100'}`}>
          <button
            onClick={startAdding}
            className={iconBtn}
            title={t('Symbol hinzufügen')}
            aria-label={t('Symbol zu {name} hinzufügen', { name: f.name })}
          >
            <Plus size={14} />
          </button>
          <button onClick={onEdit} className={iconBtn} title={t('Umbenennen')} aria-label={t('{name} umbenennen', { name: f.name })}>
            <Pencil size={13} />
          </button>
          <button
            onClick={() => deleteFolder(f)}
            className={`${iconBtn} hover:text-down`}
            title={t('Ordner löschen')}
            aria-label={t('{name} löschen', { name: f.name })}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {adding && (
        <div className="px-3 pb-1">
          <SymbolSearch
            compact
            autoFocus
            onPick={(s) => addToFolder(f.id, s)}
            onClose={() => onAdding(false)}
            placeholder={t('Name oder Symbol')}
            inputClassName="w-full rounded bg-bg px-2 py-1 text-xs uppercase outline-none ring-1 ring-accent placeholder:normal-case placeholder:text-muted/60"
          />
        </div>
      )}

      {shown && !f.symbols.length && !adding && (
        <p className="px-8 py-1 text-xs text-muted/60">{t('Leer – „+“ oder Symbol hierher ziehen')}</p>
      )}

      {shown && (
        // An open folder in the folder view shows its symbols as tiles, two per row.
        <div className={tiles ? 'grid grid-cols-2 gap-1.5 px-2 pb-2' : ''}>
          {f.symbols.map((s, i) => {
            const q = quotes[s]
            const last = i === f.symbols.length - 1
            const name =
              renaming === s ? (
                <input
                  autoFocus
                  defaultValue={names[s] ?? s}
                  maxLength={40}
                  aria-label={t('Anzeigename für {symbol}', { symbol: s })}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    // Empty (or the bare ticker) means "back to the automatic name".
                    if (!v || v === s) onNameReset(s)
                    else setName(s, v)
                    setRenaming(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') e.currentTarget.value = names[s] ?? s
                    if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
                  }}
                  className="min-w-0 rounded bg-bg px-1 text-xs text-white outline-none ring-1 ring-accent"
                />
              ) : (
                <span
                  className="min-w-0"
                  title={t('{symbol} – Doppelklick zum Umbenennen', { symbol: s })}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setRenaming(s)
                  }}
                >
                  <span className="flex items-center gap-1.5">
                    <MarketDot symbol={s} timeZone={q?.timezone} />
                    <span className="truncate font-medium text-white">{names[s] ?? s}</span>
                  </span>
                  {names[s] && <span className="block truncate text-[10px] text-muted">{s}</span>}
                </span>
              )
            const price = (
              <span className={`tabular-nums ${tiles ? 'min-w-0 truncate text-xs' : 'text-right'}`}>
                {q ? formatPrice(q.price) : '—'}
                {q?.ext && (
                  <span
                    className={`flex items-center gap-1 text-[10px] text-muted ${tiles ? '' : 'justify-end'}`}
                    title={extTitle(q.ext)}
                  >
                    <ExtIcon phase={q.ext.phase} />
                    {formatPrice(q.ext.price)}
                  </span>
                )}
              </span>
            )
            const change = (
              <span
                className={`text-right tabular-nums ${tiles ? 'shrink-0 text-xs' : 'w-16 group-hover/row:hidden'} ${
                  !q ? 'text-muted' : q.changePct >= 0 ? 'text-up' : 'text-down'
                }`}
              >
                {q ? formatChange(q.changePct) : '—'}
                {q?.ext && (
                  <span className={`block text-[10px] ${q.ext.changePct >= 0 ? 'text-up/80' : 'text-down/80'}`}>
                    {formatChange(q.ext.changePct)}
                  </span>
                )}
              </span>
            )
            const buttons = (
              <div
                className={`hidden gap-1.5 group-hover/row:flex ${
                  tiles ? 'absolute right-1 top-1 rounded bg-panel/90 px-1 py-0.5' : 'w-16 justify-end'
                }`}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setRenaming(s)
                  }}
                  className="text-muted hover:text-white"
                  aria-label={t('{symbol} umbenennen', { symbol: s })}
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeSymbol(f.id, s)
                  }}
                  className="text-muted hover:text-down"
                  aria-label={t('{symbol} aus {name} entfernen', { symbol: s, name: f.name })}
                >
                  <X size={14} />
                </button>
              </div>
            )
            return (
              <div
                key={s}
                draggable={renaming !== s}
                title={t('Ziehen zum Sortieren oder in einen anderen Ordner · Rechtsklick für weitere Aktionen')}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onMenu({
                    symbol: s,
                    folderId: f.id,
                    x: e.clientX,
                    y: e.clientY,
                    left: e.currentTarget.getBoundingClientRect().left,
                    rename: () => setRenaming(s)
                  })
                }}
                onDragStart={(e) => {
                  drag.current = { symbol: s, from: f.id }
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', s)
                  e.dataTransfer.setData(DRAG_TYPE, s)
                }}
                onDragEnd={() => {
                  drag.current = null
                  endDrag()
                }}
                onDragOver={(e) => {
                  if (!drag.current) return
                  // Rows: upper half in front of this row, lower half in front of the next. Tiles: left and right half.
                  const r = e.currentTarget.getBoundingClientRect()
                  const after = tiles ? e.clientX >= r.left + r.width / 2 : e.clientY >= r.top + r.height / 2
                  const target = insertTarget(f.symbols, i, after)
                  if (target !== insertBefore) setInsertBefore(target)
                  const right = tiles && after ? s : undefined
                  if (right !== markRight) setMarkRight(right)
                }}
                onClick={() => setSymbol(s)}
                className={`group/row relative cursor-pointer ${
                  tiles
                    ? `flex min-w-0 flex-col gap-1 rounded-md p-2 ${s === active ? 'bg-accent/10 ring-1 ring-brand-to' : 'bg-bg/60 hover:bg-bg'}`
                    : `grid grid-cols-[1fr_auto_auto] items-center gap-2 py-1.5 pl-7 pr-3 ${
                        s === active ? 'bg-accent/10 shadow-[inset_2px_0_0_var(--color-brand-to)]' : 'hover:bg-bg'
                      }`
                }`}
              >
                {(tiles
                  ? markerAt !== undefined && (markRight ? markRight === s : markerAt === s)
                  : markerAt === s || (last && markerAt === null)) && (
                  <span
                    className={`pointer-events-none absolute rounded-full bg-brand shadow-glow ${
                      tiles
                        ? `inset-y-1 w-0.5 ${markRight === s ? '-right-1' : '-left-1'}`
                        : `inset-x-2 h-0.5 ${markerAt === s ? '-top-px' : '-bottom-px'}`
                    }`}
                  />
                )}
                {name}
                {tiles ? (
                  <span className="flex items-start justify-between gap-1">
                    {price}
                    {change}
                  </span>
                ) : (
                  <>
                    {price}
                    {change}
                  </>
                )}
                {buttons}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

interface GridProps {
  folders: Folder[]
  editing: string | null
  onOpen: (id: string) => void
  onEdit: (id: string) => void
  onEditDone: () => void
  onAdd: (id: string) => void
  /** Folder to focus once on mount (the one just left); cleared after use. */
  focus: RefObject<string | null>
  drag: Drag
}

/** Folder view: one tile per folder; a click opens it, a dragged symbol dropped on a tile moves to its end. */
function FolderGrid({ folders, editing, onOpen, onEdit, onEditDone, onAdd, focus, drag }: GridProps) {
  const moveSymbol = useStore((s) => s.moveSymbol)
  const [over, setOver] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ folder: Folder; x: number; y: number } | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const id = focus.current
    focus.current = null
    if (id) grid.current?.querySelector<HTMLElement>(`[data-folder="${CSS.escape(id)}"]`)?.focus()
  }, [focus])
  return (
    <div ref={grid} className="grid grid-cols-3 gap-1 p-2">
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={t('Aktionen für {symbol}', { symbol: menu.folder.name })}
          items={folderMenu(
            menu.folder,
            { label: t('Öffnen'), run: () => onOpen(menu.folder.id) },
            () => onEdit(menu.folder.id),
            () => onAdd(menu.folder.id)
          )}
          onClose={() => setMenu(null)}
        />
      )}
      {folders.map((f) => (
        <div
          key={f.id}
          data-folder={f.id}
          role="button"
          tabIndex={0}
          aria-label={t('{name} öffnen', { name: f.name })}
          onClick={() => editing !== f.id && onOpen(f.id)}
          onKeyDown={(e) => {
            if ((e.key !== 'Enter' && e.key !== ' ') || e.target !== e.currentTarget) return
            // Space would scroll the list.
            e.preventDefault()
            onOpen(f.id)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            if (editing !== f.id) setMenu({ folder: f, x: e.clientX, y: e.clientY })
          }}
          onDragOver={(e) => {
            // A symbol dropped on its own folder would only jump to the end, so that is no target.
            if (!drag.current || drag.current.from === f.id) return
            e.preventDefault()
            setOver(f.id)
          }}
          onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
          onDrop={(e) => {
            e.preventDefault()
            if (drag.current) moveSymbol(drag.current.symbol, drag.current.from, f.id, null)
            drag.current = null
            setOver(null)
          }}
          className={`group/tile relative flex cursor-pointer flex-col items-center gap-1 rounded-md px-1 pb-1.5 pt-2.5 outline-none hover:bg-bg focus-visible:ring-1 focus-visible:ring-accent ${
            over === f.id ? 'bg-accent/10 ring-1 ring-accent' : ''
          }`}
        >
          <span className="relative block h-9 w-12">
            <span className="absolute left-0 top-0 h-2 w-5 rounded-t-sm bg-brand-from/80" />
            <span className="absolute inset-x-0 bottom-0 top-1 rounded-md rounded-tl-none bg-brand shadow-glow" />
            <span className="absolute bottom-1 right-1 rounded bg-bg/60 px-1 text-[10px] tabular-nums text-white">{f.symbols.length}</span>
          </span>
          {editing === f.id ? (
            <FolderNameInput folder={f} onDone={onEditDone} className="w-full text-center" />
          ) : (
            <span className="w-full truncate text-center text-[11px] text-white" title={f.name}>
              {f.name}
            </span>
          )}
          {editing !== f.id && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEdit(f.id)
              }}
              title={t('Umbenennen')}
              aria-label={t('{name} umbenennen', { name: f.name })}
              className="absolute right-0.5 top-0.5 hidden rounded p-0.5 text-muted hover:bg-line hover:text-white group-hover/tile:block group-focus-within/tile:block"
            >
              <Pencil size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
