/**
 * Tap and long press on one element. The long press fires after 500 ms; the tap fires on the click that follows
 * lifting the finger (so a menu it opens is not hit by that click, and keyboard and TalkBack clicks work too).
 * A context menu (right click, menu key) does what the long press does. Moving the finger more than 10 px cancels both; the click after a long press or such a move is swallowed.
 */
export function createPress(o: {
  onLong(): void
  onTap?(): void
  setTimer(fn: () => void, ms: number): number
  clearTimer(id: number): void
}) {
  let start: { x: number; y: number; timer: number } | null = null
  let swallow = false
  let fired = false // the long press of this touch has fired
  const cancel = () => {
    if (start) o.clearTimer(start.timer)
    start = null
  }
  return {
    down(x: number, y: number) {
      cancel()
      swallow = false
      fired = false
      const timer = o.setTimer(() => {
        start = null
        swallow = true
        fired = true
        o.onLong()
      }, 500)
      start = { x, y, timer }
    },
    move(x: number, y: number) {
      if (start && Math.hypot(x - start.x, y - start.y) > 10) {
        cancel()
        swallow = true
      }
    },
    up: cancel,
    // The browser sends no click after a cancelled touch (scrolling), so there is nothing to swallow.
    cancel,
    /** Right click, the menu key, or the context menu Android raises on a long press: the long-press action, once. */
    contextMenu() {
      if (fired) {
        fired = false
        return
      }
      cancel()
      swallow = true
      o.onLong()
    },
    /** detail 0: a click without a pointer (keyboard, TalkBack), never swallowed. */
    click(detail?: number) {
      if (swallow && detail !== 0) swallow = false
      else {
        swallow = false
        o.onTap?.()
      }
    }
  }
}
