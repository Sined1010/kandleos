import { X } from 'lucide-react'
import type { CSSProperties } from 'react'
import { msg, t } from '../../../shared/i18n'
import { PATTERN_NAME, type LookBack, type PatternHit } from '../../../shared/patterns'
import type { Candle } from '../../../shared/types'
import { lookBackLines, PATTERN_INFO } from '../lib/patternText'
import { THEME } from '../lib/theme'

export interface PatternItem {
  hit: PatternHit
  look: LookBack
  /** The pattern's own candles, for the small picture. */
  candles: Candle[]
  /** 0 = last finished bar, 1 = the one before, 2 = the one before that. */
  ago: number
  trend: 'up' | 'down'
}

const AGO = [msg('letzte fertige Kerze'), msg('vorletzte fertige Kerze'), msg('drittletzte fertige Kerze')]

/** The pattern's candles, drawn small with the chart's colours. */
function Mini({ candles }: { candles: Candle[] }) {
  const hi = Math.max(...candles.map((c) => c.high))
  const lo = Math.min(...candles.map((c) => c.low))
  const y = (v: number) => (hi > lo ? 3 + ((hi - v) / (hi - lo)) * 28 : 17)
  const step = 34 / (candles.length + 1)
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" className="shrink-0">
      {candles.map((c, i) => {
        const x = step * (i + 1)
        const col = c.close >= c.open ? THEME.up : THEME.down
        const top = y(Math.max(c.open, c.close))
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeWidth="1.4" />
            <rect x={x - 3} y={top} width="6" height={Math.max(1.5, y(Math.min(c.open, c.close)) - top)} rx="1" fill={col} />
          </g>
        )
      })}
    </svg>
  )
}

/** Explanation of the patterns at the last finished bars: what they can mean and how they did on this symbol before. */
export default function PatternCard(p: { items: PatternItem[]; step: number; style?: CSSProperties; className?: string; onClose?: () => void }) {
  return (
    <div
      className={`w-[340px] max-w-[calc(100vw-1rem)] space-y-3 rounded-xl border border-line bg-panel/95 px-3.5 py-3 text-xs shadow-2xl shadow-black/50 backdrop-blur ${p.className ?? ''}`}
      style={p.style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {p.onClose && (
        <button onClick={p.onClose} aria-label={t('Schließen')} className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted hover:text-white">
          <X size={14} />
        </button>
      )}
      {p.items.map(({ hit, look, candles, ago, trend }) => (
        <div key={hit.id + hit.end} className="space-y-1.5">
          <div className="flex items-center gap-2.5 pr-4">
            <Mini candles={candles} />
            <div>
              <div className="text-sm font-semibold text-white">{PATTERN_NAME[hit.id]}</div>
              <div className="text-[11px] text-muted">
                {t(AGO[ago])} · {t(trend === 'down' ? msg('nach einem Rückgang') : msg('nach einem Anstieg'))}
              </div>
            </div>
          </div>
          <p className="leading-relaxed text-slate-300">{t(PATTERN_INFO[hit.id])}</p>
          <div className="space-y-0.5 border-t border-line pt-1.5">
            {lookBackLines(look, p.step).map((line, i) => (
              <p key={i} className={i === 0 && look.verdict !== 'rare' ? 'text-[13px] text-white' : 'text-[11px] text-muted'}>
                {line}
              </p>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-muted">{t('Kein Kauf- oder Verkaufssignal und keine Prognose.')}</p>
    </div>
  )
}
