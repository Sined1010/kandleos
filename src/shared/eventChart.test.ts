import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setLang } from './i18n.ts'
import type { ChartEvent } from './events.ts'
import { candleDates, candleIndex, candleMarks, shortMoney, sinceChange, stackLevels, stemLength } from './eventChart.ts'

const D = 86400
const days = (first: string, n: number, sec = 0) => Array.from({ length: n }, (_, i) => Date.parse(first + 'T00:00:00Z') / 1000 + i * D + sec)
const buy = (o: Partial<ChartEvent> = {}): ChartEvent => ({ id: 'I|2026-08-26|A|buy', kind: 'insider', group: 'insider', level: 3, date: '2026-08-26', side: 'buy', big: true, deal: { source: 'BaFin', person: 'A', side: 'buy', date: '2026-08-26', published: '2026-08-26', volume: 267_450, currency: 'EUR' }, ...o })

test('bar dates: date labels in UTC, session stamps in the exchange zone', () => {
  assert.deepEqual(candleDates(days('2026-08-24', 3), 'America/New_York'), ['2026-08-24', '2026-08-25', '2026-08-26'])
  assert.deepEqual(candleDates(days('2026-08-24', 3, 13.5 * 3600), 'America/New_York'), ['2026-08-24', '2026-08-25', '2026-08-26'])
  assert.deepEqual(candleDates(days('2026-08-24', 2, 2 * 3600), 'America/New_York'), ['2026-08-23', '2026-08-24'])
})
test('an event sits on its day, or on the bar before a day without one', () => {
  const dates = ['2026-08-20', '2026-08-21', '2026-08-24', '2026-08-25'], times = [1, 2, 3, 4]
  const at = (date: string) => candleIndex(dates, times, { date }, false)
  assert.deepEqual([at('2026-08-21'), at('2026-08-22'), at('2026-08-19'), at('2026-09-01')], [1, 1, -1, 3])
  assert.equal(candleIndex(['2026-08-17', '2026-08-24'], [1, 2], { date: '2026-08-19' }, false), 0) // weekly bars: Wednesday → that week
  assert.equal(candleIndex(['2026-08-17', '2026-08-24'], [1, 2], { date: '2026-08-26' }, false), 1)
  const intra = ['2026-08-21', '2026-08-21', '2026-08-24', '2026-08-24']
  assert.equal(candleIndex(intra, [10, 20, 30, 40], { date: '2026-08-24' }, true), 2)
  assert.equal(candleIndex(intra, [10, 20, 30, 40], { date: '2026-08-24', time: 45 }, true), 3)
})
test('marks: direction survives grouping, only deals are marked', () => {
  setLang('de')
  const dates = ['2026-08-25', '2026-08-26'], times = [100, 200]
  assert.deepEqual(candleMarks([buy()], dates, times, false), [{ time: 200, index: 1, side: 'buy', count: 1, big: true, text: '267 T€', ids: ['I|2026-08-26|A|buy'] }])
  const three = [buy(), buy({ id: 'b', big: false }), buy({ id: 'c', big: false })]
  assert.deepEqual(candleMarks(three, dates, times, false).map((m) => [m.side, m.count, m.text, m.big]), [['buy', 3, '3× 802 T€', true]])
  assert.equal(candleMarks([buy(), buy({ id: 's', side: 'sell' })], dates, times, false)[0].side, 'mixed')
  assert.equal(candleMarks([buy({ big: false, inCluster: true })], dates, times, false)[0].big, true)
  for (const kind of ['transfer', 'cluster', 'filing', 'news'] as const) assert.deepEqual(candleMarks([buy({ kind })], dates, times, false), [], kind)
  assert.deepEqual(candleMarks([buy({ date: '2026-08-01' })], dates, times, false), [])
  setLang('en')
})
test('short amounts', () => {
  setLang('de')
  assert.deepEqual([shortMoney(267_450, 'EUR'), shortMoney(2_261_761, 'EUR'), shortMoney(95_331.55, 'USD'), shortMoney(416_000, 'HKD')], ['267 T€', '2,26 Mio €', '95 T$', '416 T HKD'])
  setLang('en')
  assert.equal(shortMoney(267_450, 'EUR'), '267K €')
})
test('price since the deal, only when the deal price fits the bar', () => {
  assert.equal(Math.round(sinceChange(178.3, 175, 181, 214.8)! * 1000), 205)
  assert.equal(sinceChange(183, 175, 181, 214.8) !== undefined, true) // within 2 %
  assert.equal(sinceChange(356.6, 175, 181, 214.8), undefined) // split or other currency
  assert.equal(sinceChange(undefined, 175, 181, 214.8), undefined)
})
test('a bar with several deals in different currencies shows only the count', () => {
  setLang('de')
  const two = [buy(), buy({ id: 'h', deal: { source: 'BaFin', person: 'B', side: 'buy', date: '2026-08-26', published: '2026-08-26', volume: 416_000, currency: 'HKD' } })]
  assert.equal(candleMarks(two, ['2026-08-26'], [100], false)[0].text, '2×')
  setLang('en')
})
test('badges that would touch move one level further out, per side; too many levels become dots', () => {
  const b = (x: number, above = false, w = 60, y = 300) => ({ x, y, w, above, strong: false })
  assert.deepEqual(stackLevels([b(100), b(130), b(300)]), [0, 1, 0])
  assert.deepEqual(stackLevels([b(100), b(130, true)]), [0, 0]) // other side
  assert.deepEqual(stackLevels([b(100), b(130), b(190)]), [0, 1, 0]) // level 0 is free again
  assert.deepEqual(stackLevels([b(130), b(100)]), [1, 0]) // order of the input does not matter
  assert.deepEqual(stackLevels([b(100), b(101), b(102), b(103), b(104)]), [0, 1, 2, 3, -1])
})
test('stem length grows with weight and level', () => {
  assert.deepEqual([stemLength(false, 0), stemLength(true, 0), stemLength(true, 2)], [14, 26, 74])
})
test('badges hanging from candles of different height still do not touch', () => {
  const b = (x: number, y: number, strong = false) => ({ x, y, w: 60, above: false, strong })
  // second candle 10 px higher: its badge would land on the first one's
  assert.deepEqual(stackLevels([b(100, 300, true), b(130, 312)]), [0, 1])
  // far apart in height: both stay close to their candle
  assert.deepEqual(stackLevels([b(100, 300), b(130, 400)]), [0, 0])
})
