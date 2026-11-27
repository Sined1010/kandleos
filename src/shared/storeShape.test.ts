import test from 'node:test'
import assert from 'node:assert/strict'
import { storeShapeOk } from './storeShape.ts'

test('stores of every version so far pass, with fields missing that merge fills in', () => {
  assert.equal(storeShapeOk({}, 8), true)
  assert.equal(storeShapeOk({ watchlist: ['BTCUSDT', 'AAPL'] }, 1), true)
  assert.equal(storeShapeOk({ symbol: 'AAPL', timeframe: '1D', drawings: { AAPL: [{ id: 'a', type: 'hline' }] } }, 3), true)
  const v8 = {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    activeTab: 't1',
    range: null,
    language: 'de',
    folders: [{ id: 'f1', name: 'Krypto', symbols: ['BTCUSDT'], collapsed: false }],
    tabs: [{ id: 't1', symbol: 'BTCUSDT', timeframe: '1h', range: null }],
    drawings: { 't1:BTCUSDT': [{ id: 'd1', type: 'trend', points: [] }] },
    charts: [{ id: 'c1', name: 'x', symbol: 'BTCUSDT', timeframe: '1h', drawings: [] }],
    names: { BTCUSDT: 'Bitcoin' },
    pinned: [],
    alarms: [],
    forecastView: {},
    forecastRun: {},
    agentsConfig: {},
    eventFilters: {},
    sync: { stamps: {}, seen: {}, bases: {} }
  }
  assert.equal(storeShapeOk(v8, 8), true)
})

test('a field the app would trip over at start is refused (it would show only an error, every start)', () => {
  for (const state of [
    { folders: 5 },
    { folders: [{ name: 'x', symbols: 'BTCUSDT' }] },
    { tabs: 'x' },
    { tabs: [{ symbol: 5 }] },
    { drawings: 'x' },
    { drawings: { k: 'x' } },
    { charts: {} },
    { symbol: 5 },
    { watchlist: [1] },
    { names: [] },
    { sync: 'x' }
  ])
    assert.equal(storeShapeOk(state, 8), false, JSON.stringify(state))
  assert.equal(storeShapeOk([], 8), false)
})

test('a version this app does not know is refused: none below 0, none newer, no fraction', () => {
  for (const v of [-3, 9, 1.5, '8', undefined]) assert.equal(storeShapeOk({}, v), false, String(v))
})
