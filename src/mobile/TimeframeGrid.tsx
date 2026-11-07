import { t } from '../shared/i18n'
import { TIMEFRAMES, tfLabel } from '../shared/types'
import { useStore } from '../renderer/src/store/useStore'
import { useBack } from './useBack'

/** All candle sizes as a grid under the header's "1h ▾" button; a tap picks one and closes it. */
export default function TimeframeGrid({ onClose, top }: { onClose(): void; top: number }) {
  const timeframe = useStore((s) => s.timeframe)
  useBack('timeframes', true, onClose)
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        role="menu"
        aria-label={t('Alle Kerzengrößen')}
        className="absolute inset-x-2 grid grid-cols-4 gap-1.5 rounded-xl border border-line bg-panel/95 p-2 shadow-2xl shadow-black/50 backdrop-blur"
        style={{ top }}
        onClick={(e) => e.stopPropagation()}
      >
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            role="menuitemradio"
            aria-checked={tf === timeframe}
            onClick={() => {
              useStore.getState().setTimeframe(tf)
              onClose()
            }}
            className={`min-h-11 rounded-lg text-sm font-medium ${tf === timeframe ? 'bg-brand text-white' : 'text-slate-200 active:bg-line'}`}
          >
            {tfLabel(tf)}
          </button>
        ))}
      </div>
    </div>
  )
}
