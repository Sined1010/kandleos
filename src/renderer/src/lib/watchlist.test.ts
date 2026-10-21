import test from 'node:test'
import assert from 'node:assert/strict'
import { moveSymbolTo } from './watchlist.ts'

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
