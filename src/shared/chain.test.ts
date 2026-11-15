import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flowAsset, flowSummary, flowsPerBar, netFlow, parseCoinMetrics, unusualDays, type FlowDay } from './chain.ts'

const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 864e5).toISOString().slice(0, 10)
/** Days with the given net flows (in − out), holdings counting down from 1000. */
const series = (nets: number[]): FlowDay[] =>
  nets.map((v, i) => ({ date: day(i), in: 100 + Math.max(v, 0), out: 100 + Math.max(-v, 0), supply: 1000 - i }))

test('only BTC and ETH have exchange flows', () => {
  assert.equal(flowAsset('BTCUSDT'), 'BTC')
  assert.equal(flowAsset('ETHUSDC'), 'ETH')
  assert.equal(flowAsset('ETHBTC'), 'ETH')
  assert.equal(flowAsset('SOLUSDT'), undefined)
  assert.equal(flowAsset('WBTCUSDT'), undefined)
  assert.equal(flowAsset('AAPL'), undefined)
})

test('Coin Metrics rows: strings to numbers, one asset, oldest first, broken rows left out', () => {
  const body = {
    data: [
      { asset: 'btc', time: '2026-11-13T00:00:00.000000000Z', FlowInExNtv: '26738.3', FlowOutExNtv: '28867.8', SplyExNtv: '2720719.5', 'FlowInExNtv-status': 'flash' },
      { asset: 'btc', time: '2026-11-12T00:00:00.000000000Z', FlowInExNtv: '26241', FlowOutExNtv: '27150' },
      { asset: 'eth', time: '2026-11-13T00:00:00.000000000Z', FlowInExNtv: '1', FlowOutExNtv: '2' },
      { asset: 'btc', time: '2026-11-11T00:00:00.000000000Z', FlowInExNtv: 'x', FlowOutExNtv: '1' },
      { asset: 'btc', time: '2026-11-10T00:00:00.000000000Z', FlowInExNtv: '-5', FlowOutExNtv: '1' },
      null
    ]
  }
  assert.deepEqual(parseCoinMetrics(body, 'BTC'), [
    { date: '2026-11-12', in: 26241, out: 27150 },
    { date: '2026-11-13', in: 26738.3, out: 28867.8, supply: 2720719.5 }
  ])
  assert.equal(parseCoinMetrics(body, 'ETH').length, 1)
  assert.deepEqual(parseCoinMetrics({ error: { type: 'bad_parameter' } }, 'BTC'), [])
  assert.deepEqual(parseCoinMetrics(null, 'BTC'), [])
})

test('net flow is coins in minus coins out', () => {
  assert.equal(netFlow({ in: 10, out: 25 }), -15)
})

test('an unusual day is the largest in its direction over the last 90 days', () => {
  const nets: number[] = Array.from({ length: 100 }, (_, i) => (i % 2 ? 50 : -50))
  nets[95] = 80 // largest inflow so far
  nets[98] = -200 // largest outflow so far
  const odd = unusualDays(series(nets))
  assert.deepEqual(odd.map((u) => [u.day.date, u.net, u.since]), [
    [day(95), 80, null],
    [day(98), -200, null]
  ])
})

test('a tie is no record, and "since" points at the last larger day', () => {
  const nets = Array.from({ length: 200 }, () => 10)
  nets[5] = 500 // old record, outside the 90-day window of day 150
  nets[150] = 300
  nets[160] = 300
  const odd = unusualDays(series(nets)).filter((u) => u.net > 10)
  assert.deepEqual(odd.map((u) => [u.day.date, u.since]), [[day(150), day(5)]])
})

test('no unusual days before 90 days of history', () => {
  const nets = Array.from({ length: 90 }, () => 1)
  nets[60] = 900
  assert.deepEqual(unusualDays(series(nets)), [])
})

test('flows per bar: daily bars one to one, weekly bars summed, holdings of the last day', () => {
  const days = series([10, -20, 30, 0, 0, 0, 0, 5])
  const daily = flowsPerBar(days, days.map((d) => d.date))
  assert.equal(daily.length, 8)
  assert.equal(netFlow(daily[1]!), -20)
  const weekly = flowsPerBar(days, [day(0), day(7)])
  assert.equal(netFlow(weekly[0]!), 20)
  assert.equal(weekly[0]!.supply, 1000 - 6)
  assert.equal(netFlow(weekly[1]!), 5)
  // A week starting before the data would be half filled: nothing. The last bar runs on (it is the current one).
  assert.deepEqual(flowsPerBar(days, [day(-3), day(4)]).map((b) => b && netFlow(b)), [null, 5])
  assert.deepEqual(flowsPerBar(days, ['2025-12-01', '2025-12-02', day(0)]).slice(0, 2), [null, null])
})

test('summary: net of the last n days and the latest holdings', () => {
  const s = flowSummary(series([10, -40, 5]), 2)
  assert.deepEqual(s, { net: -35, days: 2, supply: 998 })
  assert.equal(flowSummary([]), null)
})

test('a bar is unusual only when its unusual day flows the same way as the bar', () => {
  const nets: number[] = Array.from({ length: 102 }, (_, i) => (i % 2 ? 10 : -10))
  nets[20] = 1000 // big inflow within 90 days: the inflows below are no records
  nets[95] = -500 // record outflow …
  for (let i = 96; i < 102; i++) nets[i] = 200 // … in a week that is a net inflow overall
  const days = series(nets)
  assert.deepEqual(unusualDays(days).map((u) => u.day.date), [day(95)])
  const [week] = flowsPerBar(days, [day(95), day(102)])
  assert.deepEqual([netFlow(week!), week!.unusual], [700, false])
  const [alone] = flowsPerBar(days, [day(95), day(96)])
  assert.deepEqual([netFlow(alone!), alone!.unusual], [-500, true])
})
