import { Trash2 } from 'lucide-react'
import { t } from '../shared/i18n'
import { TOOLS } from '../renderer/src/components/DrawingToolbar'
import { drawingsKey, useStore } from '../renderer/src/store/useStore'
import { ask } from './MessageBox'

/** Drawing tools along the bottom edge (thumb reach) while drawing; the active tool's name above them. */
export default function DrawTools() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const count = useStore((s) => s.drawings[drawingsKey(s)]?.length ?? 0)
  const symbol = useStore((s) => s.symbol)
  const clearDrawings = useStore((s) => s.clearDrawings)
  const active = TOOLS.find(([id]) => id === tool)
  return (
    // Same 96 px as the low watchlist sheet it replaces, so the chart above keeps its size.
    <div
      className="mobile-chrome draw-tools fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel px-2 pt-1"
      style={{ height: 'calc(6rem + var(--sab, 0px))', paddingBottom: 'var(--sab, 0px)' }}
    >
      <div className="flex items-center gap-2 px-1 pb-1">
        <p className="min-w-0 flex-1 truncate text-xs text-muted">
          {active && tool !== 'cursor' ? t(active[2]).split(/ \(| – /)[0] : t('Werkzeug wählen')}
        </p>
        <button
          onClick={async () =>
            count && (await ask(t('Alle {count} Zeichnungen für {symbol} löschen?', { count, symbol }), t('Löschen'), { danger: true })) && clearDrawings()
          }
          disabled={!count}
          aria-label={t('Alle Zeichnungen löschen')}
          className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs text-down disabled:opacity-30"
        >
          <Trash2 size={14} />
          {t('Alle löschen')}
        </button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto" role="toolbar" aria-label={t('Zeichenwerkzeuge')}>
        {TOOLS.filter(([id]) => id !== 'cursor').map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setTool(tool === id ? 'cursor' : id)}
            aria-label={t(label)}
            aria-pressed={tool === id}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tool === id ? 'bg-brand text-white shadow-glow' : 'bg-bg text-slate-300'}`}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
    </div>
  )
}
