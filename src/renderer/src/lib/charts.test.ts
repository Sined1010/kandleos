import test from 'node:test'
import assert from 'node:assert/strict'
import type { ChartTab, Drawing, Indicators } from '../store/useStore'
import { findByName, groupCharts, isDirty, linkedChart, loadTarget, toolCounts, type SavedChart } from './charts.ts'

const trend: Drawing = { id: 't1', type: 'trend', p1: { time: 1, price: 10 }, p2: { time: 2, price: 20 } }
const hline: Drawing = { id: 'h1', type: 'hline', price: 15 }
const chart = (over: Partial<SavedChart>): SavedChart => ({
  id: 'c1',
  name: 'BTC Elliott A',
  symbol: 'BTCUSDT',
  timeframe: '1W',
  drawings: [trend, hline],
  indicators: {} as Indicators,
  savedAt: 1,
  ...over
})
const tab = (id: string, symbol: string, chartId?: string): ChartTab => ({ id, symbol, timeframe: '1W', range: null, chartId })

test('isDirty compares candle size and drawing contents', () => {
  const c = chart({})
  assert.equal(isDirty(c, '1W', [trend, hline]), false)
  assert.equal(isDirty(c, '1D', [trend, hline]), true)
  assert.equal(isDirty(c, '1W', [trend, { ...hline, price: 16 }]), true)
  // Deleted and drawn again with the same content counts as unchanged.
  assert.equal(isDirty(c, '1W', [trend, { ...hline }]), false)
})

test('toolCounts counts drawings per tool', () => {
  assert.deepEqual(toolCounts([trend, { ...trend, id: 't2' }, hline]), { trend: 2, hline: 1 })
  assert.deepEqual(toolCounts([]), {})
})

test('findByName ignores spaces and case, per symbol', () => {
  const charts = [chart({})]
  assert.equal(findByName(charts, 'BTCUSDT', '  btc elliott a '), charts[0])
  assert.equal(findByName(charts, 'ETHUSDT', 'BTC Elliott A'), undefined)
})

test('linkedChart only while the tab shows the saved symbol', () => {
  const charts = [chart({})]
  assert.equal(linkedChart(tab('a', 'BTCUSDT', 'c1'), charts), charts[0])
  assert.equal(linkedChart(tab('a', 'ETHUSDT', 'c1'), charts), undefined)
  assert.equal(linkedChart(tab('a', 'BTCUSDT', 'gone'), charts), undefined)
})

test('groupCharts: current symbol first, others by label, newest first, search', () => {
  const charts = [
    chart({ id: '1', name: 'Fib', symbol: 'ETHUSDT', savedAt: 1 }),
    chart({ id: '2', name: 'Old', symbol: 'BTCUSDT', savedAt: 1 }),
    chart({ id: '3', name: 'New', symbol: 'BTCUSDT', savedAt: 5 }),
    chart({ id: '4', name: 'Earnings', symbol: 'AAPL', savedAt: 2 })
  ]
  const label = (s: string) => ({ BTCUSDT: 'Bitcoin', ETHUSDT: 'Ethereum', AAPL: 'Apple' })[s] ?? s
  const all = groupCharts(charts, 'BTCUSDT', '', label)
  assert.deepEqual(
    all.map((g) => [g.symbol, g.current, g.charts.map((c) => c.id)]),
    [
      ['BTCUSDT', true, ['3', '2']],
      ['AAPL', false, ['4']],
      ['ETHUSDT', false, ['1']]
    ]
  )
  assert.deepEqual(groupCharts(charts, 'BTCUSDT', 'ethereum', label).map((g) => g.symbol), ['ETHUSDT'])
  assert.deepEqual(groupCharts(charts, 'BTCUSDT', 'aapl', label).map((g) => g.symbol), ['AAPL'])
  assert.deepEqual(groupCharts(charts, 'BTCUSDT', 'NEW', label).map((g) => g.charts.map((c) => c.id)), [['3']])
  // A current symbol without saved charts is no empty group.
  assert.deepEqual(groupCharts(charts, 'SOLUSDT', '', label).map((g) => g.symbol), ['AAPL', 'BTCUSDT', 'ETHUSDT'])
})

test('loadTarget picks the tab a saved chart opens in', () => {
  const c = chart({})
  const one = [tab('a', 'BTCUSDT')]
  assert.deepEqual(loadTarget(c, { tabs: [tab('a', 'ETHUSDT'), tab('b', 'BTCUSDT', 'c1')], activeTab: 'a', drawings: {} }, 3), {
    kind: 'switch',
    tabId: 'b'
  })
  assert.deepEqual(loadTarget(c, { tabs: one, activeTab: 'a', drawings: { 'a:BTCUSDT': [] } }, 3), { kind: 'here' })
  // The active tab already shows it (drawings since cleared): loading again restores what was saved.
  assert.deepEqual(loadTarget(c, { tabs: [tab('a', 'BTCUSDT', 'c1')], activeTab: 'a', drawings: { 'a:BTCUSDT': [] } }, 3), {
    kind: 'here'
  })
  // Drawn on since saving: those lines would be lost, so ask first; unchanged reloads without asking.
  const linkedTab = [tab('a', 'BTCUSDT', 'c1')]
  assert.deepEqual(loadTarget(c, { tabs: linkedTab, activeTab: 'a', drawings: { 'a:BTCUSDT': [trend] } }, 3), { kind: 'revert' })
  assert.deepEqual(loadTarget(c, { tabs: linkedTab, activeTab: 'a', drawings: { 'a:BTCUSDT': [trend, hline] } }, 3), { kind: 'here' })
  assert.deepEqual(loadTarget(c, { tabs: [tab('a', 'ETHUSDT')], activeTab: 'a', drawings: { 'a:ETHUSDT': [hline] } }, 3), {
    kind: 'new'
  })
  // Lines the tab keeps for the loaded symbol would be overwritten unseen.
  assert.deepEqual(loadTarget(c, { tabs: [tab('a', 'ETHUSDT')], activeTab: 'a', drawings: { 'a:BTCUSDT': [hline] } }, 3), {
    kind: 'new'
  })
  const three = [tab('a', 'ETHUSDT'), tab('b', 'AAPL'), tab('c', 'NVDA')]
  assert.deepEqual(loadTarget(c, { tabs: three, activeTab: 'a', drawings: { 'a:ETHUSDT': [hline] } }, 3), { kind: 'confirm' })
})
