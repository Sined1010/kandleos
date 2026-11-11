import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adrMayReport, buildEvents, checkDeals, delayDays, eventRoute, importantIds, mergeDeals, summary, unseen, type InsiderDeal } from './events.ts'

const deal = (o: Partial<InsiderDeal> = {}): InsiderDeal => ({
  source: 'BaFin', person: 'A', role: 'vorstand', side: 'buy', date: '2026-01-29', published: '2026-01-29',
  shares: 2009, price: 173.96, volume: 349_485.64, currency: 'EUR', venue: 'XETRA', ...o
})
const ev = (deals: InsiderDeal[]) => buildEvents({ deals, filings: [], news: [] })

test('which source serves a symbol', () => {
  assert.equal(eventRoute('SAP.DE', 'DE0007164600'), 'bafin')
  assert.equal(eventRoute('BMW.F', 'DE0005190003'), 'bafin')
  assert.equal(eventRoute('APC.DE', 'US0378331005'), 'home')
  assert.equal(eventRoute('SAP.DE', undefined), 'none')
  assert.equal(eventRoute('AAPL', undefined), 'finnhub')
  assert.equal(eventRoute('BABA', 'US01609W1027'), 'finnhub')
  for (const s of ['BTCUSDT', '^GSPC', 'GC=F', 'EURUSD=X', 'VOD.L']) assert.equal(eventRoute(s, undefined), 'none', s)
})
test('rows of one person, day and side become one deal', () => {
  const [d] = mergeDeals([deal({ shares: 100, price: 10, volume: 1000 }), deal({ shares: 300, price: 12, volume: 3600, published: '2026-01-30' })])
  assert.deepEqual([d.shares, d.volume, d.price, d.published], [400, 4600, 11.5, '2026-01-30'])
})
test('a same-day swap between related parties is a transfer, never a cluster', () => {
  const rel = { role: 'nahestehend' as const, venue: '', date: '2026-11-04', published: '2026-11-05' }
  const list = ev([
    deal({ ...rel, person: 'X GmbH', volume: 1_499_947 }), deal({ ...rel, person: 'Y GmbH', volume: 17_299_980 }),
    deal({ ...rel, person: 'Z GmbH', volume: 8_688_000 }), deal({ ...rel, person: 'W GmbH', side: 'sell', volume: 27_487_927 })
  ])
  assert.deepEqual(list.map((e) => [e.kind, e.level]), Array(4).fill(['transfer', 1]))
})
test('a related party without a venue is a transfer; with a venue a deal that counts for no cluster', () => {
  assert.equal(ev([deal({ role: 'nahestehend', venue: '' })])[0].kind, 'transfer')
  const list = ev([deal({ role: 'nahestehend' }), deal({ person: 'B', date: '2026-01-30' })])
  assert.deepEqual(list.map((e) => e.kind), ['insider', 'insider'])
})
test('two managers buying within five days are a cluster', () => {
  const list = ev([deal(), deal({ person: 'B', date: '2026-01-30', published: '2026-01-30', volume: 1_015_055.58 })])
  assert.deepEqual(list.map((e) => e.id), ['C|2026-01-29|2', 'I|2026-01-30|B|buy', 'I|2026-01-29|A|buy'])
  assert.deepEqual([list[0].level, list[0].date, list[0].persons, Math.round(list[0].volume!), list[0].currency], [3, '2026-01-30', 2, 1_364_541, 'EUR'])
  assert.ok(list[1].inCluster && list[2].inCluster)
  assert.equal(ev([deal(), deal({ person: 'B', date: '2026-02-03' })])[0].kind, 'cluster') // 5 days apart
  assert.equal(ev([deal(), deal({ person: 'B', date: '2026-02-04' })]).some((e) => e.kind === 'cluster'), false)
  assert.equal(ev([deal(), deal({ date: '2026-01-30' })]).some((e) => e.kind === 'cluster'), false) // same person
  assert.equal(ev([deal(), deal({ person: 'B', side: 'sell', date: '2026-01-30' })]).some((e) => e.kind === 'cluster'), false)
})
test('levels: only buys can be important', () => {
  const level = (o: Partial<InsiderDeal>) => { const e = ev([deal(o)])[0]; return [e.level, !!e.big] }
  assert.deepEqual(level({ volume: 267_450 }), [3, true])
  assert.deepEqual(level({ volume: 99_999 }), [2, false])
  assert.deepEqual(level({ side: 'sell', volume: 5_000_000, currency: 'USD' }), [2, true])
  assert.deepEqual(level({ volume: 416_000, currency: 'HKD' }), [2, false])
  assert.deepEqual(level({ volume: undefined, price: undefined }), [2, false])
})
test('context: which buy of this person, share of the holding', () => {
  const list = ev([deal({ date: '2026-03-01' }), deal({ date: '2026-05-01' }), deal({ date: '2026-07-01' })])
  assert.deepEqual(list.map((e) => e.nth), [3, 2, 1])
  assert.equal(ev([deal({ source: 'Finnhub', role: undefined, shares: 120, holdingAfter: 1120 })])[0].holdingPct, 12)
  assert.equal(ev([deal({ source: 'Finnhub', role: undefined, side: 'sell', shares: 20, holdingAfter: 980 })])[0].holdingPct, 2)
})
test('filings and news are list entries of level 2 and 1', () => {
  const list = buildEvents({ deals: [], filings: [{ form: '8-K', date: '2026-03-12', url: 'https://x/f' }], news: [{ time: 1772000000, headline: 'H', source: 'S', url: 'https://x/n' }] })
  assert.deepEqual(list.map((e) => [e.kind, e.group, e.level]), [['filing', 'filings', 2], ['news', 'news', 1]])
})
test('unseen: nothing on the first visit, a grown cluster is new again', () => {
  const two = ev([deal(), deal({ person: 'B', date: '2026-01-30' })])
  assert.deepEqual(unseen(two, undefined), [])
  assert.deepEqual(unseen(two, []).sort(), importantIds(two).sort())
  assert.deepEqual(unseen(two, importantIds(two)), [])
  const three = ev([deal(), deal({ person: 'B', date: '2026-01-30' }), deal({ person: 'C', date: '2026-01-31', volume: 50_000 })])
  assert.deepEqual(unseen(three, importantIds(two)), ['C|2026-01-29|3'])
})
test('summary line: twelve months, one currency, transfers left out', () => {
  const buys = [267_450, 304_551, 325_218.9, 1_015_055.58, 349_485.64].map((volume, i) => deal({ person: 'P' + i, date: `2026-0${i + 1}-10`, volume }))
  const s = summary(ev([...buys, deal({ side: 'sell', date: '2025-11-13', volume: 95_331.55 }), deal({ date: '2025-11-01' })]), '2026-11-10')
  assert.deepEqual([s.buys, s.sells, s.currency, Math.round(s.buyVolume!), Math.round(s.sellVolume!)], [5, 1, 'EUR', 2_261_761, 95_332])
  assert.equal(summary(ev([deal(), deal({ person: 'B', date: '2026-03-01', currency: 'USD' })]), '2026-11-10').buyVolume, undefined)
})
test('data from the other device: only well-formed deals survive', () => {
  const kept = checkDeals([deal(), { person: 5 }, null, { ...deal(), date: '29.01.2026' }, { ...deal(), person: 'B', volume: Infinity }, { ...deal(), source: 'Other' }])
  assert.deepEqual(kept.map((d) => [d.person, d.volume]), [['A', 349_485.64], ['B', undefined]])
  assert.deepEqual(checkDeals('x'), [])
})
test('days between the deal and its publication', () => assert.equal(delayDays('2026-08-12', '2026-08-14'), 2))
test('a cluster whose first buy left the twelve months is not new again', () => {
  const three = ev([deal(), deal({ person: 'B', date: '2026-01-30' }), deal({ person: 'C', date: '2026-01-31' })])
  const later = ev([deal({ person: 'B', date: '2026-01-30' }), deal({ person: 'C', date: '2026-01-31' })])
  assert.deepEqual(unseen(later, importantIds(three)).filter((id) => id.startsWith('C')), [])
})
test('merged rows keep the holding after the last deal of the day, whatever the order', () => {
  const f = (o: Partial<InsiderDeal>) => deal({ source: 'Finnhub', role: undefined, ...o })
  assert.equal(mergeDeals([f({ shares: 10, holdingAfter: 1020 }), f({ shares: 10, holdingAfter: 1010 })])[0].holdingAfter, 1020)
  assert.equal(mergeDeals([f({ side: 'sell', shares: 10, holdingAfter: 980 }), f({ side: 'sell', shares: 10, holdingAfter: 990 })])[0].holdingAfter, 980)
})
test('news sit on their day in the exchange zone', () => {
  const late = Date.parse('2026-02-25T02:00:00Z') / 1000 // 21:00 the evening before in New York
  const news = [{ time: late, headline: 'H', source: 'S', url: 'https://x/n' }]
  assert.equal(buildEvents({ deals: [], filings: [], news }, 'America/New_York')[0].date, '2026-02-24')
  assert.equal(buildEvents({ deals: [], filings: [], news })[0].date, '2026-02-25')
})
test('US listings report insiders only for issuers outside the SEC exempt countries', () => {
  for (const s of ['7203.T', '0700.HK', '2330.TW', '600519.SS', '000001.SZ', '9988.HK']) assert.equal(adrMayReport(s), true, s)
  for (const s of ['NOVO-B.CO', 'ASML.AS', 'NESN.SW', 'VOD.L', 'SHOP.TO', '005930.KS', 'BHP.AX', 'INFY.NS', 'D05.SI', 'SAP.DE', 'MC.PA', 'AAPL', 'BTCUSDT'])
    assert.equal(adrMayReport(s), false, s)
})
