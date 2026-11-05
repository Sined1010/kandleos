import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { t } from '../shared/i18n'
import { useBack } from './useBack'

/** A full-screen page over the app (info, saved charts, licenses); back or × closes it. */
export default function Layer({ id, title, onClose, children }: { id: string; title: string; onClose(): void; children: ReactNode }) {
  useBack(id, true, onClose)
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg pt-[max(env(safe-area-inset-top),var(--safe-area-inset-top,0px))] pb-[max(env(safe-area-inset-bottom),var(--safe-area-inset-bottom,0px))]">
      <div className="flex items-center justify-between border-b border-line px-3 py-1">
        <span className="truncate font-semibold text-white">{title}</span>
        <button onClick={onClose} aria-label={t('Schließen')} className="mobile-icon">
          <X size={18} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">{children}</div>
    </div>
  )
}
