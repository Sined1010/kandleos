import type { PrimitiveHoveredItem } from 'lightweight-charts'

/**
 * How a pattern frame or pill answers a hit test: 'top' so lines and volume bars over the candles do not swallow it,
 * but without itemType 'marker', so an event badge ('top' marker) at the same point always wins (isBetterHit ranks
 * point hits above range hits).
 */
export const PATTERN_HIT: Omit<PrimitiveHoveredItem, 'externalId'> = { zOrder: 'top', cursorStyle: 'pointer' }

/** Phone: a tap within `finger` px of a bar with event badges belongs to the event, as EventLayer reads it. */
export const eventNear = (badgeTimes: number[], toX: (time: number) => number | null, x: number, finger: number): boolean =>
  badgeTimes.some((t) => {
    const bx = toX(t)
    return bx !== null && Math.abs(bx - x) <= finger
  })

/** Whether a hovered object id is an event badge (EventBadges: the bar time as digits, or 'tmp' for the temporary one). */
export const isEventBadge = (id: unknown): id is string => id === 'tmp' || (typeof id === 'string' && /^\d+$/.test(id))
