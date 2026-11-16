import test from 'node:test'
import assert from 'node:assert/strict'
import { adx, anchoredVwap, anchorIndex, lastBarRunning, atr, bollinger, ema, macd, rsi, sma, squeeze, stochastic, supertrend, volumeProfile, vwap } from './indicators.ts'

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)
const bar = (time: number, high: number, low: number, c: number, volume = 1) => ({
  time,
  open: c,
  high,
  low,
  close: c,
  volume
})

test('sma skips leading NaN', () => {
  assert.deepEqual(sma([NaN, 2, 4, 6], 2), [NaN, NaN, 3, 5])
})

test('atr seeds with the mean true range, then smooths (Wilder)', () => {
  const c = [bar(0, 10, 8, 9), bar(1, 11, 9, 10), bar(2, 14, 10, 13)]
  const a = atr(c, 2)
  close(a[1], (2 + 2) / 2)
  close(a[2], (2 * 1 + 4) / 2) // TR = max(4, |14-10|, |10-10|) = 4
})

test('stochastic is 100 at the top of the range and 0 at the bottom', () => {
  const rising = Array.from({ length: 10 }, (_, i) => bar(i, i + 1, i, i + 1))
  assert.equal(stochastic(rising, 3, 1, 1).k[9], 100)
  const falling = Array.from({ length: 10 }, (_, i) => bar(i, 20 - i, 19 - i, 19 - i))
  assert.equal(stochastic(falling, 3, 1, 1).k[9], 0)
})

test('vwap weights by volume and restarts each UTC day', () => {
  const v = vwap([bar(0, 12, 6, 9, 1), bar(60, 15, 9, 12, 3), bar(86400, 30, 30, 30, 5)])
  close(v[1], (9 * 1 + 12 * 3) / 4)
  close(v[2], 30)
})

test('supertrend follows the trend side', () => {
  const up = Array.from({ length: 30 }, (_, i) => bar(i, 100 + i + 1, 100 + i - 1, 100 + i))
  const s = supertrend(up, 5, 2)
  assert.ok(s.value[29] < up[29].close && s.rising[29])
  const down = Array.from({ length: 30 }, (_, i) => bar(i, 200 - i + 1, 200 - i - 1, 200 - i))
  const t = supertrend(down, 5, 2)
  assert.ok(t.value[29] > down[29].close && !t.rising[29])
})

test('sma', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [NaN, NaN, 2, 3, 4])
})

test('ema seeds with sma and skips leading NaN', () => {
  const out = ema([NaN, 1, 2, 3, 4], 2)
  assert.ok(Number.isNaN(out[1]))
  close(out[2], 1.5)
  close(out[3], 3 * (2 / 3) + 1.5 / 3)
})

test('bollinger on a flat series has zero width', () => {
  const { mid, upper, lower } = bollinger([5, 5, 5, 5], 2, 2)
  assert.deepEqual([mid[3], upper[3], lower[3]], [5, 5, 5])
})

test('rsi is 100 for a rising series and 0 for a falling one', () => {
  assert.equal(rsi([1, 2, 3, 4, 5], 3)[4], 100)
  assert.equal(rsi([5, 4, 3, 2, 1], 3)[4], 0)
})

test('macd histogram is line minus signal', () => {
  const v = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5)
  const m = macd(v, 12, 26, 9)
  close(m.hist[59], m.line[59] - m.signal[59])
  assert.ok(Number.isNaN(m.signal[24]))
})

// Bars for the newer indicators: time counts up on its own.
let clock = 0
const b = (high: number, low: number, c: number, volume = 1) => bar(clock++, high, low, c, volume)

test('adx is near 100 in a clean uptrend and low in a sideways zigzag', () => {
  const up = Array.from({ length: 60 }, (_, i) => b(i + 1, i, i + 0.5))
  const a = adx(up, 14)
  assert.ok(Number.isNaN(a[0]))
  close(a.at(-1)!, 100)
  const zig = Array.from({ length: 80 }, (_, i) => (i % 2 ? b(11, 9, 10) : b(10.5, 8.5, 9.5)))
  assert.ok(adx(zig, 14).at(-1)! < 20)
})

test('squeeze: tight range is on, the first bar after it is released', () => {
  const flat = Array.from({ length: 40 }, () => b(101, 99, 100))
  const jump = [130, 160, 190].map((x) => b(x + 1, x - 1, x))
  const s = squeeze([...flat, ...jump], 20, 2, 1.5, false)
  assert.equal(s.on[30], true)
  assert.equal(s.on[19], false) // the first `period` bars are not judged
  const first = s.on.indexOf(false, 20)
  assert.equal(first, 40)
  assert.equal(s.released[first], true)
  assert.equal(s.released.filter(Boolean).length, 1)
})

test('squeeze leaves the last bar unjudged only while it is still running', () => {
  const flat = Array.from({ length: 30 }, () => b(101, 99, 100))
  const running = squeeze([...flat.slice(0, 29), b(131, 129, 130)], 20, 2, 1.5, true)
  assert.equal(running.on.at(-1), false)
  assert.equal(running.released.at(-1), false) // no dot on the live candle
  assert.equal(squeeze(flat, 20, 2, 1.5, true).on.at(-1), false)
  assert.equal(squeeze(flat, 20, 2, 1.5, false).on.at(-1), true)
})

test('squeeze of a bar does not depend on how much history is loaded before it', () => {
  const c = Array.from({ length: 300 }, (_, i) => {
    const m = 100 + Math.sin(i / 7) * 5
    return b(m + 1, m - 1, m)
  })
  const all = squeeze(c, 20, 2, 1.5, false).on
  const cut = squeeze(c.slice(150), 20, 2, 1.5, false).on
  assert.ok(all.includes(true) && all.slice(20).includes(false))
  for (let j = 20; j < cut.length; j++) assert.equal(cut[j], all[j + 150], `bar ${j + 150}`)
})

test('anchoredVwap weights the typical price by volume from the anchor', () => {
  const c = [b(12, 8, 10, 5), b(12, 8, 10, 1), b(22, 18, 20, 3)]
  assert.deepEqual(anchoredVwap(c, 1).map((v) => (Number.isNaN(v) ? null : v)), [null, 10, 17.5])
  assert.ok(anchoredVwap([b(12, 8, 10, 0)], 0).every(Number.isNaN))
})

test('volumeProfile finds the POC and grows the value area to 70 %', () => {
  const p = volumeProfile([b(10, 0, 5, 10), b(5, 4, 4.5, 50)], 10)!
  assert.equal(p.low, 0)
  assert.equal(p.step, 1)
  assert.equal(p.poc, 4)
  assert.deepEqual([p.vaLow, p.vaHigh], [4, 4]) // 51 of 60 already ≥ 70 %
  const dot = volumeProfile([b(10, 0, 5, 10), b(3, 3, 3, 7)], 10)! // high = low: all its volume in its row
  assert.equal(dot.rows[3], 1 + 7)
  const top = volumeProfile([b(10, 0, 5, 10), b(10, 10, 10, 4)], 10)! // a bar at the very top lands in the last row
  assert.equal(top.rows[9], 1 + 4)
  assert.equal(volumeProfile([b(10, 0, 5, 0)], 10), null)
  assert.equal(volumeProfile([], 10), null)
})

test('anchorIndex finds the candle holding a time', () => {
  const times = [100, 200, 300]
  assert.equal(anchorIndex(times, 250, 100), 1)
  assert.equal(anchorIndex(times, 100, 100), 0)
  assert.equal(anchorIndex(times, 50, 100), 'before')
  assert.equal(anchorIndex(times, 400, 100), 'after')
  assert.equal(anchorIndex(times, 399, 100), 2)
  assert.equal(anchorIndex([], 1, 100), 'after')
})

test('anchorIndex moves an anchor in a gap between bars to the next bar', () => {
  // Hourly bars 9:00–11:00, then the next day; a daily anchor at midnight lies in the overnight gap.
  const times = [9, 10, 11, 33].map((h) => h * 3600)
  assert.equal(anchorIndex(times, 24 * 3600, 3600), 3)
  assert.equal(anchorIndex(times, 10.5 * 3600, 3600), 1) // inside a bar stays there
  // Month bars have uneven lengths: no gap rule, the 31st stays in its month.
  const months = [0, 31, 59].map((d) => d * 86400)
  assert.equal(anchorIndex(months, 30.5 * 86400, 30 * 86400, false), 0)
})

test('lastBarRunning: a finished bar stays finished at the opening bell until the new bar starts', () => {
  const h = 3600
  // Market open, but the last hourly bar is from yesterday: finished.
  assert.equal(lastBarRunning({ step: h, phase: 'open', extended: false, lastTime: 0, now: 20 * h }), false)
  // Market open and the bar's hour is not over: running.
  assert.equal(lastBarRunning({ step: h, phase: 'open', extended: false, lastTime: 0, now: 0.5 * h }), true)
  // Market closed: finished.
  assert.equal(lastBarRunning({ step: h, phase: 'closed', extended: false, lastTime: 0, now: 0.5 * h }), false)
  // Pre-market counts only with pre/after-market bars shown.
  assert.equal(lastBarRunning({ step: h, phase: 'pre', extended: true, lastTime: 0, now: 0.5 * h }), true)
  assert.equal(lastBarRunning({ step: h, phase: 'pre', extended: false, lastTime: 0, now: 0.5 * h }), false)
  // A day bar goes on through a lunch break, but yesterday's day bar is done.
  assert.equal(lastBarRunning({ step: 86400, phase: 'break', extended: false, lastTime: 0, now: 0.5 * 86400 }), true)
  assert.equal(lastBarRunning({ step: 86400, phase: 'open', extended: false, lastTime: 0, now: 1.5 * 86400 }), false)
  // Week and month bars always run on; unknown trading hours count as running.
  assert.equal(lastBarRunning({ step: 7 * 86400, phase: 'closed', extended: false, lastTime: 0, now: 86400 }), true)
  assert.equal(lastBarRunning({ step: h, phase: null, extended: false, lastTime: 0, now: 0.5 * h }), true)
})

test('lastBarRunning follows the live candle: running while a tick would still fold into the last bar', () => {
  const day = 86400
  const h = 3600
  // Yahoo's live day bar stamped yesterday 16:00: at 09:31 a tick opens today's bar, so yesterday's is finished.
  assert.equal(lastBarRunning({ step: day, phase: 'open', extended: false, lastTime: day + 16 * h, now: 2 * day + 9.5 * h, zone: 'UTC' }), false)
  // Today's bar, stamped at the open, runs until the date changes.
  assert.equal(lastBarRunning({ step: day, phase: 'open', extended: false, lastTime: 2 * day + 9.5 * h, now: 2 * day + 15 * h, zone: 'UTC' }), true)
  // Two days old: a tick now would open a new bar.
  assert.equal(lastBarRunning({ step: day, phase: 'open', extended: false, lastTime: 0, now: 2 * day + 9.5 * h, zone: 'UTC' }), false)
  // Delayed quotes (Yahoo: often 15 min) still land in an hourly bar shortly after its hour.
  assert.equal(lastBarRunning({ step: h, phase: 'open', extended: false, lastTime: 0, now: h + 10 * 60 }), true)
  assert.equal(lastBarRunning({ step: h, phase: 'open', extended: false, lastTime: 0, now: h + 25 * 60 }), false)
})
