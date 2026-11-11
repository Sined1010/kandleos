import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { EventsResult, InsiderDeal } from '../../../shared/events.ts'
import { loadEvents, openEvents, setSeenStore, useEventsData } from './events.ts'

const result = (deals: InsiderDeal[]): EventsResult => ({ deals, filings: [], news: [], notes: [], source: 'BaFin', fetchedAt: 1 })
const big = { source: 'BaFin', person: 'A', role: 'vorstand', side: 'buy', date: '2026-08-26', published: '2026-08-26', volume: 267_450, currency: 'EUR', venue: 'X' } as InsiderDeal

test('a late answer for another symbol is dropped', async () => {
  let release!: (r: EventsResult) => void
  const slow = loadEvents('SAP.DE', '', () => new Promise((ok) => (release = ok)))
  await loadEvents('AAPL', '', async () => result([]))
  release(result([big])); await slow
  assert.deepEqual([useEventsData.getState().symbol, useEventsData.getState().events.length], ['AAPL', 0])
})
test('first visit notes everything as seen; later visits do not', async () => {
  const seen: Record<string, string[]> = {}
  setSeenStore({ get: (s) => seen[s], mark: (s, ids) => (seen[s] = ids) })
  await loadEvents('SAP.DE', '', async () => result([big]))
  assert.deepEqual(seen['SAP.DE'], ['I|2026-08-26|A|buy'])
  seen['SAP.DE'] = []
  await loadEvents('SAP.DE', '', async () => result([big]))
  assert.deepEqual(seen['SAP.DE'], [])
})
test('a failed load says so and keeps no old events', async () => {
  await loadEvents('SAP.DE', '', async () => { throw new Error('offline') })
  assert.deepEqual([useEventsData.getState().state, useEventsData.getState().events, useEventsData.getState().error], ['error', [], 'offline'])
})
test('a first visit whose insider part failed notes nothing until the deals arrive', async () => {
  const seen: Record<string, string[]> = {}
  setSeenStore({ get: (s) => seen[s], mark: (s, ids) => (seen[s] = ids) })
  await loadEvents('SAP.DE', '', async () => ({ ...result([]), notes: [{ part: 'insider', state: 'error', source: 'BaFin' }] }))
  assert.equal(seen['SAP.DE'], undefined)
  await loadEvents('SAP.DE', '', async () => result([big]))
  assert.deepEqual(seen['SAP.DE'], ['I|2026-08-26|A|buy'])
})
test('opening the tab while the insider part failed keeps the seen list', async () => {
  const seen: Record<string, string[]> = { 'SAP.DE': ['old'] }
  setSeenStore({ get: (s) => seen[s], mark: (s, ids) => (seen[s] = ids) })
  await loadEvents('SAP.DE', '', async () => ({ ...result([]), notes: [{ part: 'insider', state: 'error', source: 'BaFin' }] }))
  openEvents()
  assert.deepEqual(seen['SAP.DE'], ['old'])
})
test('a symbol without a source notes nothing', async () => {
  const seen: Record<string, string[]> = {}
  setSeenStore({ get: (s) => seen[s], mark: (s, ids) => (seen[s] = ids) })
  await loadEvents('BTCUSDT', '', async () => ({ deals: [], filings: [], news: [], notes: [{ part: 'insider', state: 'no-source' }], fetchedAt: 1 }))
  openEvents()
  assert.deepEqual(seen, {})
})
