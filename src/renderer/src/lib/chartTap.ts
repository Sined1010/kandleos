// Phone: one place that hands a tap on the chart to the layers (events, patterns, drawings) in a fixed order, and
// drops taps that end a two-finger zoom. lightweight-charts never cancels the tap during a pinch: it fires one where
// the first finger lifts, which opened event and pattern cards while zooming.
import type { IChartApi, MouseEventParams, Time } from 'lightweight-charts'

/** Lower goes first. */
export const TAP = { EVENT_BADGE: 0, CLOCK: 1, LINE: 2, EVENT_COLUMN: 3, PATTERN: 4 } as const

/** Takes the tap (true) only while nobody has; once `taken`, it only closes what it has open. */
export type TapHandler = (p: MouseEventParams<Time>, taken: boolean) => boolean

/** The tap's point if it was in the main pane: drawings and badges live there, indicator panes have their own y. */
export const mainPanePoint = (p: MouseEventParams<Time>): { x: number; y: number } | undefined =>
  p.point && (p.paneIndex ?? 0) === 0 ? p.point : undefined

export function routeTap(handlers: { prio: number; fn: TapHandler }[], p: MouseEventParams<Time>): void {
  let taken = false
  for (const h of [...handlers].sort((a, b) => a.prio - b.prio)) taken = h.fn(p, taken) || taken
}

/** Whether the current touch gesture is a pinch: set by a second finger, cleared only by the next single touch. */
export function nextPinch(pinching: boolean, type: 'touchstart' | 'touchend' | 'touchcancel', touches: number): boolean {
  if (type !== 'touchstart') return pinching
  return touches >= 2
}

interface Router {
  handlers: { prio: number; fn: TapHandler }[]
  stop: () => void
}
const routers = new WeakMap<IChartApi, Router>()

/** Registers a layer's tap handler on the chart; returns the unsubscribe. */
export function onChartTap(chart: IChartApi, prio: number, fn: TapHandler): () => void {
  let r = routers.get(chart)
  if (!r) {
    const handlers: Router['handlers'] = []
    let pinching = false
    const onTouch = (e: TouchEvent) => {
      pinching = nextPinch(pinching, e.type as 'touchstart', e.touches.length)
    }
    const onClick = (p: MouseEventParams<Time>) => {
      if (!pinching) routeTap(handlers, p)
    }
    // On the document, capture phase: a second finger also counts where it lands on a layer over the chart (a selected
    // drawing, a badge), and this runs before the chart's own touchend fires the tap.
    for (const type of ['touchstart', 'touchend', 'touchcancel']) document.addEventListener(type, onTouch as EventListener, { capture: true, passive: true })
    chart.subscribeClick(onClick)
    const stop = () => {
      for (const type of ['touchstart', 'touchend', 'touchcancel']) document.removeEventListener(type, onTouch as EventListener, { capture: true })
      // The chart may already be removed when the tab closes.
      try {
        chart.unsubscribeClick(onClick)
      } catch {}
    }
    r = { handlers, stop }
    routers.set(chart, r)
  }
  const router = r
  const entry = { prio, fn }
  router.handlers.push(entry)
  return () => {
    const i = router.handlers.indexOf(entry)
    if (i >= 0) router.handlers.splice(i, 1)
    if (!router.handlers.length) {
      router.stop()
      routers.delete(chart)
    }
  }
}
