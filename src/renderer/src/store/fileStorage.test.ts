import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileStorage } from './fileStorage.ts'

test('a save that changes no stored field is not written (a click that only selects)', () => {
  const writes: string[] = []
  const s = fileStorage(() => null, (t) => void writes.push(t))
  const drawings = { a: [1] }
  s.setItem('k', { state: { drawings, symbol: 'BTC' }, version: 8 })
  s.setItem('k', { state: { drawings, symbol: 'BTC' }, version: 8 })
  assert.equal(writes.length, 1)
  s.setItem('k', { state: { drawings: { a: [1, 2] }, symbol: 'BTC' }, version: 8 })
  assert.equal(writes.length, 2)
  assert.deepEqual(JSON.parse(writes[1]), { state: { drawings: { a: [1, 2] }, symbol: 'BTC' }, version: 8 })
})

test('the file text is read as JSON; no file gives null', () => {
  assert.equal(fileStorage(() => null, () => {}).getItem('k'), null)
  assert.deepEqual(fileStorage(() => '{"state":{"x":1},"version":8}', () => {}).getItem('k'), { state: { x: 1 }, version: 8 })
})

test('after a failed load nothing is written, so the defaults never replace the file', () => {
  const writes: string[] = []
  const s = fileStorage(() => null, (t) => void writes.push(t))
  s.stop()
  s.setItem('k', { state: { x: 1 }, version: 8 })
  assert.equal(writes.length, 0)
})

test('a save that failed (disk full) is written again by the next save, even of the same state', async () => {
  const writes: string[] = []
  let ok = false
  const s = fileStorage(() => null, async (t) => {
    writes.push(t)
    return ok
  })
  const drawings = { a: [1] }
  s.setItem('k', { state: { drawings }, version: 8 })
  await new Promise((r) => setTimeout(r, 0))
  ok = true
  s.setItem('k', { state: { drawings }, version: 8 })
  assert.equal(writes.length, 2)
})
