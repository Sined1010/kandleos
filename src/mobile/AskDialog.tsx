import { useState } from 'react'
import { t } from '../shared/i18n'
import { useBack } from './useBack'

export interface Ask {
  title: string
  value?: string
  /** Label of the confirm button. */
  ok: string
  /** An empty value is a valid answer (e.g. back to the default name). */
  allowEmpty?: boolean
  onOk(value: string): void
}

/**
 * A name field in KandleOS style (instead of the browser's prompt). It sits in the upper part of the screen,
 * so the keyboard never covers it.
 */
export default function AskDialog({ ask, onClose }: { ask: Ask; onClose(): void }) {
  const [value, setValue] = useState(ask.value ?? '')
  useBack('ask', true, onClose)
  const name = value.trim()
  return (
    <div className="fixed inset-0 z-50 bg-black/60 px-4 pt-[18vh]" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={ask.title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (!name && !ask.allowEmpty) return
          onClose()
          ask.onOk(name)
        }}
        className="rounded-2xl border border-line bg-panel p-5 shadow-2xl shadow-black/50"
      >
        <h2 className="mb-3 text-base font-semibold text-white">{ask.title}</h2>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          enterKeyHint="done"
          className="w-full rounded-xl bg-bg px-3 py-3 text-base text-white outline-none ring-1 ring-line focus:ring-accent"
        />
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl px-4 py-2 text-base leading-tight text-muted active:bg-line">
            {t('Abbrechen')}
          </button>
          <button
            type="submit"
            disabled={!name && !ask.allowEmpty}
            className="min-h-11 rounded-xl bg-brand px-5 py-2 text-base font-medium leading-tight text-white shadow-glow disabled:opacity-40 disabled:shadow-none"
          >
            {ask.ok}
          </button>
        </div>
      </form>
    </div>
  )
}
