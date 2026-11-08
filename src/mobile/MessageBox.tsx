import { Sparkles } from 'lucide-react'
import { create } from 'zustand'
import { t } from '../shared/i18n'
import { IS_MOBILE } from '../renderer/src/lib/platform'
import { useBack } from './useBack'

/** A message in KandleOS style instead of Android's grey system dialog; `ok` set = a question with Cancel. */
type Opts = { title?: string; danger?: boolean }
type Box = Opts & { text: string; ok?: string; done(yes: boolean): void }
const useBox = create<{ box: Box | null }>(() => ({ box: null }))

function show(box: Omit<Box, 'done'>): Promise<boolean> {
  // A box still open counts as cancelled.
  useBox.getState().box?.done(false)
  return new Promise((resolve) => useBox.setState({ box: { ...box, done: resolve } }))
}
// On the phone the box, on the PC the system dialog as before (shared components call these too).
/** Question with Cancel and `ok`; true when confirmed. `danger` paints `ok` red (deleting). */
export const ask = (text: string, ok: string, o: Opts = {}): Promise<boolean> =>
  IS_MOBILE ? show({ text, ok, ...o }) : Promise.resolve(confirm(text))
/** Plain notice with one OK. */
export const tell = (text: string, o: Opts = {}): void => (IS_MOBILE ? void show({ text, ...o }) : alert(text))

/** Rendered once by MobileApp. */
export default function MessageBox() {
  const box = useBox((s) => s.box)
  const close = (yes: boolean) => {
    useBox.setState({ box: null })
    box?.done(yes)
  }
  useBack('message', !!box, () => close(false))
  if (!box) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center bg-black/60 px-4" onClick={() => close(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={box.title ?? box.text}
        // The dialog takes the focus (TalkBack reads it), not a button: no focus ring, no Enter that deletes.
        tabIndex={-1}
        ref={(el) => el?.focus()}
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-2xl border border-line bg-panel p-5 shadow-2xl shadow-black/50 outline-none"
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
        <div className="mt-5 flex justify-end gap-2">
          {box.ok && (
            <button type="button" onClick={() => close(false)} className="h-11 rounded-xl px-4 text-base text-muted active:bg-line">
              {t('Abbrechen')}
            </button>
          )}
          <button
            type="button"
            onClick={() => close(true)}
            className={`h-11 rounded-xl px-5 text-base font-medium text-white ${box.danger ? 'bg-down active:opacity-80' : 'bg-brand shadow-glow'}`}
          >
            {box.ok ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
