import test from 'node:test'
import assert from 'node:assert/strict'
import { chronosBlock, chronosOrSkip, compareWithChronos, parseChronos, readWeighting, type ChronosSnapshot } from './chronosLink.ts'
import { QUANTILES } from './forecast.ts'

// Median 100; 50 % range 90..110, 80 % range 84..116, 90 % range 82..118.
const end = QUANTILES.map((l) => 100 * (1 + (l - 0.5) * 0.4))
const snap = (over: Partial<ChronosSnapshot> = {}): ChronosSnapshot => ({
  pair: 'BTCUSDT',
  asOf: Date.UTC(2026, 10, 4) / 1000,
  base: 90,
  steps: 64,
  end,
  factor: null,
  check: { runs: 30, inside80: 0.74, skill: -0.09, chance: [{ from: 0, to: 0.4, cases: 6, said: 0.32, rose: 0.5 }, { from: 0.4, to: 0.6, cases: 18, said: 0.5, rose: 0.55 }, { from: 0.6, to: 1, cases: 6, said: 0.68, rose: 0.5 }] },
  record: null,
  block: '',
  appVersion: '0.4.0',
  ...over
})

test('chronosBlock frames the forecast honestly and asks for the weighting line', () => {
  const b = chronosBlock(snap())
  for (const part of ['past closes only', 'BTCUSDT', '30 backtests', 'less accurate', 'none yet', 'CHRONOS-2 WEIGHTING: LOW|MEDIUM|HIGH', 'keep this line in English'])
    assert.ok(b.includes(part), part)
  assert.ok(b.length <= 4000, `length ${b.length}`)
  assert.ok(chronosBlock(snap({ check: null })).includes('no backtest'))
  assert.ok(chronosBlock(snap({ record: { settled: 12, independent: 3, inside80: 0.7 } })).includes('3 independent'))
  assert.ok(chronosBlock(snap({ factor: 1.2 })).includes('calibrated'))
})

test('readWeighting takes the last weighting line anywhere in the report', () => {
  assert.deepEqual(readWeighting('Text\n\n**CHRONOS-2 WEIGHTING:** low – weak record\n'), { level: 'low', reason: 'weak record' })
  const twice = 'CHRONOS-2 WEIGHTING: HIGH – first\n...\nCHRONOS-2 WEIGHTING: medium - second\n\n| Indicator | Value |\n|---|---|\n| RSI | 55 |'
  assert.deepEqual(readWeighting(twice), { level: 'medium', reason: 'second' })
  assert.deepEqual(readWeighting('Chronos-2-Gewichtung: HOCH: passt zum Trend'), { level: 'high', reason: 'passt zum Trend' })
  assert.equal(readWeighting(''), null)
  assert.equal(readWeighting('Chronos-2 sieht keine Richtung.'), null)
})

test('parseChronos accepts a snapshot or a skip and drops anything malformed', () => {
  const s = snap({ block: chronosBlock(snap()) })
  assert.deepEqual(parseChronos(s), s)
  assert.deepEqual(parseChronos({ skipped: 'history' }), { skipped: 'history' })
  assert.equal(parseChronos({ skipped: 'other' }), undefined)
  assert.equal(parseChronos({ ...s, end: end.slice(1) }), undefined)
  assert.equal(parseChronos({ ...s, block: 'x'.repeat(4001) }), undefined)
  assert.equal(parseChronos({ ...s, pair: '..' }), undefined)
  assert.equal(parseChronos({ ...s, factor: 50 }), undefined)
  assert.equal(parseChronos(undefined), undefined)
})

test('chronosOrSkip turns an unusable snapshot into "without Chronos" instead of rejecting the analysis', () => {
  const s = snap({ block: 'x' })
  assert.deepEqual(chronosOrSkip(s), s)
  // A crashed asset: the model's lowest quantile below zero; a stale listing: calibration factor 12.
  assert.deepEqual(chronosOrSkip({ ...s, end: [-1, ...end.slice(1)] }), { skipped: 'model' })
  assert.deepEqual(chronosOrSkip({ ...s, factor: 12 }), { skipped: 'model' })
  assert.deepEqual(chronosOrSkip({ skipped: 'history' }), { skipped: 'history' })
})

test('compareWithChronos matches the rating with the direction and places target and stop', () => {
  // Base 90 below the median 100: chance of a higher close 75 %, so Chronos says up.
  const s = snap()
  assert.equal(compareWithChronos(s, { rating: 'Buy', priceTarget: null, stopLoss: null }).direction, 'agree')
  assert.equal(compareWithChronos(s, { rating: 'Sell', priceTarget: null, stopLoss: null }).direction, 'contradict')
  assert.equal(compareWithChronos(s, { rating: 'Hold', priceTarget: null, stopLoss: null }).direction, 'neutral')
  const zone = (t: number) => compareWithChronos(s, { rating: 'Buy', priceTarget: t, stopLoss: null }).target?.zone
  assert.equal(zone(101), 'in50')
  assert.equal(zone(115), 'in80')
  assert.equal(zone(117), 'in90')
  assert.equal(zone(200), 'above')
  assert.equal(zone(50), 'below')
  const c = compareWithChronos(s, { rating: 'Buy', priceTarget: null, stopLoss: 84 })
  assert.equal(c.target, null)
  assert.ok(c.stop && Math.abs(c.stop.below - 0.1) < 1e-9)
  assert.equal(compareWithChronos(s, { rating: null, priceTarget: null, stopLoss: null }).stop, null)
})
