import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { sheetHeights, snapTo, type SheetPos } from './sheetSnap'
import { useBack } from './useBack'

/**
 * A panel pulled up from the bottom edge (like map apps). Dragged only by its head, so the list inside
 * scrolls normally; moved with transform only, so it follows the finger smoothly.
 */
export default function Sheet({ pos, onPos, head, children }: { pos: SheetPos; onPos(p: SheetPos): void; head: ReactNode; children: ReactNode }) {
  const [vh, setVh] = useState(window.innerHeight)
  const [drag, setDrag] = useState<number | null>(null) // visible height while dragging
  const start = useRef({ y: 0, h: 0, t: 0 })
  useEffect(() => {
    const on = () => setVh(window.innerHeight)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  useBack('sheet', pos !== 'low', () => onPos('low'))

  const heights = sheetHeights(vh)
  const full = heights.full
  const shown = drag ?? heights[pos]
  const settle = (p: SheetPos) => {
    if (p !== pos) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    onPos(p)
  }

  return (
    <div
      className="mobile-chrome fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-line bg-panel shadow-[0_-8px_24px_rgba(0,0,0,0.5)]"
      style={{
        height: full,
        transform: `translateY(${full - shown}px)`,
        transition: drag === null ? 'transform 220ms cubic-bezier(.2,.8,.2,1)' : 'none',
        paddingBottom: 'max(env(safe-area-inset-bottom), var(--safe-area-inset-bottom, 0px))'
      }}
    >
      <div
        className="shrink-0 touch-none"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('input, button')) return
          e.currentTarget.setPointerCapture(e.pointerId)
          start.current = { y: e.clientY, h: heights[pos], t: e.timeStamp }
          setDrag(heights[pos])
        }}
        onPointerMove={(e) => {
          if (drag === null) return
          const s = start.current
          setDrag(Math.min(full, Math.max(heights.low, s.h + s.y - e.clientY)))
        }}
        onPointerUp={(e) => {
          if (drag === null) return
          const s = start.current
          // Average speed of the whole drag (px/ms, up positive).
          const v = e.timeStamp > s.t ? (s.y - e.clientY) / (e.timeStamp - s.t) : 0
          // A tap on the head toggles between low and half.
          if (Math.abs(s.y - e.clientY) < 6) settle(pos === 'low' ? 'half' : 'low')
          else settle(snapTo(drag, v, vh))
          setDrag(null)
        }}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="mx-auto mb-1 mt-2 h-1 w-10 rounded-full bg-line" />
        {head}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </div>
  )
}
