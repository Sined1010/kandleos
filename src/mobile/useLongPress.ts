import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { useRef, type PointerEvent } from 'react'

/**
 * Tap and long press (500 ms, with a short vibration) on one element; moving the finger more than 10 px
 * (scrolling) cancels both. Spread the result onto the element.
 */
export function useLongPress(onLong: () => void, onTap?: () => void) {
  const state = useRef<{ x: number; y: number; timer: number; fired: boolean } | null>(null)
  const cancel = () => {
    if (state.current) clearTimeout(state.current.timer)
    state.current = null
  }
  return {
    onPointerDown: (e: PointerEvent) => {
      const s = { x: e.clientX, y: e.clientY, fired: false, timer: 0 }
      s.timer = window.setTimeout(() => {
        s.fired = true
        void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
        onLong()
      }, 500)
      state.current = s
    },
    onPointerMove: (e: PointerEvent) => {
      const s = state.current
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancel()
    },
    onPointerUp: () => {
      const s = state.current
      cancel()
      if (s && !s.fired) onTap?.()
    },
    onPointerCancel: cancel,
    onContextMenu: (e: { preventDefault(): void }) => e.preventDefault()
  }
}
