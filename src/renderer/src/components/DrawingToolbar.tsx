import {
  Activity,
  ChartNoAxesGantt,
  Columns2,
  Minus,
  MousePointer2,
  MoveUpRight,
  RectangleHorizontal,
  Ruler,
  SeparatorVertical,
  Slash,
  Spline,
  Trash2,
  X,
  type LucideIcon
} from 'lucide-react'
import { useStore, type Tool } from '../store/useStore'

const TOOLS: [Tool, LucideIcon, string][] = [
  ['cursor', MousePointer2, 'Auswahl'],
  ['trend', Slash, 'Trendlinie (2 Klicks)'],
  ['ray', MoveUpRight, 'Strahl – Trendlinie bis zum Rand verlängert (2 Klicks)'],
  ['hline', Minus, 'Horizontale Linie (1 Klick)'],
  ['vline', SeparatorVertical, 'Vertikale Linie (1 Klick)'],
  ['channel', Columns2, 'Parallelkanal (3 Klicks: Linie, dann Abstand)'],
  ['rect', RectangleHorizontal, 'Rechteck / Zone (2 Klicks)'],
  ['fib', ChartNoAxesGantt, 'Fibonacci Retracement (2 Klicks: Hoch → Tief)'],
  ['elliott', Activity, 'Elliott-Impuls 0-1-2-3-4-5 (6 Klicks)'],
  ['abc', Spline, 'Elliott-Korrektur 0-A-B-C (4 Klicks)'],
  ['measure', Ruler, 'Messen – Preis, Prozent und Kerzen (2 Klicks)']
]

export default function DrawingToolbar() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const selectedId = useStore((s) => s.selectedId)
  const count = useStore((s) => s.drawings[s.symbol]?.length ?? 0)
  const symbol = useStore((s) => s.symbol)
  const removeDrawing = useStore((s) => s.removeDrawing)
  const clearDrawings = useStore((s) => s.clearDrawings)

  const btn = 'flex h-8 w-8 items-center justify-center rounded'
  return (
    <nav className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2">
      {TOOLS.map(([id, Icon, label]) => (
        <button
          key={id}
          onClick={() => setTool(id)}
          title={label}
          aria-label={label}
          aria-pressed={tool === id}
          className={`${btn} ${tool === id ? 'bg-accent text-white' : 'text-muted hover:bg-line hover:text-white'}`}
        >
          <Icon size={17} />
        </button>
      ))}
      <div className="my-1 h-px w-6 bg-line" />
      {selectedId && (
        <button
          onClick={() => removeDrawing(selectedId)}
          title="Ausgewählte Zeichnung löschen (Entf)"
          aria-label="Ausgewählte Zeichnung löschen"
          className={`${btn} text-down hover:bg-line`}
        >
          <X size={17} />
        </button>
      )}
      <button
        onClick={() => count && confirm(`Alle ${count} Zeichnungen für ${symbol} löschen?`) && clearDrawings()}
        disabled={!count}
        title={`Alle Zeichnungen für ${symbol} löschen`}
        aria-label="Alle Zeichnungen löschen"
        className={`${btn} text-muted enabled:hover:bg-line enabled:hover:text-down disabled:opacity-30`}
      >
        <Trash2 size={17} />
      </button>
    </nav>
  )
}
