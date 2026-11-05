import { t } from '../shared/i18n'
import { TOOLS } from '../renderer/src/components/DrawingToolbar'
import { useStore } from '../renderer/src/store/useStore'

/** Drawing tools along the bottom edge (thumb reach) while drawing; the active tool's name above them. */
export default function DrawTools() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const active = TOOLS.find(([id]) => id === tool)
  return (
    <div className="mobile-chrome shrink-0 border-t border-line bg-panel px-2 pb-2 pt-1">
      <p className="truncate px-1 pb-1 text-xs text-muted">{active && tool !== 'cursor' ? t(active[2]).split(/ \(| – /)[0] : t('Werkzeug wählen')}</p>
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
