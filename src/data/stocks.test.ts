import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setHttp } from './http.ts'
import { finnhubCheck, setStockSource, stockQuotes } from './stocks.ts'

const KEY = 'abcdefghij1234567890'
// Tuesday 2026-11-24 15:00 UTC = 10:00 in New York, regular session.
const IN_SESSION = Date.UTC(2026, 10, 24, 15)

function at<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  const real = Date.now
  Date.now = () => ms
  return fn().finally(() => (Date.now = real))
}
const reply = (status: number, body: unknown) => ({ status, ok: status < 300, json: async () => body, text: async () => '', setCookies: [] })
const yahooQuote = { chart: { result: [{ meta: { regularMarketPrice: 100, chartPreviousClose: 99, regularMarketTime: 1 }, timestamp: [], indicators: { quote: [{ close: [] }] } }] } }

test('polling with a Finnhub key asks Yahoo, not Finnhub: the free plan has 60 calls a minute for the stream and events', async () => {
  const hosts: string[] = []
  setHttp(async (url) => {
    hosts.push(new URL(url).host)
    return reply(200, yahooQuote)
  })
  setStockSource('yahoo')
  const { quotes } = await at(IN_SESSION, () => stockQuotes(['AAPL', 'MSFT']))
  assert.equal(quotes.AAPL.price, 100)
  assert.equal(hosts.filter((h) => h.includes('finnhub')).length, 0)
})

test('when Yahoo answers no symbol at all, the poll says why instead of staying silent', async () => {
  setHttp(async () => reply(429, {}))
  setStockSource('yahoo')
  const { quotes, error } = await stockQuotes(['AAPL', 'SAP.DE'])
  assert.deepEqual(quotes, {})
  assert.ok(error)
})

test('a Finnhub key that hit its rate limit still counts as a valid key (the stream may open)', async () => {
  setHttp(async () => reply(429, {}))
  assert.equal(await finnhubCheck(KEY), null)
})

test('one unknown symbol is no source error: only Yahoo refusing (429, 5xx) or not answering is', async () => {
  setHttp(async () => reply(404, {}))
  setStockSource('yahoo')
  assert.equal((await stockQuotes(['NOSUCH'])).error, null)
  setHttp(async () => reply(503, {}))
  assert.ok((await stockQuotes(['AAPL'])).error)
})
