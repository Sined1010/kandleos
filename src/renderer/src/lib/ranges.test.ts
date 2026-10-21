import test from 'node:test'
import assert from 'node:assert/strict'
import { rangeStartIndex } from './ranges.ts'

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000
// Daily bars from 2024-01-01 to 2026-10-20.
const daily: number[] = []
for (let t = day(2024, 1, 1); t <= day(2026, 10, 20); t += 86400) daily.push(t)

test('12 months start one year before the last bar', () => {
  assert.equal(daily[rangeStartIndex(daily, '1J')], day(2025, 10, 20))
})

test('YTD starts at January 1st of the last bar\'s year', () => {
  assert.equal(daily[rangeStartIndex(daily, 'YTD')], day(2026, 1, 1))
})

test('Max and spans longer than the data start at the first bar', () => {
  assert.equal(rangeStartIndex(daily, 'Max'), 0)
  assert.equal(rangeStartIndex(daily, '5J'), 0)
  assert.equal(rangeStartIndex([], '1J'), 0)
})
