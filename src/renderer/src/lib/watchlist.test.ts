import test from 'node:test'
import assert from 'node:assert/strict'
import { avgChange, insertTarget, moveSymbolTo, sortSymbols, upDown } from './watchlist.ts'

const folders = [
  { id: 'a', symbols: ['AAPL', 'NVDA', 'MSFT', 'TSLA'] },
  { id: 'b', symbols: ['BTCUSDT', 'ETHUSDT'] }
]
const list = (fs: typeof folders, id: string) => fs.find((f) => f.id === id)!.symbols

test('reorders within a folder: up, down and to the end', () => {
  assert.deepEqual(list(moveSymbolTo(folders, 'MSFT', 'a', 'a', 'AAPL'), 'a'), ['MSFT', 'AAPL', 'NVDA', 'TSLA'])
  assert.deepEqual(list(moveSymbolTo(folders, 'AAPL', 'a', 'a', 'TSLA'), 'a'), ['NVDA', 'MSFT', 'AAPL', 'TSLA'])
  assert.deepEqual(list(moveSymbolTo(folders, 'AAPL', 'a', 'a', null), 'a'), ['NVDA', 'MSFT', 'TSLA', 'AAPL'])
  // Dropping a symbol in front of itself changes nothing.
  assert.equal(moveSymbolTo(folders, 'NVDA', 'a', 'a', 'NVDA'), folders)
})

test('moves into another folder at a position, without duplicates', () => {
  const moved = moveSymbolTo(folders, 'NVDA', 'a', 'b', 'ETHUSDT')
  assert.deepEqual(list(moved, 'a'), ['AAPL', 'MSFT', 'TSLA'])
  assert.deepEqual(list(moved, 'b'), ['BTCUSDT', 'NVDA', 'ETHUSDT'])
  const twice = [{ id: 'a', symbols: ['AAPL'] }, { id: 'b', symbols: ['AAPL', 'BTCUSDT'] }]
  assert.deepEqual(list(moveSymbolTo(twice, 'AAPL', 'a', 'b', null), 'b'), ['BTCUSDT', 'AAPL'])
})

test('insertTarget: before the item, or before the next one, null at the end', () => {
  const s = ['AAPL', 'NVDA', 'MSFT']
  assert.equal(insertTarget(s, 1, false), 'NVDA')
  assert.equal(insertTarget(s, 1, true), 'MSFT')
  assert.equal(insertTarget(s, 2, true), null)
  assert.equal(insertTarget(s, 0, false), 'AAPL')
})

const ch: Record<string, number> = { A: 2, B: -3, C: 0, D: 5 }
const chg = (s: string) => ch[s]
const nm = (s: string) => ({ A: 'Zeta', B: 'alpha', C: 'Beta', D: 'gamma', X: 'Delta' })[s]!

test('sortSymbols: own keeps the order, up/down by signed change, missing quotes last', () => {
  const s = ['A', 'X', 'B', 'C', 'D']
  assert.equal(sortSymbols(s, 'own', chg, nm), s)
  assert.deepEqual(sortSymbols(s, 'up', chg, nm), ['D', 'A', 'C', 'B', 'X'])
  assert.deepEqual(sortSymbols(s, 'down', chg, nm), ['B', 'C', 'A', 'D', 'X'])
  assert.deepEqual(sortSymbols(s, 'name', chg, nm), ['B', 'C', 'X', 'D', 'A'])
  assert.deepEqual(s, ['A', 'X', 'B', 'C', 'D']) // input untouched
})

test('avgChange: mean of finite changes, undefined without any', () => {
  assert.equal(avgChange([1, -3, undefined, NaN]), -1)
  assert.equal(avgChange([]), undefined)
  assert.equal(avgChange([undefined, NaN]), undefined)
})

test('upDown: each symbol once, zero counts as up, missing or NaN not at all', () => {
  const c: Record<string, number> = { A: 0, B: 1.2, C: -0.5, N: NaN }
  assert.deepEqual(upDown(['A', 'A', 'B', 'C', 'X', 'N'], (s) => c[s]), { up: 2, down: 1 })
})

test('sortSymbols: NaN sorts like a missing quote', () => {
  assert.deepEqual(sortSymbols(['N', 'A'], 'up', (s) => ({ N: NaN, A: 1 })[s], (s) => s), ['A', 'N'])
})
