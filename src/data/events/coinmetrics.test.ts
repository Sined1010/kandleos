import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { FlowSeries } from '../../shared/chain.ts'
import { dailyFlows } from './coinmetrics.ts'

// A series that already holds yesterday (any test date), so only the 04:00 UTC rule applies.
const series = (asset: 'BTC' | 'ETH'): FlowSeries => ({ asset, source: 'Coin Metrics', days: [{ date: '2026-12-31', in: 1, out: 1 }] })

test('each coin is fetched once a day: kept until 04:00 UTC, when the next values are out', async () => {
  let now = Date.UTC(2026, 10, 15, 10)
  let calls = 0
  const get = dailyFlows(async (a) => (calls++, series(a)), () => now)
  await get('BTC')
  await get('BTC')
  await get('ETH')
  assert.equal(calls, 2)
  now = Date.UTC(2026, 10, 16, 3, 59)
  await get('BTC')
  assert.equal(calls, 2)
  now = Date.UTC(2026, 10, 16, 4, 1)
  await get('BTC')
  assert.equal(calls, 3)
})

test('a failure is asked again after a minute, not the next day', async () => {
  let now = Date.UTC(2026, 10, 15, 10)
  let calls = 0
  const get = dailyFlows(async (a) => (++calls === 1 ? Promise.reject(new Error('down')) : series(a)), () => now)
  await assert.rejects(get('BTC'))
  await assert.rejects(get('BTC'))
  now += 61_000
  assert.equal((await get('BTC')).asset, 'BTC')
  assert.equal(calls, 2)
})

test('a failed refresh keeps the last good series and asks again after a minute', async () => {
  let now = Date.UTC(2026, 10, 15, 10)
  let calls = 0
  const day = { date: '2026-11-14', in: 1, out: 2 }
  const get = dailyFlows(async (a) => (++calls === 2 ? Promise.reject(new Error('down')) : { ...series(a), days: [day] }), () => now)
  await get('BTC')
  now = Date.UTC(2026, 10, 16, 5)
  assert.deepEqual((await get('BTC')).days, [day])
  now += 61_000
  await get('BTC')
  assert.equal(calls, 3)
})

test('an answer still missing yesterday is asked again after an hour, not the next day', async () => {
  let now = Date.UTC(2026, 10, 15, 4, 30)
  let calls = 0
  const get = dailyFlows(async (a) => (calls++, { ...series(a), days: [{ date: '2026-11-13', in: 1, out: 1 }] }), () => now)
  await get('ETH')
  now += 30 * 60_000
  await get('ETH')
  assert.equal(calls, 1)
  now += 31 * 60_000
  await get('ETH')
  assert.equal(calls, 2)
})
