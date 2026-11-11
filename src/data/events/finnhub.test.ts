import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchHttp, setHttp } from '../http.ts'
import { FINNHUB_ROW_CAP, finnhubDeals, finnhubFilings, finnhubInsider, finnhubNews } from './finnhub.ts'

const row = (o: object) => ({ name: 'Doe John', share: 1120, change: 120, filingDate: '2026-03-04', transactionDate: '2026-03-02', transactionPrice: 50, transactionCode: 'P', ...o })

test('only open-market buys and sells', () => {
  const list = finnhubDeals([row({}), row({ transactionCode: 'S', change: -20, share: 980 }), row({ transactionCode: 'M' }), row({ transactionCode: 'A' }),
    row({ transactionCode: 'F', change: -5 }), row({ transactionCode: 'G' }), row({ isDerivative: true }), row({ change: -120 }), null, 'x'], true)
  assert.deepEqual(list[0], { source: 'Finnhub', person: 'Doe John', side: 'buy', date: '2026-03-02', published: '2026-03-04', shares: 120, price: 50, volume: 6000, currency: 'USD', holdingAfter: 1120 })
  assert.deepEqual(list.map((d) => [d.side, d.shares]), [['buy', 120], ['sell', 20]])
})
test('no price means no volume; the row currency wins', () => {
  const [a, b] = finnhubDeals([row({ transactionPrice: 0 }), row({ currency: 'CAD' })], false)
  assert.deepEqual([a.price, a.volume, a.currency, b.currency], [undefined, undefined, undefined, 'CAD'])
  assert.deepEqual(finnhubDeals({ nope: 1 }, true), [])
})
test('an empty currency counts as missing', () => {
  assert.equal(finnhubDeals([row({ currency: '' })], true)[0].currency, 'USD')
  assert.equal(finnhubDeals([row({ currency: '' })], false)[0].currency, undefined)
})
test('one call for the year; a very long answer may be cut off', async () => {
  const asked: string[] = []
  const answer = (n: number) => setHttp(async (url, init) => (asked.push(url + ' ' + init.headers?.['X-Finnhub-Token']), { status: 200, ok: true, json: async () => ({ data: Array(n).fill(row({})) }), text: async () => '', setCookies: [] }))
  answer(842)
  const r = await finnhubInsider('TEAM', 'k')
  assert.deepEqual([r.deals.length, r.truncated, asked.length], [842, false, 1])
  const [from, to] = [...asked[0].matchAll(/=(\d{4}-\d\d-\d\d)/g)].map((m) => m[1])
  assert.equal(asked[0], `https://finnhub.io/api/v1/stock/insider-transactions?symbol=TEAM&from=${from}&to=${to} k`)
  assert.equal((Date.parse(to) - Date.parse(from)) / 864e5, 365)
  answer(FINNHUB_ROW_CAP)
  assert.equal((await finnhubInsider('TEAM', 'k')).truncated, true)
})
test('a failing call fails the whole list', async () => {
  setHttp(async () => ({ status: 429, ok: false, json: async () => ({}), text: async () => '', setCookies: [] }))
  await assert.rejects(finnhubInsider('AAPL', 'k'), /HTTP 429/)
  setHttp(fetchHttp)
})
test('filings and news: 8-K with an https link only, newest news first', async () => {
  const reply = (body: unknown) => setHttp(async () => ({ status: 200, ok: true, json: async () => body, text: async () => '', setCookies: [] }))
  reply([{ form: '8-K', filedDate: '2026-11-09 00:00:00', filingUrl: 'http://sec.gov/a' }, { form: '10-Q', filedDate: '2026-11-01 00:00:00', filingUrl: 'https://sec.gov/b' },
    { form: '8-K', filedDate: '2026-10-01 00:00:00', filingUrl: 'javascript:x', reportUrl: 'https://sec.gov/c' }, { form: '8-K', filedDate: '2026-09-01 00:00:00' }])
  assert.deepEqual(await finnhubFilings('AAPL', 'k'), [{ form: '8-K', date: '2026-11-09', url: 'https://sec.gov/a' }, { form: '8-K', date: '2026-10-01', url: 'https://sec.gov/c' }])
  reply([{ datetime: 1, headline: 'Old', source: 'S', url: 'https://x/1' }, { datetime: 2, headline: 'New', source: 'S', url: 'https://x/2' }, { datetime: 3, headline: '', url: 'https://x/3' }, { datetime: 4, headline: 'No link' }])
  assert.deepEqual((await finnhubNews('AAPL', 'k')).map((n) => n.headline), ['New', 'Old'])
  setHttp(fetchHttp)
})
test('a share class is written with a dot at Finnhub', async () => {
  const asked: string[] = []
  setHttp(async (url) => (asked.push(url), { status: 200, ok: true, json: async () => ({ data: [] }), text: async () => '', setCookies: [] }))
  await finnhubInsider('BRK-B', 'k')
  setHttp(async (url) => (asked.push(url), { status: 200, ok: true, json: async () => [], text: async () => '', setCookies: [] }))
  await finnhubFilings('BRK-B', 'k')
  await finnhubNews('BRK-B', 'k')
  assert.ok(asked.every((u) => u.includes('symbol=BRK.B&')), asked.join(' '))
  setHttp(fetchHttp)
})
test('rows that are no open-market buy or sell are counted', async () => {
  setHttp(async () => ({ status: 200, ok: true, json: async () => ({ data: [row({}), row({ transactionCode: 'S', change: -20 }), row({ transactionCode: 'M' }), row({ transactionCode: 'A' }), row({ isDerivative: true })] }), text: async () => '', setCookies: [] }))
  const r = await finnhubInsider('AAPL', 'k')
  assert.deepEqual([r.deals.length, r.hidden], [2, 3])
  setHttp(fetchHttp)
})
