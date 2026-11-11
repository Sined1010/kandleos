import { X } from 'lucide-react'
import { useEffect } from 'react'
import { t } from '../../../shared/i18n'
import AlarmList from './AlarmList'
import { backdropClose } from '../lib/backdrop'

/** PC: price alarms in a window, opened from the watchlist's right-click menu. */
export default function AlarmsModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" {...backdropClose(onClose)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alarms-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-[440px] overflow-y-auto rounded-xl border border-line bg-panel/95 p-5 shadow-2xl backdrop-blur"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="alarms-title" className="text-base font-semibold text-white">
            {t('Kurs-Alarme')}
          </h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-white" aria-label={t('Schließen')}>
            <X size={18} />
          </button>
        </div>
        <AlarmList
          symbol={symbol}
          hint={t('Geprüft wird, solange KandleOS läuft – mit Handy-Kopplung auch im Infobereich. Ein gekoppeltes Handy prüft zusätzlich selbst.')}
        />
      </div>
    </div>
  )
}
