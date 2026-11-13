import { create } from 'zustand'

/** A short confirmation that fades by itself ("Added to …"), unlike MessageBox, which waits for OK. */
const useNote = create<{ text: string | null }>(() => ({ text: null }))
let timer: ReturnType<typeof setTimeout> | undefined

export function notice(text: string): void {
  clearTimeout(timer)
  useNote.setState({ text })
  timer = setTimeout(() => useNote.setState({ text: null }), 2500)
}

/** Rendered once by MobileApp, above the watchlist sheet. */
export default function Notice() {
  const text = useNote((s) => s.text)
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-28 z-[65] flex justify-center px-4">
      {text && <div className="rounded-xl border border-line bg-panel/95 px-4 py-2.5 text-base text-white shadow-2xl shadow-black/50 backdrop-blur">{text}</div>}
    </div>
  )
}
