import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planAlarm } from './alarmPlan.ts'
import type { Alarm } from '../shared/alarms.ts'

const a = (symbol: string): Alarm => ({ id: 'x', symbol, op: 'above', price: 1, createdAt: 0 })
const alpaca = { stockSource: 'alpaca' as const, yahooExtra: false, alpacaKeys: true }

test('crypto alarms are checked at Binance', () => {
  assert.deepEqual(planAlarm(a('BTCUSDT'), { stockSource: 'none', yahooExtra: false, alpacaKeys: false }), { source: 'binance', providerSymbol: 'BTCUSDT' })
})

test('US stocks go to Alpaca when it has keys, else they cannot be checked', () => {
  assert.deepEqual(planAlarm(a('AAPL'), alpaca), { source: 'alpaca', providerSymbol: 'AAPL' })
  assert.deepEqual(planAlarm(a('AAPL'), { ...alpaca, alpacaKeys: false }), { skip: 'source' })
})

test('with the Yahoo extra, what Alpaca lacks goes to Yahoo', () => {
  assert.deepEqual(planAlarm(a('SAP.DE'), { ...alpaca, yahooExtra: true }), { source: 'yahoo', providerSymbol: 'SAP.DE' })
})

test('Alpaca writes share classes with a dot', () => {
  assert.deepEqual(planAlarm(a('BRK-B'), alpaca), { source: 'alpaca', providerSymbol: 'BRK.B' })
})

test('stocks switched off: a stock alarm cannot be checked', () => {
  assert.deepEqual(planAlarm(a('AAPL'), { stockSource: 'none', yahooExtra: false, alpacaKeys: false }), { skip: 'source' })
  assert.deepEqual(planAlarm(a('AAPL'), { stockSource: 'yahoo', yahooExtra: false, alpacaKeys: false }), { source: 'yahoo', providerSymbol: 'AAPL' })
})
