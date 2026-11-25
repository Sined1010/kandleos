import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Candle } from './types.ts'
import { barsKey, currentPatterns, findPatterns, framePieces, lookBack, patternGroup, regularBars, trendAt, verdictOf, type PatternHit, type PatternId } from './patterns.ts'

const bar = (open: number, high: number, low: number, close: number): Candle => ({ time: 0, open, high, low, close, volume: 1 })
/** n falling bars that match no pattern themselves (each opens below the last body); the last closes at 99. */
const down = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const k = 2 * (n - 1 - i)
    return bar(100 + k, 100.5 + k, 98.5 + k, 99 + k)
  })
/** n rising bars, mirrored; the last closes at 101. */
const up = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const k = 2 * (n - 1 - i)
    return bar(100 - k, 101.5 - k, 99.5 - k, 101 - k)
  })
const timed = (c: Candle[]) => c.map((b, i) => ({ ...b, time: i }))
const found = (c: Candle[]) => findPatterns(timed(c), c.length - 1)
const has = (c: Candle[], id: PatternId) => found(c).some((h) => h.id === id && h.end === c.length - 1)

test('the helper trends match no pattern', () => {
  assert.deepEqual(found(down(8)), [])
  assert.deepEqual(found(up(8)), [])
})

test('trend before: close against the close 5 bars earlier', () => {
  const c = down(8)
  assert.equal(trendAt(c, 7), 'down')
  assert.equal(trendAt(up(8), 7), 'up')
  assert.equal(trendAt(c, 4), null)
})

test('hammer after a decline is found, the same bar after a rise is not', () => {
  const h = bar(98, 101, 90, 100.8)
  assert.deepEqual(
    found([...down(6), h]).filter((x) => x.id === 'hammer'),
    [{ id: 'hammer', start: 6, end: 6, dir: 'up' }]
  )
  assert.equal(has([...up(6), h], 'hammer'), false)
  assert.equal(has([...down(6), bar(98, 104, 90, 100.8)], 'hammer'), false)
})

test('shooting star after a rise', () => {
  const s = bar(102, 110, 99, 99.2)
  assert.equal(has([...up(6), s], 'shootingStar'), true)
  assert.equal(has([...down(6), s], 'shootingStar'), false)
})

test('bullish engulfing needs a bigger body', () => {
  const a = bar(99, 99.5, 97, 97.5)
  assert.equal(has([...down(6), a, bar(97.2, 100.5, 97, 100)], 'bullEngulfing'), true)
  assert.equal(has([...down(6), a, bar(97.5, 99.2, 97.4, 99)], 'bullEngulfing'), false)
})

test('bearish engulfing after a rise only', () => {
  const pair = [bar(101, 103, 100.8, 102.5), bar(102.8, 103, 99.5, 100)]
  assert.equal(has([...up(6), ...pair], 'bearEngulfing'), true)
  assert.equal(has([...down(6), ...pair], 'bearEngulfing'), false)
})

test('bullish harami: small body inside a big one', () => {
  const a = bar(99, 99.2, 94.8, 95)
  assert.equal(has([...down(6), a, bar(96, 97.2, 95.8, 97)], 'bullHarami'), true)
  assert.equal(has([...down(6), a, bar(95.5, 98.2, 95.3, 98)], 'bullHarami'), false)
})

test('bearish harami after a rise only', () => {
  const pair = [bar(101, 105.2, 100.8, 105), bar(104, 104.2, 102.8, 103)]
  assert.equal(has([...up(6), ...pair], 'bearHarami'), true)
  assert.equal(has([...down(6), ...pair], 'bearHarami'), false)
})

test('morning star needs no gap, but the third bar must close past the middle of the first', () => {
  const a = bar(99, 99.2, 94.8, 95)
  const b = bar(94.8, 95.2, 94, 94.5)
  assert.equal(has([...down(6), a, b, bar(95, 98.2, 94.9, 98)], 'morningStar'), true)
  assert.equal(has([...down(6), a, b, bar(95, 96.7, 94.9, 96.5)], 'morningStar'), false)
})

test('evening star after a rise only', () => {
  const three = [bar(101, 105.2, 100.8, 105), bar(105.2, 106, 104.8, 105.5), bar(105, 105.1, 101.8, 102)]
  assert.equal(has([...up(6), ...three], 'eveningStar'), true)
  assert.equal(has([...down(6), ...three], 'eveningStar'), false)
})

test('doji points against the trend before', () => {
  const d = bar(99, 100, 98, 99.05)
  assert.equal(found([...down(6), d]).find((h) => h.id === 'doji')?.dir, 'up')
  assert.equal(found([...up(6), d]).find((h) => h.id === 'doji')?.dir, 'down')
  assert.equal(has([...down(6), bar(99, 100, 98, 99.5)], 'doji'), false)
})

test('three white soldiers open inside the body before', () => {
  const a = bar(98.5, 100.2, 98.4, 100)
  const b = bar(99.5, 101.7, 99.4, 101.5)
  assert.equal(has([...down(6), a, b, bar(101, 103.2, 100.9, 103)], 'threeSoldiers'), true)
  assert.equal(has([...down(6), a, b, bar(102, 103.2, 101.9, 103)], 'threeSoldiers'), false)
})

test('three black crows after a rise only', () => {
  const three = [bar(101.5, 101.6, 99.8, 100), bar(100.5, 100.6, 98.3, 98.5), bar(99, 99.1, 96.8, 97)]
  assert.equal(has([...up(6), ...three], 'threeCrows'), true)
  assert.equal(has([...down(6), ...three], 'threeCrows'), false)
})

test('flat bars never match', () => {
  assert.deepEqual(found(Array.from({ length: 12 }, () => bar(100, 100, 100, 100))), [])
})

test('too few bars', () => {
  assert.deepEqual(found(down(4)), [])
})

test('only finished bars count', () => {
  const c = timed([...down(6), bar(98, 101, 90, 100.8)])
  assert.equal(findPatterns(c, 5).some((h) => h.id === 'hammer'), false)
  const hits: PatternHit[] = [8, 9, 10, 11].map((end) => ({ id: 'doji', start: end, end, dir: 'up' }))
  assert.deepEqual(
    currentPatterns(hits, 11).map((h) => h.end),
    [9, 10, 11]
  )
})

// Closes 100 → 85 falling by 1 (bars 0–15), then 90 (bars 16–20): from bar 6 on every bar follows a decline; a bar k
// was right ("up") when close[k+5] > close[k], i.e. k = 11…15.
const slope = () => timed(Array.from({ length: 21 }, (_, i) => (i <= 15 ? 100 - i : 90)).map((c) => bar(c, c, c, c)))
const hammerAt = (end: number): PatternHit => ({ id: 'hammer', start: end, end, dir: 'up' })

test('look-back counts a case only with 5 finished bars after it, thins overlaps and leaves them out of the base', () => {
  // 6 counts (wrong), 11 counts (right, 5 after 6), 13 is thinned (2 after 11), 16 has no 5 bars after it; the doji
  // does not touch the hammer's base. Base k = 6…15 without 6, 11, 13 → 7, 8, 9, 10, 12, 14, 15, of which 12, 14, 15 right.
  const hits = [hammerAt(6), { id: 'doji', start: 8, end: 8, dir: 'up' } as PatternHit, hammerAt(11), hammerAt(13), hammerAt(16)]
  assert.deepEqual(lookBack(slope(), hits, 'hammer', 20), { n: 2, hit: 0.5, base: 3 / 7, verdict: 'rare' })
})

test('doji compares with every bar after a trend, counting turns against it', () => {
  assert.deepEqual(lookBack(slope(), [], 'doji', 20), { n: 0, hit: 0, base: 0.5, verdict: 'rare' })
})

test('verdict: rare under 10 cases, else only a clear distance counts', () => {
  assert.equal(verdictOf(9, 1, 0.5), 'rare')
  assert.equal(verdictOf(12, 10 / 12, 0.5), 'better')
  assert.equal(verdictOf(12, 7 / 12, 0.5), 'none')
  assert.equal(verdictOf(20, 0, 0.5), 'worse')
})

test('verdict with a base of 0 % does not divide by zero', () => {
  assert.equal(verdictOf(10, 0.3, 0), 'better')
  assert.equal(verdictOf(10, 0, 0), 'none')
})

test('regular bars skip shaded pre/post bars, a missing schedule keeps all', () => {
  const c = timed([bar(1, 1, 1, 1), bar(1, 1, 1, 1), bar(1, 1, 1, 1), bar(1, 1, 1, 1)])
  const phases = ['pre', 'open', 'post', null]
  const phase = (t: number) => phases[t]
  assert.deepEqual(regularBars(c, phase, true, true), [1, 3])
  assert.deepEqual(regularBars(c, phase, false, true), [0, 1, 2, 3])
  assert.deepEqual(regularBars(c, phase, true, false), [0, 1, 2, 3])
})

test('engulfing needs real bodies, a doji is not engulfed', () => {
  // a is a doji (body 0.05 of a range of 2); b is bigger but its body is still under 10 % of its range
  assert.equal(has([...down(6), bar(97.5, 98.5, 96.5, 97.45), bar(97.4, 100, 95, 97.6)], 'bullEngulfing'), false)
  assert.equal(has([...up(6), bar(101.5, 102.5, 100.5, 101.55), bar(101.6, 104, 99, 101.4)], 'bearEngulfing'), false)
})

test('bars key changes with the bars, not only with their count and last time', () => {
  const a = timed(down(8))
  const b = a.map((x) => ({ ...x, close: x.close * 2, open: x.open * 2 }))
  assert.notEqual(barsKey(a, true), barsKey(b, true))
  assert.equal(barsKey(a, true), barsKey(a.map((x) => ({ ...x })), true))
})

test('one group for the current patterns: span, the pattern bars high and low, each pattern once', () => {
  const c = timed([...down(6), bar(99, 100, 98, 99.05), bar(99, 100.5, 97.5, 99.02), bar(99, 99.5, 98.8, 99.4)])
  const hits: PatternHit[] = [
    { id: 'doji', start: 6, end: 6, dir: 'up' },
    { id: 'doji', start: 7, end: 7, dir: 'up' }
  ]
  const g = patternGroup(c, hits)!
  assert.deepEqual([g.from, g.to, g.hi, g.lo], [6, 7, 100.5, 97.5])
  assert.deepEqual(g.hits.map((h) => h.end), [7])
  assert.equal(patternGroup(c, []), null)
})

test('a doji counts only on a candle at least as long as the ones before on average', () => {
  // the trend bars are 2 long; a quiet doji of 0.6 means nothing, one of 2 or more does
  assert.equal(has([...down(6), bar(99, 99.4, 98.8, 99.02)], 'doji'), false)
  assert.equal(has([...down(6), bar(99, 100, 98, 99.05)], 'doji'), true)
})

test('frame pieces: one per run of chart bars without shaded bars between', () => {
  // regular bars sit at chart indices 0,1,2 then (night) 7,8: a pattern over regular 1…3 spans chart 1–2 and 7
  assert.deepEqual(framePieces([0, 1, 2, 7, 8], 1, 3), [[1, 2], [7, 7]])
  assert.deepEqual(framePieces([0, 1, 2, 3], 1, 3), [[1, 3]])
})

test('look-back of a two-bar pattern measures the trend before its first bar', () => {
  // falling closes 100 → 85, then 90: trendAt(k−2) is "down" for k ≥ 7; right ("up") for k = 11…15
  const hits: PatternHit[] = [{ id: 'bullEngulfing', start: 10, end: 11, dir: 'up' }]
  // base k = 7…15 without 11 → 8 bars, of which 12…15 right
  assert.deepEqual(lookBack(slope(), hits, 'bullEngulfing', 20), { n: 1, hit: 1, base: 4 / 8, verdict: 'rare' })
})
