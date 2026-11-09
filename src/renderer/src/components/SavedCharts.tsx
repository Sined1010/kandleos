import { Bookmark, ChevronDown, ChevronRight, Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { locale, t } from '../../../shared/i18n'
import { tfLabel } from '../../../shared/types'
import { findByName, groupCharts, isDirty, linkedChart, loadTarget, toolCounts } from '../lib/charts'
import { drawingsKey, MAX_TABS, useStore, type Drawing, type SavedChart } from '../store/useStore'
import { TOOLS } from './DrawingToolbar'
import { IS_MOBILE } from '../lib/platform'
import { ask, tell } from '../../../mobile/MessageBox'

/** "1× Elliott impulse 0-1-2-3-4-5, 3× Trend line": the toolbar's labels without their click hints, in toolbar order. */
export function toolSummary(drawings: Drawing[]): string {
  const counts = toolCounts(drawings)
  return TOOLS.flatMap(([id, , label]) => {
    const n = counts[id as Drawing['type']]
    return n ? [`${n}× ${t(label).split(/ \(| – /)[0]}`] : []
  }).join(', ')
}

/** Top-bar button for saved charts: save the shown chart under a name, load one back with its drawings. */
export default function SavedCharts() {
  const charts = useStore((s) => s.charts)
  const tab = useStore((s) => s.tabs.find((x) => x.id === s.activeTab))
  const timeframe = useStore((s) => s.timeframe)
  const drawings = useStore((s) => s.drawings[drawingsKey(s)])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const linked = tab && linkedChart(tab, charts)
  const dirty = !!linked && isDirty(linked, timeframe, drawings ?? [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t('Chart-Stände')}
        title={t('Chart-Stände')}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-muted hover:bg-line hover:text-white"
      >
        <Bookmark size={15} />
        <span className="max-w-40 truncate">{linked ? linked.name : t('Charts')}</span>
        {dirty && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title={t('Ungespeicherte Änderungen')} aria-label={t('Ungespeicherte Änderungen')} />
        )}
      </button>
      {open && (
        <>
          {/* Above the chart's forecast button (z-30), which the menu reaches across. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div data-menu className="absolute left-0 top-full z-50 mt-1 w-80 rounded-lg border border-line bg-panel/95 p-2 text-sm shadow-2xl shadow-black/50 backdrop-blur">
            <SavedChartsPanel onDone={() => setOpen(false)} onSaveAs={() => setSaving(true)} />
          </div>
        </>
      )}
      {saving && <SaveDialog onClose={() => setSaving(false)} />}
    </div>
  )
}

/** Save, save as and the list of saved charts (desktop popover, phone full screen). */
export function SavedChartsPanel({ onDone, onSaveAs }: { onDone: () => void; onSaveAs: () => void }) {
  const charts = useStore((s) => s.charts)
  const tab = useStore((s) => s.tabs.find((x) => x.id === s.activeTab))
  const saveChart = useStore((s) => s.saveChart)
  const linked = tab && linkedChart(tab, charts)
  // Finger-sized rows on the phone, compact in the desktop popover.
  const item = `flex w-full items-center justify-between gap-2 rounded px-2 text-left hover:bg-bg ${IS_MOBILE ? 'min-h-12 text-base active:bg-line' : 'py-1.5'}`
  return (
    <>
            {linked && (
              <button
                className={item}
                onClick={() => {
                  saveChart(linked.name, linked.id)
                  onDone()
                }}
              >
                <span className="text-white">{t('Speichern')}</span>
                <span className={`truncate text-muted ${IS_MOBILE ? 'text-xs' : 'text-[11px]'}`}>{t('überschreibt „{name}“', { name: linked.name })}</span>
              </button>
            )}
            <button
              className={item}
              onClick={() => {
                onDone()
                onSaveAs()
              }}
            >
              <span className="text-white">{t('Speichern unter …')}</span>
            </button>
            <div className="my-1.5 border-t border-line" />
            <ChartList onDone={onDone} />
    </>
  )
}

const shortDate = (ms: number) => new Date(ms).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' })

/** Saved charts grouped by symbol (the shown one first and open), with search; a click loads one. */
function ChartList({ onDone }: { onDone: () => void }) {
  const charts = useStore((s) => s.charts)
  const symbol = useStore((s) => s.symbol)
  const names = useStore((s) => s.names)
  const tab = useStore((s) => s.tabs.find((x) => x.id === s.activeTab))
  const timeframe = useStore((s) => s.timeframe)
  const drawings = useStore((s) => s.drawings[drawingsKey(s)])
  const { loadChart, renameChart, deleteChart, selectTab } = useStore.getState()
  const [query, setQuery] = useState('')
  // Groups the user opened or closed, against the default (only the shown symbol open).
  const [toggled, setToggled] = useState(new Set<string>())
  const [renaming, setRenaming] = useState<string | null>(null)
  // Details of the row under the mouse, left of the menu (the list scrolls, so they cannot sit inside it).
  // By id, so a row deleted or renamed under the mouse never leaves stale details behind.
  const [hoverAt, setHover] = useState<{ id: string; top: number } | null>(null)
  const hover = hoverAt && charts.find((c) => c.id === hoverAt.id)
  const label = (s: string) => names[s] ?? s
  const groups = groupCharts(charts, symbol, query, label)
  const linked = tab && linkedChart(tab, charts)

  const load = async (c: SavedChart) => {
    const target = loadTarget(c, useStore.getState(), MAX_TABS)
    if (target.kind === 'switch') selectTab(target.tabId)
    else if (target.kind === 'revert') {
      if (!(await ask(t('Zeichnungen seit dem Speichern gehen verloren. „{name}“ wieder laden?', { name: c.name }), t('Neu laden'), { danger: true }))) return
      loadChart(c.id, 'here')
    } else if (target.kind !== 'confirm') loadChart(c.id, target.kind)
    else if (
      await ask(
        t('Alle {max} Tabs sind belegt. Die Zeichnungen im aktuellen Tab werden durch „{name}“ ersetzt. Fortfahren?', {
          max: MAX_TABS,
          name: c.name
        }),
        t('Ersetzen'),
        { danger: true }
      )
    )
      loadChart(c.id, 'here')
    else return
    onDone()
  }
  const showDetails = (c: SavedChart, el: HTMLElement) => {
    const menu = el.closest('[data-menu]')?.getBoundingClientRect()
    if (menu) setHover({ id: c.id, top: el.getBoundingClientRect().top - menu.top })
  }

  if (!charts.length) return <p className={`px-2 py-2 text-muted ${IS_MOBILE ? 'text-sm' : 'text-xs'}`}>{t('Noch keine Chart-Stände – „Speichern unter …“ legt den ersten an.')}</p>
  return (
    <>
      <input
        // On the phone the keyboard would cover half the list as soon as the page opens.
        autoFocus={!IS_MOBILE}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('Suchen (Name oder Wert) …')}
        aria-label={t('Suchen (Name oder Wert) …')}
        className={`mb-1 w-full bg-bg text-white outline-none ring-1 ring-line placeholder:text-muted/60 focus:ring-accent ${IS_MOBILE ? 'rounded-xl px-3 py-2.5 text-base' : 'rounded px-2 py-1 text-xs'}`}
      />
      <div className={IS_MOBILE ? '' : 'max-h-[60vh] overflow-y-auto'} onScroll={() => setHover(null)}>
        {!groups.length && <p className={`px-2 py-2 text-muted ${IS_MOBILE ? 'text-sm' : 'text-xs'}`}>{t('Keine Treffer')}</p>}
        {groups.map((g) => {
          const open = !!query || g.current !== toggled.has(g.symbol)
          return (
            <div key={g.symbol}>
              <button
                onClick={() =>
                  setToggled((s) => {
                    const n = new Set(s)
                    if (!n.delete(g.symbol)) n.add(g.symbol)
                    return n
                  })
                }
                aria-expanded={open}
                className={`flex w-full items-center gap-1 px-1 text-left font-semibold uppercase tracking-wider text-muted hover:text-white ${IS_MOBILE ? 'min-h-11 pt-1 text-xs' : 'pb-0.5 pt-2 text-[10px]'}`}
              >
                {open ? <ChevronDown size={IS_MOBILE ? 16 : 12} /> : <ChevronRight size={IS_MOBILE ? 16 : 12} />}
                <span className="flex-1 truncate">{g.current ? t('{name} · aktueller Wert', { name: g.label }) : g.label}</span>
                <span className="font-normal text-muted/60">{g.charts.length}</span>
              </button>
              {open &&
                g.charts.map((c) => (
                  <div
                    key={c.id}
                    onMouseEnter={(e) => showDetails(c, e.currentTarget)}
                    onMouseLeave={() => setHover(null)}
                    className={`group/row flex items-center gap-1 rounded pl-4 pr-1 hover:bg-bg ${c.id === linked?.id ? 'bg-accent/10' : ''}`}
                  >
                    {renaming === c.id ? (
                      <input
                        autoFocus
                        defaultValue={c.name}
                        maxLength={60}
                        aria-label={t('{name} umbenennen', { name: c.name })}
                        onFocus={(e) => e.target.select()}
                        onBlur={(e) => {
                          // One name per symbol, as "Save as …" keeps it; a clash keeps the old name.
                          const other = findByName(charts, c.symbol, e.target.value)
                          if (other && other.id !== c.id)
                            tell(t('Für {symbol} gibt es schon einen Chart-Stand „{name}“.', { symbol: label(c.symbol), name: other.name }))
                          else renameChart(c.id, e.target.value)
                          setRenaming(null)
                        }}
                        onKeyDown={(e) => {
                          // Escape cancels the rename, it does not close the menu.
                          e.stopPropagation()
                          if (e.key === 'Escape') e.currentTarget.value = c.name
                          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
                        }}
                        className={`my-1 min-w-0 flex-1 rounded bg-bg text-white outline-none ring-1 ring-accent ${IS_MOBILE ? 'px-2 py-2 text-base' : 'px-1 py-0.5 text-xs'}`}
                      />
                    ) : (
                      <button
                        onClick={() => load(c)}
                        onFocus={(e) => showDetails(c, e.currentTarget)}
                        onBlur={() => setHover(null)}
                        aria-label={t('{name} laden', { name: c.name })}
                        className={`min-w-0 flex-1 text-left ${IS_MOBILE ? 'py-2.5' : 'py-1'}`}
                      >
                        <span className={`block truncate text-white ${IS_MOBILE ? 'text-base' : ''}`}>
                          {c.id === linked?.id && <span className="mr-1 text-brand-to">●</span>}
                          {c.name}
                        </span>
                        <span className={`block truncate text-muted ${IS_MOBILE ? 'text-xs' : 'text-[10.5px]'}`}>
                          {t('{tf} · {count} Zeichnungen · {date}', {
                            tf: tfLabel(c.timeframe),
                            count: c.drawings.length,
                            date: shortDate(c.savedAt)
                          })}
                        </span>
                      </button>
                    )}
                    <span className={`${IS_MOBILE ? 'flex' : 'hidden'} gap-1 group-focus-within/row:flex group-hover/row:flex`}>
                      <button
                        onClick={() => setRenaming(c.id)}
                        className={`rounded text-muted hover:text-white ${IS_MOBILE ? 'flex h-11 w-11 items-center justify-center active:bg-line' : 'p-0.5'}`}
                        title={t('Umbenennen')}
                        aria-label={t('{name} umbenennen', { name: c.name })}
                      >
                        <Pencil size={IS_MOBILE ? 18 : 12} />
                      </button>
                      <button
                        onClick={async () =>
                          (await ask(t('Chart-Stand „{name}“ löschen?', { name: c.name }), t('Löschen'), { danger: true })) && deleteChart(c.id)
                        }
                        className={`rounded text-muted hover:text-down ${IS_MOBILE ? 'flex h-11 w-11 items-center justify-center active:bg-line' : 'p-0.5'}`}
                        title={t('Löschen')}
                        aria-label={t('{name} löschen', { name: c.name })}
                      >
                        <Trash2 size={IS_MOBILE ? 18 : 12} />
                      </button>
                    </span>
                  </div>
                ))}
            </div>
          )
        })}
      </div>
      {hover && (
        <div
          style={{ top: hoverAt!.top }}
          className="pointer-events-none absolute right-full mr-2 w-56 rounded-md border border-line bg-panel px-3 py-2 text-[11.5px] leading-relaxed text-slate-300 shadow-2xl shadow-black/50"
        >
          <div className="font-semibold text-white">{hover.name}</div>
          <div>
            {label(hover.symbol)} · {tfLabel(hover.timeframe)} ·{' '}
            {t('Gespeichert {date}', {
              date: new Date(hover.savedAt).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })
            })}
          </div>
          <div>{toolSummary(hover.drawings) || t('Keine Zeichnungen')}</div>
          {hover.id === linked?.id && isDirty(hover, timeframe, drawings ?? []) && (
            <div className="text-amber-500">● {t('Ungespeicherte Änderungen im Tab')}</div>
          )}
        </div>
      )}
    </>
  )
}

/** "Save as …": a name, and what gets saved; the same name for the same symbol asks before overwriting. */
export function SaveDialog({ onClose }: { onClose: () => void }) {
  const symbol = useStore((s) => s.symbol)
  const timeframe = useStore((s) => s.timeframe)
  const names = useStore((s) => s.names)
  const drawings = useStore((s) => s.drawings[drawingsKey(s)]) ?? []
  const charts = useStore((s) => s.charts)
  const saveChart = useStore((s) => s.saveChart)
  const label = names[symbol] ?? symbol
  const [name, setName] = useState(`${label} ${tfLabel(timeframe)}`)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async () => {
    if (!name.trim()) return
    const existing = findByName(charts, symbol, name)
    if (existing && !(await ask(t('„{name}“ für {symbol} überschreiben?', { name: existing.name, symbol: label }), t('Überschreiben'), { danger: true }))) return
    // Overwriting keeps the name the question showed.
    saveChart(existing?.name ?? name, existing?.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-chart-title"
        className={`w-[380px] max-w-full border border-line bg-panel/95 p-5 shadow-2xl backdrop-blur ${IS_MOBILE ? 'rounded-2xl text-base' : 'rounded-xl text-sm'}`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="save-chart-title" className="text-base font-semibold text-white">
            {t('Chart-Stand speichern')}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-white" aria-label={t('Schließen')}>
            <X size={18} />
          </button>
        </div>
        <label className="mb-1 block text-xs text-muted" htmlFor="save-chart-name">
          {t('Name')}
        </label>
        <input
          id="save-chart-name"
          autoFocus
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className={`mb-4 w-full bg-bg text-white outline-none ring-1 ring-line focus:ring-accent ${IS_MOBILE ? 'rounded-xl px-3 py-3' : 'rounded px-2 py-1.5'}`}
        />
        <div className="mb-1 text-xs text-muted">{t('Gespeichert wird')}</div>
        <div className="mb-4 rounded-md border border-line bg-bg px-3 py-2 text-xs leading-relaxed text-slate-300">
          <div>
            <b className="text-white">{label}</b> ({symbol}) · {t('Kerzengröße {tf}', { tf: tfLabel(timeframe) })}
          </div>
          <div>
            {drawings.length ? (
              <>
                <b className="text-white">{t('{count} Zeichnungen', { count: drawings.length })}</b>: {toolSummary(drawings)}
              </>
            ) : (
              t('Keine Zeichnungen')
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className={`text-muted hover:bg-line hover:text-white ${IS_MOBILE ? 'min-h-11 rounded-xl px-4 py-2' : 'rounded px-3 py-1.5'}`}>
            {t('Abbrechen')}
          </button>
          <button
            onClick={save}
            disabled={!name.trim()}
            className={`bg-brand font-medium text-white shadow-glow disabled:opacity-40 ${IS_MOBILE ? 'min-h-11 rounded-xl px-5 py-2' : 'rounded px-3 py-1.5'}`}
          >
            {t('Speichern')}
          </button>
        </div>
      </div>
    </div>
  )
}
