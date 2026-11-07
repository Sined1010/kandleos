import { Sparkles } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { t } from '../shared/i18n'
import ActionMenu from './ActionMenu'
import { useLongPress } from './useLongPress'

/**
 * The forecast button in the phone's header (ChartArea keeps the logic and renders this into the header).
 * Off: a tap starts the forecast. Shown: a tap offers "off" and the settings. A long press opens the settings always.
 */
export default function MobileKiButton(p: {
  state: 'idle' | 'loading' | 'shown' | 'error'
  pct?: number
  disabled: boolean
  pcOff: boolean
  onToggle(): void
  onSettings(): void
  settings: ReactNode
}) {
  const [menu, setMenu] = useState(false)
  const loading = p.state === 'loading'
  const shown = p.state === 'shown'
  const press = useLongPress(p.onSettings, () => {
    if (loading || p.disabled) return
    if (shown) setMenu(true)
    else p.onToggle()
  })
  return (
    // Events from here bubble through the portal into the chart, where a pointerdown would deselect a drawing.
    <div className="relative h-full w-full" onPointerDown={(e) => e.stopPropagation()}>
      <button
        {...press}
        aria-label={shown ? t('Prognose aus') : t('KI-Prognose')}
        aria-disabled={p.disabled || loading}
        className={`flex h-full w-full items-center justify-center gap-1 rounded-[10px] text-sm font-semibold text-white ${
          shown ? 'bg-accent' : 'bg-brand'
        } ${loading ? 'animate-pulse' : ''} ${p.disabled ? 'opacity-40' : ''} ${p.pcOff && !shown ? 'opacity-40 grayscale' : ''}`}
      >
        <Sparkles size={16} className="text-amber-200" />
        {loading ? (p.pct !== undefined && p.pct < 100 ? `${p.pct} %` : '…') : t('KI')}
      </button>
      {p.settings}
      {menu && (
        <ActionMenu
          title={t('KI-Prognose')}
          onClose={() => setMenu(false)}
          items={[
            { label: t('Prognose aus'), onPick: p.onToggle },
            { label: t('Anzeige und Analyse …'), onPick: p.onSettings }
          ]}
        />
      )}
    </div>
  )
}
