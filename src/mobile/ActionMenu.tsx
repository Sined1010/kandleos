import { useBack } from './useBack'

export interface ActionItem {
  label: string
  danger?: boolean
  disabled?: boolean
  onPick(): void
}

/** A menu sliding up from the bottom: the phone's stand-in for right-click menus. */
export default function ActionMenu({ title, items, onClose }: { title: string; items: ActionItem[]; onClose(): void }) {
  useBack('action-menu', true, onClose)
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        className="rounded-t-2xl border-t border-line bg-panel pb-[max(env(safe-area-inset-bottom),12px)] pt-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="menu"
        aria-label={title}
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
        <p className="truncate px-5 pb-2 text-xs uppercase tracking-wider text-muted">{title}</p>
        {items.map((item) => (
          <button
            key={item.label}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onPick()
            }}
            className={`flex min-h-12 w-full items-center px-5 text-left text-base active:bg-bg disabled:opacity-40 ${
              item.danger ? 'text-down' : 'text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
