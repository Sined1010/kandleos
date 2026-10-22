import test from 'node:test'
import assert from 'node:assert/strict'
import { forecastSteps } from './types.ts'

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
