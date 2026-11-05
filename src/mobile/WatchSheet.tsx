import { ChevronDown, ChevronRight, GripVertical, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { t } from '../shared/i18n'
import { isCrypto } from '../shared/types'
import { InfoPanel } from '../renderer/src/components/CompanyInfo'
import { MarketDot } from '../renderer/src/components/MarketBadge'
import SymbolSearch from '../renderer/src/components/SymbolSearch'
import { useSymbolNames } from '../renderer/src/components/Watchlist'
import { formatChange, formatPrice } from '../renderer/src/lib/format'
import { MAX_TABS, useQuotes, useStore } from '../renderer/src/store/useStore'
import ActionMenu, { type ActionItem } from './ActionMenu'
import Layer from './Layer'
import Sheet from './Sheet'
import type { SheetPos } from './sheetSnap'
import { useLongPress } from './useLongPress'

type Menu = { title: string; items: ActionItem[] }
/** Where a dragged row would land: before `before` in folder `folder` (null = at the end). */
type Drop = { folder: string; before: string | null }

/** The watchlist as a sheet below the chart, with the search on top (layout C). */
export default function WatchSheet({ pos, onPos, extraItems }: { pos: SheetPos; onPos(p: SheetPos): void; extraItems?: (symbol: string) => ActionItem[] }) {
  const folders = useStore((s) => s.folders)
  // Actions and values read when a menu opens; the lists below subscribe on their own.
  const s = useStore.getState()
  const [menu, setMenu] = useState<Menu | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ symbol: string; from: string; drop: Drop | null } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useSymbolNames()

  const open = (symbol: string) => {
    s.setSymbol(symbol)
    onPos('low')
  }
  const ask = (label: string, current = '') => window.prompt(label, current)?.trim() ?? null

  const rowMenu = (symbol: string, folderId: string): Menu => {
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
        { label: t('Infos zum Wert'), disabled: isCrypto(symbol), onPick: () => setInfo(symbol) },
        ...(extraItems?.(symbol) ?? []),
        {
          label: t('Umbenennen'),
          onPick: () => {
            const n = ask(t('Anzeigename'), s.names[symbol] ?? symbol)
            if (n !== null) s.setName(symbol, n === symbol ? '' : n)
          }
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
        { label: t('Aus Watchlist löschen'), danger: true, onPick: () => s.removeFromFolder(folderId, symbol) }
      ]
    }
  }

  const folderMenu = (id: string, name: string): Menu => ({
    title: name,
    items: [
      {
        label: t('Umbenennen'),
        onPick: () => {
          const n = ask(t('Ordnername'), name)
          if (n) s.renameFolder(id, n)
        }
      },
      {
        label: t('Ordner löschen'),
        danger: true,
        onPick: () => confirm(t('Ordner „{name}“ mit allen Werten löschen?', { name })) && s.removeFolder(id)
      }
    ]
  })

  const picked = (symbol: string) =>
    setMenu({
      title: symbol,
      items: [
        { label: t('Nur ansehen'), onPick: () => open(symbol) },
        ...folders.map((f) => ({
          label: t('Zu „{name}“ hinzufügen', { name: f.name }),
          disabled: f.symbols.includes(symbol),
          onPick: () => {
            s.addToFolder(f.id, symbol)
            open(symbol)
          }
        }))
      ]
    })

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
          <div className="px-3 pb-2" onFocus={() => pos === 'low' && onPos('full')}>
            <SymbolSearch
              compact
              placeholder={t('Wert suchen …')}
              onPick={picked}
              inputClassName="w-full rounded-xl bg-bg px-3 py-2.5 text-base text-white outline-none ring-1 ring-line placeholder:text-muted focus:ring-accent"
            />
          </div>
        }
      >
        <div ref={listRef} className="pb-4">
          {folders.map((f) => (
            <section key={f.id}>
              <FolderHead
                name={f.name}
                collapsed={f.collapsed}
                onToggle={() => s.toggleFolder(f.id)}
                onMenu={() => setMenu(folderMenu(f.id, f.name))}
              />
              {!f.collapsed &&
                f.symbols.map((sym) => (
                  <Row
                    key={sym}
                    symbol={sym}
                    folder={f.id}
                    marked={drag?.drop?.folder === f.id && drag.drop.before === sym}
                    onOpen={() => open(sym)}
                    onMenu={() => setMenu(rowMenu(sym, f.id))}
                    onGrip={(e) => {
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
              {!f.collapsed && (
                <div data-folder-end={f.id} className={`h-3 ${drag?.drop?.folder === f.id && drag.drop.before === null ? 'border-t-2 border-accent' : ''}`} />
              )}
            </section>
          ))}
          <button
            onClick={() => {
              const n = ask(t('Ordnername'))
              if (n) s.addFolder(n)
            }}
            className="mx-3 mt-2 flex min-h-12 items-center gap-2 text-muted active:text-white"
          >
            <Plus size={16} /> {t('Neuer Ordner')}
          </button>
        </div>
      </Sheet>
      {menu && <ActionMenu title={menu.title} items={menu.items} onClose={() => setMenu(null)} />}
      {info && (
        <Layer id="info" title={s.names[info] ?? info} onClose={() => setInfo(null)}>
          <InfoPanel symbol={info} />
        </Layer>
      )}
    </>
  )
}

function FolderHead(p: { name: string; collapsed: boolean; onToggle(): void; onMenu(): void }) {
  const press = useLongPress(p.onMenu, p.onToggle)
  return (
    <div {...press} className="flex min-h-11 items-center gap-1 bg-bg/60 px-3 text-xs uppercase tracking-wider text-muted active:bg-line/40">
      {p.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      <span className="truncate">{p.name}</span>
    </div>
  )
}

function Row(p: {
  symbol: string
  folder: string
  marked: boolean
  onOpen(): void
  onMenu(): void
  onGrip(e: React.PointerEvent<HTMLButtonElement>): void
  onGripMove(e: React.PointerEvent): void
  onGripUp(): void
}) {
  const q = useQuotes((s) => s.quotes[p.symbol])
  const name = useStore((s) => s.names[p.symbol])
  const press = useLongPress(p.onMenu, p.onOpen)
  return (
    <div
      data-row={p.symbol}
      data-folder={p.folder}
      className={`flex min-h-14 items-center gap-2 border-b border-line/50 pl-3 active:bg-line/40 ${p.marked ? 'border-t-2 border-t-accent' : ''}`}
    >
      <div {...press} className="flex min-w-0 flex-1 items-center gap-2 py-2">
        <MarketDot symbol={p.symbol} timeZone={q?.timezone} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-white">{name ?? p.symbol}</p>
          {name && <p className="truncate text-[11px] text-muted">{p.symbol}</p>}
        </div>
        <div className="text-right tabular-nums">
          <p className="text-white">{q ? formatPrice(q.price) : '—'}</p>
          <p className={`text-xs ${!q ? 'text-muted' : q.changePct >= 0 ? 'text-up' : 'text-down'}`}>{q ? formatChange(q.changePct) : '—'}</p>
        </div>
      </div>
      <button
        aria-label={t('Verschieben')}
        className="flex h-14 w-11 shrink-0 touch-none items-center justify-center text-muted"
        onPointerDown={p.onGrip}
        onPointerMove={p.onGripMove}
        onPointerUp={p.onGripUp}
        onPointerCancel={p.onGripUp}
      >
        <GripVertical size={18} />
      </button>
    </div>
  )
}
