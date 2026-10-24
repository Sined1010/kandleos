import {
  Activity,
  AudioWaveform,
  ChartNoAxesColumnIncreasing,
  ChartNoAxesGantt,
  Columns2,
  Columns4,
  Fan,
  Merge,
  Minus,
  MousePointer2,
  MoveUpRight,
  RectangleHorizontal,
  Ruler,
  SeparatorVertical,
  Shuffle,
  Slash,
  Spline,
  Trash2,
  Triangle,
  Type,
  X,
  type LucideIcon
} from 'lucide-react'
import { msg, t } from '../../../shared/i18n'
import { drawingsKey, useStore, type Tool } from '../store/useStore'

const TOOLS: [Tool, LucideIcon, string][] = [
  ['cursor', MousePointer2, msg('Auswahl')],
  ['trend', Slash, msg('Trendlinie (2 Klicks)')],
  ['ray', MoveUpRight, msg('Strahl – Trendlinie bis zum Rand verlängert (2 Klicks)')],
  ['hline', Minus, msg('Horizontale Linie (1 Klick)')],
  ['vline', SeparatorVertical, msg('Vertikale Linie (1 Klick)')],
  ['channel', Columns2, msg('Parallelkanal (3 Klicks: Linie, dann Abstand)')],
  ['rect', RectangleHorizontal, msg('Rechteck / Zone (2 Klicks)')],
  ['fib', ChartNoAxesGantt, msg('Fibonacci Retracement (2 Klicks: Hoch → Tief)')],
  ['fibext', ChartNoAxesColumnIncreasing, msg('Fibonacci-Erweiterung (3 Klicks: Start, Ende der Bewegung, Rücksetzer)')],
  ['fibfan', Fan, msg('Fibonacci-Fächer (2 Klicks: Start → Ende der Bewegung)')],
  ['fibtime', Columns4, msg('Fibonacci-Zeitzonen (2 Klicks: Start und Länge einer Einheit)')],
  ['elliott', Activity, msg('Elliott-Impuls 0-1-2-3-4-5 (6 Klicks)')],
  ['abc', Spline, msg('Elliott-Korrektur 0-A-B-C (4 Klicks)')],
  ['triangle', Triangle, msg('Elliott-Dreieck 0-A-B-C-D-E (6 Klicks)')],
  ['wxy', Merge, msg('Elliott-Kombination 0-W-X-Y (4 Klicks)')],
  ['wxyxz', Shuffle, msg('Elliott-Dreifachkombination 0-W-X-Y-X-Z (6 Klicks)')],
  ['sine', AudioWaveform, msg('Sinuswelle (2 Klicks: Tief → nächstes Hoch oder umgekehrt)')],
  ['measure', Ruler, msg('Messen – Preis, Prozent und Kerzen (2 Klicks)')],
  ['text', Type, msg('Text (1 Klick, dann tippen · Doppelklick bearbeitet)')]
]
// A thin divider before each group: Fibonacci, Elliott, the rest.
const GROUP_STARTS = new Set<Tool>(['fib', 'elliott', 'sine'])

export default function DrawingToolbar() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const selectedId = useStore((s) => s.selectedId)
  const count = useStore((s) => s.drawings[drawingsKey(s)]?.length ?? 0)
  const symbol = useStore((s) => s.symbol)
  const removeDrawing = useStore((s) => s.removeDrawing)
  const clearDrawings = useStore((s) => s.clearDrawings)

  const btn = 'flex h-8 w-8 items-center justify-center rounded-lg transition'
  return (
    // Scrolls in small windows rather than cutting off the lower tools.
    <nav className="flex w-11 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-panel py-2">
      {TOOLS.map(([id, Icon, label]) => (
        <div key={id} className="contents">
          {GROUP_STARTS.has(id) && <div className="my-0.5 h-px w-6 shrink-0 bg-line" />}
          <button
            onClick={() => setTool(id)}
            title={t(label)}
            aria-label={t(label)}
            aria-pressed={tool === id}
            className={`${btn} shrink-0 ${tool === id ? 'bg-brand text-white shadow-glow' : 'text-muted hover:bg-line hover:text-white'}`}
          >
            <Icon size={17} />
          </button>
        </div>
      ))}
      <div className="my-1 h-px w-6 bg-line" />
      {selectedId && (
        <button
          onClick={() => removeDrawing(selectedId)}
          title={t('Ausgewählte Zeichnung löschen (Entf)')}
          aria-label={t('Ausgewählte Zeichnung löschen')}
          className={`${btn} text-down hover:bg-line`}
        >
          <X size={17} />
        </button>
      )}
      <button
        onClick={() => count && confirm(t('Alle {count} Zeichnungen für {symbol} löschen?', { count, symbol })) && clearDrawings()}
        disabled={!count}
        title={t('Alle Zeichnungen für {symbol} löschen', { symbol })}
        aria-label={t('Alle Zeichnungen löschen')}
        className={`${btn} text-muted enabled:hover:bg-line enabled:hover:text-down disabled:opacity-30`}
      >
        <Trash2 size={17} />
      </button>
    </nav>
  )
}
