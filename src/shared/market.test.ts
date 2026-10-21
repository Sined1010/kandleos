import test from 'node:test'
import assert from 'node:assert/strict'
import { marketStatus } from './market.ts'

const utc = (m: number, d: number, h = 0, min = 0) => Date.UTC(2026, m - 1, d, h, min) / 1000
const NY = 'America/New_York'

test('NYSE: pre-market, regular session and after-hours in New York time (EDT = UTC-4)', () => {
  // Tuesday 2026-10-20
  assert.deepEqual(marketStatus('AAPL', NY, utc(10, 20, 12)), {
    phase: 'pre',
    holiday: false,
    next: { time: utc(10, 20, 13, 30), phase: 'open' }
  })
  assert.deepEqual(marketStatus('AAPL', NY, utc(10, 20, 15))?.next, { time: utc(10, 20, 20), phase: 'post' })
  assert.deepEqual(marketStatus('AAPL', NY, utc(10, 21, 1))?.next, { time: utc(10, 21, 8), phase: 'pre' })
})

test('NYSE: weekend and Thanksgiving are closed, the day after closes at 13:00', () => {
  // Saturday -> pre-market on Monday 04:00 New York
  assert.deepEqual(marketStatus('AAPL', NY, utc(10, 24, 15)), {
    phase: 'closed',
    holiday: false,
    next: { time: utc(10, 26, 8), phase: 'pre' }
  })
  // Thanksgiving 2026-11-26 (EST = UTC-5)
  assert.equal(marketStatus('AAPL', NY, utc(11, 26, 16))?.holiday, true)
  // Black Friday: regular session ends 13:00 New York = 18:00 UTC
  assert.deepEqual(marketStatus('AAPL', NY, utc(11, 27, 16))?.next, { time: utc(11, 27, 18), phase: 'post' })
})

test('Tokyo has a lunch break; XETRA closes at 17:30, the Frankfurt floor trades until 22:00', () => {
  // 11:45 Tokyo = 02:45 UTC
  assert.deepEqual(marketStatus('7203.T', 'Asia/Tokyo', utc(10, 20, 2, 45))?.phase, 'break')
  // 18:00 Berlin (CEST = UTC+2)
  assert.equal(marketStatus('SAP.DE', 'Europe/Berlin', utc(10, 20, 16))?.phase, 'closed')
  assert.deepEqual(marketStatus('SAP.F', 'Europe/Berlin', utc(10, 20, 16)), {
    phase: 'open',
    holiday: false,
    next: { time: utc(10, 20, 20), phase: 'closed' }
  })
})

test('futures pause daily 17:00-18:00 New York; crypto never closes; unknown exchanges give no status', () => {
  assert.equal(marketStatus('GC=F', NY, utc(10, 20, 21, 30))?.phase, 'break')
  assert.deepEqual(marketStatus('GC=F', NY, utc(10, 24, 12))?.next, { time: utc(10, 25, 22), phase: 'open' })
  assert.deepEqual(marketStatus('BTCUSDT', undefined), { phase: 'open' })
  assert.equal(marketStatus('ABC.XY', 'Africa/Lagos'), null)
  assert.equal(marketStatus('^XYZ', undefined), null)
})
