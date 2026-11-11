import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backdropClose } from './backdrop.ts'

test('a dialog closes only when the press starts and ends on its backdrop', () => {
  let closed = 0
  const props = backdropClose(() => closed++)
  const back = {}, input = {}
  const at = (target: object) => ({ target, currentTarget: back })
  props.onMouseDown(at(input)) // selecting text in a field, released outside the dialog
  props.onClick(at(back))
  assert.equal(closed, 0)
  props.onMouseDown(at(back))
  props.onClick(at(back))
  assert.equal(closed, 1)
  props.onMouseDown(at(back)) // pressed on the backdrop, released inside the dialog
  props.onClick(at(input))
  assert.equal(closed, 1)
})
