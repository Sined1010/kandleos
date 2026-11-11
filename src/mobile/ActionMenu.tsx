import { X } from 'lucide-react'
import { useRef, useState } from 'react'
import { t } from '../shared/i18n'
import { useBack } from './useBack'

export interface ActionItem {
  label: string
  danger?: boolean
  disabled?: boolean
  onPick(): void
  /** Starts a group: a small heading (with a line above, except for the first group). */
  section?: string
  /** Shows an × at the end of the item (e.g. closing a tab); the menu stays open, its items follow the change. */
  onRemove?(): void
}

/** A menu sliding up from the bottom: the phone's stand-in for right-click menus. Swiping it down closes it. */
export default function ActionMenu({ title, items, onClose }: { title: string; items: ActionItem[]; onClose(): void }) {
  useBack('action-menu', true, onClose)
  const [dy, setDy] = useState(0) // how far the finger pulled the menu down
  const drag = useRef<{ y: number; t: number; on: boolean } | null>(null)
  const end = () => {
    drag.current = null
    setDy(0)
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        className="touch-none rounded-t-2xl border-t border-line bg-panel pb-[max(env(safe-area-inset-bottom),12px)] pt-2 shadow-2xl"
        style={{ transform: `translateY(${dy}px)`, transition: drag.current?.on ? 'none' : 'transform 180ms ease-out' }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => (drag.current = { y: e.clientY, t: e.timeStamp, on: false })}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const down = e.clientY - d.y
          // Only a real pull moves the menu, so a tap still picks an item.
          if (!d.on && down < 6) return
          if (!d.on) {
            d.on = true
            e.currentTarget.setPointerCapture(e.pointerId)
          }
          setDy(Math.max(0, down))
        }}
        onPointerUp={(e) => {
          const d = drag.current
          if (!d?.on) return void (drag.current = null)
          const down = e.clientY - d.y
          // Pulled far enough, or flicked down faster than 0.5 px/ms.
          if (down > 80 || (e.timeStamp > d.t && down / (e.timeStamp - d.t) > 0.5)) {
            drag.current = null
            onClose()
          } else end()
        }}
        onPointerCancel={end}
        role="menu"
        aria-label={title}
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-brand opacity-60" />
        <p className="truncate px-5 pb-2 text-xs uppercase tracking-wider text-muted">{title}</p>
        {items.map((item, i) => (
          <div key={`${i}:${item.label}`}>
          {item.section && (
            <p className={`px-5 pb-1 pt-2 text-[11px] uppercase tracking-wider text-muted ${i > 0 ? 'mt-1 border-t border-line' : ''}`}>{item.section}</p>
          )}
          <div className="flex items-center">
            <button
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onClose()
                item.onPick()
              }}
              className={`flex min-h-12 min-w-0 flex-1 items-center px-5 text-left text-base active:bg-bg disabled:opacity-40 ${
                item.danger ? 'text-down' : 'text-white'
              }`}
            >
              <span className="truncate">{item.label}</span>
            </button>
            {item.onRemove && (
              <button
                onClick={() => item.onRemove!()}
                aria-label={t('{name} schließen', { name: item.label })}
                className="mr-2 flex h-12 w-12 shrink-0 items-center justify-center text-muted active:bg-bg active:text-white"
              >
                <X size={18} />
              </button>
            )}
          </div>
          </div>
        ))}
      </div>
    </div>
  )
}
