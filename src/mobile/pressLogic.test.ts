import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPress } from './pressLogic.ts'

/** A press with a manual clock: `later()` runs the pending long-press timer. */
function setup() {
  const log: string[] = []
  let pending: (() => void) | null = null
  const press = createPress({
    onLong: () => log.push('long'),
    onTap: () => log.push('tap'),
    setTimer: (fn) => ((pending = fn), 1),
    clearTimer: () => (pending = null)
  })
  return { log, press, later: () => pending?.() }
}

test('a tap fires on the click, not on lifting the finger', () => {
  const { log, press } = setup()
  press.down(0, 0)
  press.up()
  assert.deepEqual(log, [])
  press.click()
  assert.deepEqual(log, ['tap'])
})

test('a long press fires once and swallows the click that follows', () => {
  const { log, press, later } = setup()
  press.down(0, 0)
  later()
  press.up()
  press.click()
  assert.deepEqual(log, ['long'])
})

test('moving the finger more than 10 px cancels both', () => {
  const { log, press, later } = setup()
  press.down(0, 0)
  press.move(0, 11)
  later()
  press.up()
  press.click()
  assert.deepEqual(log, [])
})

test('a click without pointer events (keyboard, TalkBack) is a tap', () => {
  const { log, press } = setup()
  press.click()
  assert.deepEqual(log, ['tap'])
})

test('after a swallowed click the next tap works again', () => {
  const { log, press, later } = setup()
  press.down(0, 0)
  later()
  press.up()
  press.click()
  press.down(0, 0)
  press.up()
  press.click()
  assert.deepEqual(log, ['long', 'tap'])
})

test('a scroll that cancels the touch does not swallow the next keyboard click', () => {
  const { log, press } = setup()
  press.down(0, 0)
  press.cancel()
  press.click()
  assert.deepEqual(log, ['tap'])
})

test('a click without a pointer (keyboard, TalkBack) is never swallowed', () => {
  const { log, press } = setup()
  press.down(0, 0)
  press.move(0, 30)
  press.click(0)
  assert.deepEqual(log, ['tap'])
})

test('right click or the menu key opens the long-press action', () => {
  const { log, press } = setup()
  press.contextMenu()
  assert.deepEqual(log, ['long'])
})

test('a touch long press that also raises a context menu fires only once', () => {
  const { log, press, later } = setup()
  press.down(0, 0)
  press.contextMenu()
  later()
  press.up()
  press.click()
  assert.deepEqual(log, ['long'])
})

test('a context menu after the long press already fired does nothing', () => {
  const { log, press, later } = setup()
  press.down(0, 0)
  later()
  press.contextMenu()
  assert.deepEqual(log, ['long'])
})
