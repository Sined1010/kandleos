/**
 * Tap and long press on one element. The long press fires after 500 ms; the tap fires on lifting the finger, not on
 * the browser's click: Android's WebView drops the click of the first tap after a fast swipe (pulling the sheet up),
 * so the tap needed a second try. The click after a finger tap is swallowed (its target is this element, so a menu
 * the tap opens is not hit); a click without a finger before it (keyboard, TalkBack) is the tap.
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
  let tapped = false // this touch's tap fired on lifting the finger: its click, whatever its detail, is no second tap
  const cancel = () => {
    if (start) o.clearTimer(start.timer)
    start = null
  }
  return {
    down(x: number, y: number) {
      cancel()
      swallow = false
      fired = false
      tapped = false
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
    /** Finger lifted: a tap, unless the long press fired or the finger moved (both clear `start`). */
    up() {
      if (!start) return
      cancel()
      tapped = true
      o.onTap?.()
    },
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
      if (tapped) tapped = false
      else if (swallow && detail !== 0) swallow = false
      else {
        swallow = false
        o.onTap?.()
      }
    }
  }
}
