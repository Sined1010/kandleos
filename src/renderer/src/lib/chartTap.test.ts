import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { MouseEventParams, Time } from 'lightweight-charts'
import { mainPanePoint, nextPinch, routeTap, type TapHandler } from './chartTap.ts'

const p = { point: { x: 10, y: 20 } } as MouseEventParams<Time>

test('routeTap calls handlers by priority and passes taken on', () => {
  const calls: [number, boolean][] = []
  const h = (prio: number, takes: boolean): { prio: number; fn: TapHandler } => ({
    prio,
    fn: (_, taken) => (calls.push([prio, taken]), takes && !taken)
  })
  routeTap([h(2, true), h(0, true), h(1, false)], p)
  assert.deepEqual(calls, [
    [0, false],
    [1, true],
    [2, true]
  ])
})

test('routeTap: nobody takes the tap, every handler sees taken false', () => {
  const seen: boolean[] = []
  const fn: TapHandler = (_, taken) => (seen.push(taken), false)
  routeTap([{ prio: 0, fn }, { prio: 1, fn }], p)
  assert.deepEqual(seen, [false, false])
})

test('nextPinch: a second finger starts a pinch, only a new single touch ends it', () => {
  let s = nextPinch(false, 'touchstart', 1)
  assert.equal(s, false)
  s = nextPinch(s, 'touchstart', 2)
  assert.equal(s, true)
  // The second finger lifts first, then the first one: the tap that follows still belongs to the pinch.
  s = nextPinch(s, 'touchend', 1)
  assert.equal(s, true)
  s = nextPinch(s, 'touchend', 0)
  assert.equal(s, true)
  s = nextPinch(s, 'touchstart', 1)
  assert.equal(s, false)
})

test('mainPanePoint: only taps in the main pane count for drawings and badges', () => {
  assert.deepEqual(mainPanePoint({ point: { x: 1, y: 2 }, paneIndex: 0 } as MouseEventParams<Time>), { x: 1, y: 2 })
  assert.equal(mainPanePoint({ point: { x: 1, y: 2 }, paneIndex: 1 } as MouseEventParams<Time>), undefined)
  assert.equal(mainPanePoint({} as MouseEventParams<Time>), undefined)
})
