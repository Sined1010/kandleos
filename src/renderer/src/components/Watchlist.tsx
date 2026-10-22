import { ChevronDown, ChevronRight, FolderPlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { t } from '../../../shared/i18n'
import { formatChange, formatPrice } from '../lib/format'
import { useQuotes, useStore, type Folder } from '../store/useStore'
import { ExtIcon, extTitle, MarketDot } from './MarketBadge'
import SymbolSearch from './SymbolSearch'

type Drag = RefObject<{ symbol: string; from: string } | null>

export default function Watchlist() {
  const folders = useStore((s) => s.folders)
  const addFolder = useStore((s) => s.addFolder)
  const [editing, setEditing] = useState<string | null>(null)
  const drag = useRef<{ symbol: string; from: string } | null>(null)
  const names = useStore((s) => s.names)
  const setName = useStore((s) => s.setName)
  // Symbols already looked up this session, so a symbol Yahoo does not know is not asked for again.
  const looked = useRef(new Set<string>())

  // Fill in readable names for symbols that have none yet (new symbols, or after a reset).
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

  const resetName = (s: string) => {
    looked.current.delete(s)
    setName(s, '')
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Watchlist</span>
        <button
          onClick={() => setEditing(addFolder(t('Neuer Ordner')))}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-line hover:text-white"
        >
          <FolderPlus size={15} /> {t('Ordner')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {folders.map((f) => (
          <FolderSection
            key={f.id}
            folder={f}
            editing={editing === f.id}
            onEdit={() => setEditing(f.id)}
            onEditDone={() => setEditing(null)}
            onNameReset={resetName}
            drag={drag}
          />
        ))}
        {!folders.length && <p className="p-4 text-xs text-muted">{t('Noch keine Ordner – oben „Ordner“ klicken.')}</p>}
      </div>
    </aside>
  )
}

interface SectionProps {
  folder: Folder
  editing: boolean
  onEdit: () => void
  onEditDone: () => void
  onNameReset: (symbol: string) => void
  drag: Drag
}

function FolderSection({ folder: f, editing, onEdit, onEditDone, onNameReset, drag }: SectionProps) {
  const active = useStore((s) => s.symbol)
  const setSymbol = useStore((s) => s.setSymbol)
  const toggle = useStore((s) => s.toggleFolder)
  const rename = useStore((s) => s.renameFolder)
  const removeFolder = useStore((s) => s.removeFolder)
  const addToFolder = useStore((s) => s.addToFolder)
  const removeFromFolder = useStore((s) => s.removeFromFolder)
  const moveSymbol = useStore((s) => s.moveSymbol)
  const quotes = useQuotes((s) => s.quotes)
  const names = useStore((s) => s.names)
  const setName = useStore((s) => s.setName)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState(false)
  // Where a dragged symbol would land: in front of this symbol, null = at the end, undefined = nowhere.
  const [insertBefore, setInsertBefore] = useState<string | null | undefined>(undefined)
  const endDrag = () => {
    setDropTarget(false)
    setInsertBefore(undefined)
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
      <div className="group/head flex items-center gap-1 px-2 pb-1 pt-3">
        <button
          onClick={() => toggle(f.id)}
          aria-label={f.collapsed ? t('{name} aufklappen', { name: f.name }) : t('{name} zuklappen', { name: f.name })}
          aria-expanded={!f.collapsed}
          className="text-muted hover:text-white"
        >
          {f.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        {editing ? (
          <input
            autoFocus
            defaultValue={f.name}
            maxLength={40}
            aria-label={t('Ordnername')}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              rename(f.id, e.target.value.trim() || f.name)
              onEditDone()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') e.currentTarget.value = f.name
              if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
            }}
            className="min-w-0 flex-1 rounded bg-bg px-1 text-xs text-white outline-none ring-1 ring-accent"
          />
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
        <div className="flex opacity-0 focus-within:opacity-100 group-hover/head:opacity-100">
          <button
            onClick={() => {
              setAdding(true)
              if (f.collapsed) toggle(f.id)
            }}
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
            onClick={() =>
              (!f.symbols.length || confirm(t('Ordner „{name}“ mit {count} Symbolen löschen?', { name: f.name, count: f.symbols.length }))) &&
              removeFolder(f.id)
            }
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
            onClose={() => setAdding(false)}
            placeholder={t('Name oder Symbol')}
            inputClassName="w-full rounded bg-bg px-2 py-1 text-xs uppercase outline-none ring-1 ring-accent placeholder:normal-case placeholder:text-muted/60"
          />
        </div>
      )}

      {!f.collapsed && !f.symbols.length && !adding && (
        <p className="px-8 py-1 text-xs text-muted/60">{t('Leer – „+“ oder Symbol hierher ziehen')}</p>
      )}

      {!f.collapsed &&
        f.symbols.map((s, i) => {
          const q = quotes[s]
          const last = i === f.symbols.length - 1
          return (
            <div
              key={s}
              draggable={renaming !== s}
              title={t('Ziehen zum Sortieren oder in einen anderen Ordner')}
              onDragStart={(e) => {
                drag.current = { symbol: s, from: f.id }
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', s)
              }}
              onDragEnd={() => {
                drag.current = null
                endDrag()
              }}
              onDragOver={(e) => {
                if (!drag.current) return
                // Upper half: in front of this row, lower half: in front of the next one.
                const r = e.currentTarget.getBoundingClientRect()
                const target = e.clientY < r.top + r.height / 2 ? s : (f.symbols[i + 1] ?? null)
                if (target !== insertBefore) setInsertBefore(target)
              }}
              onClick={() => setSymbol(s)}
              className={`group/row relative grid cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-2 py-1.5 pl-7 pr-3 ${
                s === active ? 'bg-accent/10 shadow-[inset_2px_0_0_var(--color-brand-to)]' : 'hover:bg-bg'
              }`}
            >
              {(markerAt === s || (last && markerAt === null)) && (
                <span
                  className={`pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-brand shadow-glow ${
                    markerAt === s ? '-top-px' : '-bottom-px'
                  }`}
                />
              )}
              {renaming === s ? (
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
              )}
              <span className="text-right tabular-nums">
                {q ? formatPrice(q.price) : '—'}
                {q?.ext && (
                  <span className="flex items-center justify-end gap-1 text-[10px] text-muted" title={extTitle(q.ext)}>
                    <ExtIcon phase={q.ext.phase} />
                    {formatPrice(q.ext.price)}
                  </span>
                )}
              </span>
              <span
                className={`w-16 text-right tabular-nums group-hover/row:hidden ${
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
              <div className="hidden w-16 justify-end gap-1.5 group-hover/row:flex">
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
                    removeFromFolder(f.id, s)
                  }}
                  className="text-muted hover:text-down"
                  aria-label={t('{symbol} aus {name} entfernen', { symbol: s, name: f.name })}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )
        })}
    </section>
  )
}
