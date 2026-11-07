import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { useRef, type PointerEvent } from 'react'
import { createPress } from './pressLogic'

/**
 * Tap and long press (500 ms, with a short vibration) on one element; moving the finger more than 10 px
 * (scrolling) cancels both. The tap comes with the click (see pressLogic). Spread the result onto the element.
 */
export function useLongPress(onLong: () => void, onTap?: () => void) {
  // The latest callbacks; the press itself lives as long as the element.
  const cb = useRef({ onLong, onTap })
  cb.current = { onLong, onTap }
  const press = useRef<ReturnType<typeof createPress>>(null)
  press.current ??= createPress({
    onLong: () => {
      void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
      cb.current.onLong()
    },
    onTap: () => cb.current.onTap?.(),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id)
  })
  const p = press.current
  return {
    onPointerDown: (e: PointerEvent) => p.down(e.clientX, e.clientY),
    onPointerMove: (e: PointerEvent) => p.move(e.clientX, e.clientY),
    onPointerUp: () => p.up(),
    onPointerCancel: () => p.cancel(),
    onClick: (e: { detail: number }) => p.click(e.detail),
    onContextMenu: (e: { preventDefault(): void }) => {
      e.preventDefault()
      p.contextMenu()
    }
  }
}
