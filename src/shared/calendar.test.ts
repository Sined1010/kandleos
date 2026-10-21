import test from 'node:test'
import assert from 'node:assert/strict'
import { easter, futureTimes, isHoliday, timeZoneForSymbol } from './calendar.ts'

const utc = (m: number, d: number, h = 0, min = 0) => Date.UTC(2026, m - 1, d, h, min) / 1000
const NY = 'America/New_York'
const BERLIN = 'Europe/Berlin'

test('easter', () => {
  assert.deepEqual(easter(2024), [3, 31])
  assert.deepEqual(easter(2026), [4, 5])
  assert.deepEqual(easter(2027), [3, 28])
})

test('exchange holidays incl. weekend observance', () => {
  // NYSE: Thanksgiving, July 4th on a Saturday -> Friday, MLK Day, Good Friday; the day after Thanksgiving trades.
  for (const d of ['2026-11-26', '2026-07-03', '2027-01-18', '2026-04-03']) assert.ok(isHoliday(NY, d), d)
  assert.ok(!isHoliday(NY, '2026-11-27'))
  // XETRA: Christmas Eve, New Year's Eve, Good Friday, Easter Monday; Whit Monday trades.
  for (const d of ['2026-12-24', '2026-12-31', '2026-04-03', '2026-04-06']) assert.ok(isHoliday(BERLIN, d), d)
  assert.ok(!isHoliday(BERLIN, '2026-05-25'))
  // London: Christmas 2027 on a Saturday -> Monday 27th and Tuesday 28th.
  assert.ok(isHoliday('Europe/London', '2027-12-27') && isHoliday('Europe/London', '2027-12-28'))
  // Zurich: Ascension Day; unknown markets have no holidays.
  assert.ok(isHoliday('Europe/Zurich', '2026-05-14'))
  assert.ok(!isHoliday('Asia/Tokyo', '2026-12-25'))
})

test('futureTimes keeps crypto continuous', () => {
  const hours = Array.from({ length: 200 }, (_, i) => utc(10, 1) + i * 3600)
  assert.deepEqual(futureTimes(hours, 3600, 3), [1, 2, 3].map((k) => hours.at(-1)! + k * 3600))
})

test('futureTimes skips weekends for daily stock bars', () => {
  const days = [5, 6, 7, 8, 9, 12, 13, 14, 15, 16].map((d) => utc(10, d, 13, 30)) // Mon-Fri only
  assert.deepEqual(futureTimes(days, 86400, 2), [utc(10, 19, 13, 30), utc(10, 20, 13, 30)]) // Fri -> Mon, Tue
})

const session = [13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5] // 13:30 ... 19:30 UTC hourly bars (EDT 9:30 ... 15:30)
const hourly = (days: number[]) => days.flatMap((d) => session.map((h) => utc(10, d, Math.floor(h), (h % 1) * 60)))

test('futureTimes skips nights and weekends for intraday stock bars', () => {
  assert.deepEqual(futureTimes(hourly([12, 13, 14, 15, 16]), 3600, 2), [utc(10, 19, 13, 30), utc(10, 19, 14, 30)])
})

test('futureTimes continues a live bar stamped with the current time on the session grid', () => {
  const bars = hourly([12, 13, 14, 15, 16])
  bars.splice(-3, 3, utc(10, 16, 17, 48)) // Yahoo: the bar in progress carries "now", the rest of Friday is missing
  assert.deepEqual(futureTimes(bars, 3600, 3), [utc(10, 16, 18, 30), utc(10, 16, 19, 30), utc(10, 19, 13, 30)])
})

test('futureTimes keeps even spacing for gap-free history, even after an off-grid last bar', () => {
  const bars = [utc(10, 12, 13, 30), utc(10, 12, 14, 30), utc(10, 12, 14, 47)]
  assert.deepEqual(futureTimes(bars, 3600, 2), [utc(10, 12, 15, 47), utc(10, 12, 16, 47)])
})

test('futureTimes follows the US DST switch: 9:30 New York is 13:30 UTC before Nov 1, 14:30 after', () => {
  const bars = hourly([26, 27, 28, 29, 30])
  assert.deepEqual(futureTimes(bars, 3600, 2, NY), [utc(11, 2, 14, 30), utc(11, 2, 15, 30)])
})

test('futureTimes skips Thanksgiving for daily US bars', () => {
  const days = [16, 17, 18, 19, 20, 23, 24, 25].map((d) => utc(11, d, 14, 30)) // 9:30 EST
  assert.deepEqual(futureTimes(days, 86400, 2, NY), [utc(11, 27, 14, 30), utc(11, 30, 14, 30)])
})

test('futureTimes dates Finnhub daily bars (00:00 UTC labels) by their UTC date, then skips US holidays', () => {
  const days = [16, 17, 18, 19, 20, 23, 24, 25].map((d) => utc(11, d)) // Finnhub: midnight UTC, Mon-Wed
  assert.deepEqual(futureTimes(days, 86400, 3, NY), [utc(11, 27), utc(11, 30), utc(12, 1)]) // skips Thanksgiving
})

test('timeZoneForSymbol maps market suffixes, US tickers and futures', () => {
  assert.equal(timeZoneForSymbol('SIE.DE'), BERLIN)
  assert.equal(timeZoneForSymbol('VOD.L'), 'Europe/London')
  assert.equal(timeZoneForSymbol('AAPL'), NY)
  assert.equal(timeZoneForSymbol('GC=F'), NY)
  assert.equal(timeZoneForSymbol('^GDAXI'), undefined)
  assert.equal(timeZoneForSymbol('XYZ.QQ'), undefined)
})

test('futureTimes skips the XETRA Christmas and New Year closures', () => {
  const days = [14, 15, 16, 17, 18, 21, 22, 23].map((d) => utc(12, d, 8)) // 9:00 CET
  const jan4 = Date.UTC(2027, 0, 4, 8) / 1000
  assert.deepEqual(futureTimes(days, 86400, 4, BERLIN), [utc(12, 28, 8), utc(12, 29, 8), utc(12, 30, 8), jan4])
})

test('futureTimes steps month-based bars by calendar periods, not 30-day blocks', () => {
  // Binance/Finnhub monthly bars at 00:00 UTC on the 1st: the months after October 2026.
  const months = [utc(8, 1), utc(9, 1), utc(10, 1)]
  assert.deepEqual(futureTimes(months, 2592000, 4, 'UTC', 1), [utc(11, 1), utc(12, 1), Date.UTC(2027, 0, 1) / 1000, Date.UTC(2027, 1, 1) / 1000])
  // Quarters and years continue at the start of the next period.
  assert.deepEqual(futureTimes([utc(4, 1), utc(7, 1), utc(10, 1)], 7776000, 2, 'UTC', 3), [Date.UTC(2027, 0, 1) / 1000, Date.UTC(2027, 3, 1) / 1000])
  assert.deepEqual(futureTimes([Date.UTC(2025, 0, 1) / 1000, utc(1, 1)], 31104000, 1, 'UTC', 12), [Date.UTC(2027, 0, 1) / 1000])
})

test('futureTimes dates Yahoo monthly bars at midnight in the exchange zone, across the DST switch', () => {
  // Yahoo: 00:00 New York on the 1st (EDT: 04:00 UTC), the live bar stamped "now".
  const bars = [utc(8, 1, 4), utc(9, 1, 4), utc(10, 1, 4), utc(10, 20, 20)]
  assert.deepEqual(futureTimes(bars, 2592000, 2, NY, 1), [utc(11, 1, 4), utc(12, 1, 5)]) // December is EST
  // XETRA: 00:00 Berlin is 22:00 UTC the evening before in summer, 23:00 in winter.
  const xetra = [utc(7, 31, 22), utc(8, 31, 22), utc(9, 30, 22)]
  assert.deepEqual(futureTimes(xetra, 2592000, 2, BERLIN, 1), [utc(10, 31, 23), utc(11, 30, 23)])
})
