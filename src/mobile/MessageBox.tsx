import { Sparkles } from 'lucide-react'
import { create } from 'zustand'
import { t } from '../shared/i18n'
import { useBack } from './useBack'

/** A message in KandleOS style instead of the grey system dialog (phone and PC); `ok` set = a question with Cancel. */
type Opts = { title?: string; danger?: boolean }
type Box = Opts & { text: string; ok?: string; done(yes: boolean): void }
const useBox = create<{ box: Box | null }>(() => ({ box: null }))

function show(box: Omit<Box, 'done'>): Promise<boolean> {
  // A box still open counts as cancelled.
  useBox.getState().box?.done(false)
  return new Promise((resolve) => useBox.setState({ box: { ...box, done: resolve } }))
}
/** Question with Cancel and `ok`; true when confirmed. `danger` paints `ok` red (deleting). */
export const ask = (text: string, ok: string, o: Opts = {}): Promise<boolean> => show({ text, ok, ...o })
/** Plain notice with one OK. */
export const tell = (text: string, o: Opts = {}): void => void show({ text, ...o })

/** Rendered once by MobileApp and once by the PC's App (inside the fullscreen area, so it shows there too). */
export default function MessageBox() {
  const box = useBox((s) => s.box)
  const close = (yes: boolean) => {
    useBox.setState({ box: null })
    box?.done(yes)
  }
  useBack('message', !!box, () => close(false))
  if (!box) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4" onClick={() => close(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={box.title ?? box.text}
        // The dialog takes the focus (TalkBack reads it), not a button: no focus ring, no Enter that deletes.
        tabIndex={-1}
        ref={(el) => el?.focus()}
        onClick={(e) => e.stopPropagation()}
        // Keys stay in the box like in a system dialog: Escape cancels only the box, Delete does not reach the chart.
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') close(false)
        }}
        className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-2xl shadow-black/50 outline-none"
      >
        {box.title && (
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand shadow-glow">
              <Sparkles size={15} className="text-white" />
            </span>
            {box.title}
          </h2>
        )}
        <p className={`leading-relaxed ${box.title ? 'text-sm text-slate-300' : 'text-base text-white'}`}>{box.text}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {box.ok && (
            <button type="button" onClick={() => close(false)} className="min-h-11 rounded-xl px-4 py-2 text-base leading-tight text-muted active:bg-line">
              {t('Abbrechen')}
            </button>
          )}
          <button
            type="button"
            onClick={() => close(true)}
            className={`min-h-11 rounded-xl px-5 py-2 text-base font-medium leading-tight text-white ${box.danger ? 'bg-down active:opacity-80' : 'bg-brand shadow-glow'}`}
          >
            {box.ok ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
