import test from 'node:test'
import assert from 'node:assert/strict'
import { forecastSteps, SYMBOL_RE } from './types.ts'

test('forecastSteps: full 64 steps with enough history, shorter for little history and long candles', () => {
  assert.equal(forecastSteps('1h', 1000), 64)
  assert.equal(forecastSteps('1D', 100), 25) // a quarter of the history
  assert.equal(forecastSteps('1M', 550), 60) // five years of monthly candles
  assert.equal(forecastSteps('3M', 180), 20)
  assert.equal(forecastSteps('12M', 46), 5)
})

test('forecastSteps: a chosen length shortens the forecast, but never beyond what the history allows', () => {
  assert.equal(forecastSteps('1h', 1000, 16), 16)
  assert.equal(forecastSteps('1D', 100, 32), 25)
})

test('SYMBOL_RE: tickers, indices, futures and pairs pass; dot names and path parts do not', () => {
  for (const s of ['AAPL', 'BRK-B', 'SAP.DE', '^GSPC', 'GC=F', 'EURUSD=X', 'BTCUSDT']) assert.ok(SYMBOL_RE.test(s), s)
  for (const s of ['.', '..', '-A', '=X', '../KEYS', 'A/B', '']) assert.ok(!SYMBOL_RE.test(s), s)
})
