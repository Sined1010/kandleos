import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSymbolEvents, germanIsin, type EventDeps } from './index.ts'

function setup(over: Partial<EventDeps> = {}) {
  const calls: string[] = []
  let clock = 1_000_000
  const deps: EventDeps = {
    isin: async (s) => (calls.push('isin'), s === 'SAP.DE' ? 'DE0007164600' : s === 'APC.DE' ? 'US0378331005' : undefined),
    bafin: async () => (calls.push('bafin'), { deals: [], hidden: 0 }),
    insider: async () => (calls.push('insider'), { deals: [], truncated: false, hidden: 0 }),
    filings: async () => (calls.push('filings'), []),
    news: async () => (calls.push('news'), []),
    now: () => clock,
    ...over
  }
  return { get: createSymbolEvents(deps), calls, tick: (s: number) => (clock += s) }
}
test('a German share asks BaFin only', async () => {
  const { get, calls } = setup()
  const r = await get('SAP.DE', 'k')
  assert.deepEqual([calls, r.source, r.notes, r.fetchedAt], [['isin', 'bafin'], 'BaFin', [], 1_000_000])
})
test('a US share without a key asks nobody and says why', async () => {
  const { get, calls } = setup()
  assert.deepEqual((await get('AAPL', '')).notes.map((n) => [n.part, n.state]), [['insider', 'no-key'], ['filings', 'no-key'], ['news', 'no-key']])
  assert.deepEqual(calls, [])
})
test('a US share with a key asks Finnhub for all three', async () => {
  const { get, calls } = setup({ insider: async () => ({ deals: [], truncated: true, hidden: 0 }) })
  const r = await get('AAPL', 'k')
  assert.deepEqual([calls.sort(), r.source, r.notes], [['filings', 'news'], 'Finnhub', [{ part: 'insider', state: 'truncated', source: 'Finnhub' }]])
})
test('foreign shares on German exchanges, crypto, unknown ISIN', async () => {
  const { get } = setup()
  assert.deepEqual((await get('APC.DE', 'k')).notes, [{ part: 'insider', state: 'home' }])
  assert.deepEqual((await get('BTCUSDT', 'k')).notes, [{ part: 'insider', state: 'no-source' }])
  assert.deepEqual((await get('XYZ.DE', 'k')).notes, [{ part: 'insider', state: 'no-isin', source: 'BaFin' }])
  await assert.rejects(get('../x', 'k'))
})
test('one failing source leaves the others and is retried after a minute', async () => {
  const { get, calls, tick } = setup({ filings: async () => { throw new Error('finnhub.io HTTP 429') } })
  assert.deepEqual((await get('AAPL', 'k')).notes, [{ part: 'filings', state: 'error', source: 'Finnhub' }])
  tick(30); await get('AAPL', 'k')
  assert.equal(calls.filter((c) => c === 'insider').length, 1)
  tick(31); await get('AAPL', 'k')
  assert.equal(calls.filter((c) => c === 'insider').length, 2)
})
test('a good answer is kept for 15 minutes', async () => {
  const { get, calls, tick } = setup()
  await Promise.all([get('SAP.DE', 'k'), get('SAP.DE', 'k')])
  tick(899); await get('SAP.DE', 'k')
  assert.equal(calls.filter((c) => c === 'bafin').length, 1)
  tick(2); await get('SAP.DE', 'k')
  assert.equal(calls.filter((c) => c === 'bafin').length, 2)
})
test('a failing ISIN lookup is an error, not "no open source"', async () => {
  const { get } = setup({ isin: async () => { throw new Error('xetra down') } })
  assert.deepEqual((await get('SAP.DE', 'k')).notes, [{ part: 'insider', state: 'error', source: 'BaFin' }])
})
test('the ISIN of a German listing: a failed Xetra list is an error, a missing entry asks Wikidata', async () => {
  const asked: string[] = []
  const down = { xetra: async () => { throw new Error('Deutsche Börse HTTP 503') }, wikidata: async () => (asked.push('wiki'), 'DE0007164600') }
  await assert.rejects(germanIsin('SAP.DE', down), /503/)
  assert.equal(asked.length, 0)
  const { get } = setup({ isin: (s) => germanIsin(s, down) })
  assert.deepEqual((await get('SAP.DE', 'k')).notes, [{ part: 'insider', state: 'error', source: 'BaFin' }])
  assert.equal(await germanIsin('SAP.DE', { xetra: async () => undefined, wikidata: async (t, s) => (asked.push(t + '.' + s), 'DE0007164600') }), 'DE0007164600')
  assert.equal(await germanIsin('SAP.F', { xetra: async () => ({ isin: 'DE0007164600', wkn: '716460' }), wikidata: async () => undefined }), 'DE0007164600')
  assert.deepEqual(asked, ['SAP.DE'])
})
test('the count of rows the source had but the list leaves out travels along', async () => {
  assert.equal((await setup({ bafin: async () => ({ deals: [], hidden: 4 }) }).get('SAP.DE', 'k')).hidden, 4)
  assert.equal((await setup({ insider: async () => ({ deals: [], truncated: false, hidden: 7 }) }).get('AAPL', 'k')).hidden, 7)
})
test('a phone without its PC says where German insider data comes from, and asks again soon', async () => {
  const pcNeeded = Object.assign(new Error('offline'), { name: 'PcNeeded' })
  const { get, calls, tick } = setup({ bafin: async () => { calls.push('bafin'); throw pcNeeded } })
  assert.deepEqual((await get('SAP.DE', 'k')).notes, [{ part: 'insider', state: 'via-pc', source: 'BaFin', reason: 'offline' }])
  tick(61); await get('SAP.DE', 'k')
  assert.equal(calls.filter((c) => c === 'bafin').length, 2)
})
test('deals the phone got through its PC say so', async () => {
  assert.equal((await setup({ bafin: async () => ({ deals: [], hidden: 0, via: 'pc' as const }) }).get('SAP.DE', 'k')).via, 'pc')
  assert.equal((await setup().get('SAP.DE', 'k')).via, undefined)
})
test('a listing without an insider source may point to its US listing; a failing lookup points nowhere', async () => {
  const asked: string[] = []
  const adr = async (s: string) => (asked.push(s), { symbol: 'TM', exchange: 'NYSE' })
  assert.deepEqual((await setup({ adr }).get('7203.T', 'k')).adr, { symbol: 'TM', exchange: 'NYSE' })
  assert.equal((await setup({ adr }).get('BTCUSDT', 'k')).adr, undefined)
  assert.equal((await setup({ adr }).get('SAP.DE', 'k')).adr, undefined)
  assert.deepEqual(asked, ['7203.T'])
  assert.equal((await setup({ adr: async () => { throw new Error('Wikidata HTTP 503') } }).get('7203.T', 'k')).adr, undefined)
})
test('no US-listing hint for a home listing in a country whose issuers the SEC exempts', async () => {
  const asked: string[] = []
  const adr = async (s: string) => (asked.push(s), { symbol: 'NVO', exchange: 'NYSE' })
  assert.equal((await setup({ adr }).get('NOVO-B.CO', 'k')).adr, undefined)
  assert.equal((await setup({ adr }).get('ASML.AS', 'k')).adr, undefined)
  assert.deepEqual(asked, [])
})
test('without its PC the phone says why: not paired, PC too old, or just not reachable', async () => {
  const fail = (msg: string) => async () => { throw Object.assign(new Error(msg), { name: 'PcNeeded' }) }
  for (const reason of ['not-paired', 'unknown-op', 'offline'] as const)
    assert.deepEqual((await setup({ bafin: fail(reason) }).get('SAP.DE', 'k')).notes, [{ part: 'insider', state: 'via-pc', source: 'BaFin', reason }])
  assert.deepEqual((await setup({ bafin: fail('removed') }).get('SAP.DE', 'k')).notes[0].reason, 'not-paired')
})
