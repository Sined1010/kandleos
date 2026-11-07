import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { sheetHeights, snapTo, type SheetPos } from './sheetSnap'
import { useBack } from './useBack'

/**
 * A panel pulled up from the bottom edge (like map apps). Dragged by its head, and by the list when half open
 * or when pulled down from the list's top; moved with transform only, so it follows the finger smoothly.
 */
export default function Sheet({ pos, onPos, head, children }: { pos: SheetPos; onPos(p: SheetPos): void; head: ReactNode; children: ReactNode }) {
  const [vh, setVh] = useState(window.innerHeight)
  const [drag, setDrag] = useState<number | null>(null) // visible height while dragging
  const start = useRef({ y: 0, h: 0, t: 0 })
  const pending = useRef(0) // px the finger must move before the sheet follows (0: following or idle)
  const pendingDown = useRef(false)
  const [atTop, setAtTop] = useState(true) // list scrolled to its start
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

  /** Finger down on the sheet; with `wait` px the sheet only follows once the finger has moved that far
   *  (`downOnly`: and only downwards; the list scrolls the other way). */
  const down = (e: PointerEvent<HTMLElement>, wait: number, downOnly = false) => {
    start.current = { y: e.clientY, h: heights[pos], t: e.timeStamp }
    pending.current = wait
    pendingDown.current = downOnly
    if (wait) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag(heights[pos])
  }
  const follow = {
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = start.current
      const moved = e.clientY - s.y
      if (pending.current && (pendingDown.current ? moved : Math.abs(moved)) >= pending.current) {
        pending.current = 0
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag(s.h)
        return
      }
      if (drag === null) return
      setDrag(Math.min(full, Math.max(heights.low, s.h + s.y - e.clientY)))
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      pending.current = 0
      if (drag === null) return
      const s = start.current
      // Average speed of the whole drag (px/ms, up positive).
      const v = e.timeStamp > s.t ? (s.y - e.clientY) / (e.timeStamp - s.t) : 0
      // A tap on the head toggles between low and half.
      if (Math.abs(s.y - e.clientY) < 6) settle(pos === 'low' ? 'half' : 'low')
      else settle(snapTo(drag, v, vh))
      setDrag(null)
    },
    onPointerCancel: () => {
      pending.current = 0
      setDrag(null)
    }
  }

  return (
    <div
      className="mobile-chrome fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-line bg-panel shadow-[0_-8px_24px_rgba(0,0,0,0.5)]"
      style={{
        height: full,
        // Raised by the gesture bar, so the low sheet starts right where the chart ends.
        transform: `translateY(calc(${full - shown}px - var(--sab, 0px)))`,
        transition: drag === null ? 'transform 220ms cubic-bezier(.2,.8,.2,1)' : 'none',
        paddingBottom: 'var(--sab, 0px)'
      }}
    >
      <div
        className="shrink-0 touch-none"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          // The search field fills most of the low sheet: a tap must still focus it, so a drag
          // only starts there once the finger has moved.
          down(e, (e.target as HTMLElement).closest('input') ? 6 : 0)
        }}
        {...follow}
      >
        <div className="mx-auto mb-1 mt-2 h-[5px] w-14 rounded-full bg-brand shadow-[0_0_10px_-2px_var(--color-brand-to)]" />
        {head}
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        // Half open, the list moves the whole sheet (up: fully open). Fully open it scrolls; scrolled to the
        // top, only scrolling down stays with the list (pan-down), so a pull downwards moves the sheet.
        style={{ touchAction: pos === 'half' ? 'none' : pos === 'full' && atTop ? 'pan-down' : undefined }}
        onScroll={(e) => setAtTop(e.currentTarget.scrollTop <= 0)}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('[data-grip]')) return
          // 12 px: rows cancel their tap and long press after 10 px, before the sheet takes the finger.
          if (pos === 'half') down(e, 12)
          else if (pos === 'full' && atTop) down(e, 12, true)
        }}
        {...follow}
      >
        {children}
      </div>
    </div>
  )
}
