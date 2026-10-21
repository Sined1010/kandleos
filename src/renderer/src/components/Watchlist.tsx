import { ChevronDown, ChevronRight, FolderPlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useQuotes, useStore, type Folder } from '../store/useStore'
import { MarketDot } from './MarketBadge'
import SymbolSearch from './SymbolSearch'

export const formatPrice = (p: number): string =>
  p.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: p < 1 ? 6 : p < 10 ? 4 : 2 })

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
          onClick={() => setEditing(addFolder('Neuer Ordner'))}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-line hover:text-white"
        >
          <FolderPlus size={15} /> Ordner
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
        {!folders.length && <p className="p-4 text-xs text-muted">Noch keine Ordner – oben „Ordner“ klicken.</p>}
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

  const iconBtn = 'rounded p-1 text-muted hover:bg-line hover:text-white'
  return (
    <section
      onDragOver={(e) => {
        if (!drag.current) return
        e.preventDefault()
        setDropTarget(true)
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropTarget(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDropTarget(false)
        if (drag.current) moveSymbol(drag.current.symbol, drag.current.from, f.id)
        drag.current = null
      }}
      className={dropTarget ? 'bg-accent/10 ring-1 ring-inset ring-accent' : ''}
    >
      <div className="group/head flex items-center gap-1 px-2 pb-1 pt-3">
        <button
          onClick={() => toggle(f.id)}
          aria-label={f.collapsed ? `${f.name} aufklappen` : `${f.name} zuklappen`}
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
            aria-label="Ordnername"
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
            title="Doppelklick zum Umbenennen"
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
            title="Symbol hinzufügen"
            aria-label={`Symbol zu ${f.name} hinzufügen`}
          >
            <Plus size={14} />
          </button>
          <button onClick={onEdit} className={iconBtn} title="Umbenennen" aria-label={`${f.name} umbenennen`}>
            <Pencil size={13} />
          </button>
          <button
            onClick={() =>
              (!f.symbols.length || confirm(`Ordner „${f.name}“ mit ${f.symbols.length} Symbolen löschen?`)) &&
              removeFolder(f.id)
            }
            className={`${iconBtn} hover:text-down`}
            title="Ordner löschen"
            aria-label={`${f.name} löschen`}
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
            placeholder="Name oder Symbol"
            inputClassName="w-full rounded bg-bg px-2 py-1 text-xs uppercase outline-none ring-1 ring-accent placeholder:normal-case placeholder:text-muted/60"
          />
        </div>
      )}

      {!f.collapsed && !f.symbols.length && !adding && (
        <p className="px-8 py-1 text-xs text-muted/60">Leer – „+“ oder Symbol hierher ziehen</p>
      )}

      {!f.collapsed &&
        f.symbols.map((s) => {
          const q = quotes[s]
          return (
            <div
              key={s}
              draggable={renaming !== s}
              onDragStart={(e) => {
                drag.current = { symbol: s, from: f.id }
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', s)
              }}
              onDragEnd={() => (drag.current = null)}
              onClick={() => setSymbol(s)}
              className={`group/row grid cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-2 py-1.5 pl-7 pr-3 ${
                s === active ? 'bg-accent/15' : 'hover:bg-bg'
              }`}
            >
              {renaming === s ? (
                <input
                  autoFocus
                  defaultValue={names[s] ?? s}
                  maxLength={40}
                  aria-label={`Anzeigename für ${s}`}
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
                  title={`${s} – Doppelklick zum Umbenennen`}
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
              <span className="text-right tabular-nums">{q ? formatPrice(q.price) : '—'}</span>
              <span
                className={`w-16 text-right tabular-nums group-hover/row:hidden ${
                  !q ? 'text-muted' : q.changePct >= 0 ? 'text-up' : 'text-down'
                }`}
              >
                {q ? `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%` : '—'}
              </span>
              <div className="hidden w-16 justify-end gap-1.5 group-hover/row:flex">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setRenaming(s)
                  }}
                  className="text-muted hover:text-white"
                  aria-label={`${s} umbenennen`}
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFromFolder(f.id, s)
                  }}
                  className="text-muted hover:text-down"
                  aria-label={`${s} aus ${f.name} entfernen`}
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
