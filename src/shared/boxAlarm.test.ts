import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armBox, boxOp, pairWinner, partnerOf, scanBox, settlePairs } from './boxAlarm.ts'
import type { Alarm } from './alarms.ts'
import type { BoxDrawing } from '../renderer/src/lib/positionBox.ts'

const box = (type: 'long' | 'short', entry: number, target: number, stop: number): BoxDrawing => ({
  id: 'b',
  type,
  points: [
    { time: 100, price: entry },
    { time: 100, price: target },
    { time: 100, price: stop },
    { time: 9000, price: entry }
  ]
})
const base = (part: string, over: Partial<Alarm> = {}): Alarm => ({
  id: part,
  symbol: 'AAPL',
  op: 'above',
  price: 0,
  createdAt: 1,
  line: { key: 't:AAPL', drawing: 'b', part },
  ...over
})

test('boxOp: a long target and a short stop wait for a rise, the others for a fall', () => {
  assert.equal(boxOp('long', 'target'), 'above')
  assert.equal(boxOp('long', 'stop'), 'below')
  assert.equal(boxOp('short', 'target'), 'below')
  assert.equal(boxOp('short', 'stop'), 'above')
})

test('armBox: drawn at the price, the entry counts as reached at once', () => {
  const a = armBox(base('target'), box('long', 53, 56, 51), 53.04, 500)
  assert.equal(a.op, 'above')
  assert.equal(a.price, 56)
  assert.equal(a.createdAt, 500)
  assert.deepEqual(a.box, { entry: 53, wait: false, entryAt: 500 })
  const s = armBox(base('stop'), box('long', 53, 56, 51), 53.04, 500)
  assert.equal(s.op, 'below')
  assert.equal(s.price, 51)
})

test('armBox: between stop and target but away from the entry, the pair counts at once without entryAt', () => {
  assert.deepEqual(armBox(base('target'), box('long', 53, 56, 51), 54, 500).box, { entry: 53, wait: false })
  // A long entry below the price (price 53, entry 50, target 56, stop 48).
  assert.deepEqual(armBox(base('target'), box('long', 50, 56, 48), 53, 500).box, { entry: 50, wait: false })
})

test('armBox: outside stop and target the pair waits for the entry', () => {
  // Breakout: price 55, stop 58, entry 60, target 65.
  assert.equal(armBox(base('stop'), box('long', 60, 65, 58), 55, 500).box?.wait, true)
  // Far below the price: price 55, target 53, entry 50, stop 48.
  assert.equal(armBox(base('target'), box('long', 50, 53, 48), 55, 500).box?.wait, true)
})

test('armBox: drops an old round (checkedUntil, triggered, cancelled) and leaves the entry line alone', () => {
  const a = armBox(base('target', { checkedUntil: 9, triggeredAt: 8, triggeredPrice: 56, cancelledAt: 7 }), box('long', 53, 56, 51), 54, 500)
  assert.equal(a.checkedUntil, undefined)
  assert.equal(a.triggeredAt, undefined)
  assert.equal(a.cancelledAt, undefined)
  const e = base('entry')
  assert.equal(armBox(e, box('long', 53, 56, 51), 54, 500), e)
})

const bar = (time: number, low: number, high: number) => ({ time, low, high })

test('scanBox: a waiting breakout ignores the stop until the entry is touched', () => {
  const stop = armBox(base('stop'), box('long', 60, 65, 58), 55, 100)
  const early = scanBox(stop, [bar(200, 55, 57), bar(300, 57, 58.5)])
  assert.equal(early.hit, null)
  assert.equal(early.entryAt, undefined)
  const later = scanBox(stop, [bar(200, 55, 57), bar(300, 57, 58.5), bar(400, 59, 60.2), bar(500, 57.9, 59)])
  assert.equal(later.entryAt, 400)
  assert.deepEqual(later.hit, { time: 500, price: 58 })
})

test('scanBox: a pair that counts at once hits without the entry, and remembers the entry when it comes', () => {
  const target = armBox(base('target'), box('long', 53, 56, 51), 54, 100)
  const r = scanBox(target, [bar(200, 54, 55), bar(300, 55, 56.1)])
  assert.deepEqual(r.hit, { time: 300, price: 56 })
  assert.equal(r.entryAt, undefined)
  assert.equal(scanBox(target, [bar(200, 52.9, 54)]).entryAt, 200)
})

test('scanBox: bars before the last check do not count', () => {
  const target = { ...armBox(base('target'), box('long', 53, 56, 51), 54, 100), checkedUntil: 250 }
  assert.equal(scanBox(target, [bar(200, 55, 57)]).hit, null)
})

test('pairWinner: the earlier side wins, the stop on a tie', () => {
  assert.equal(pairWinner(null, null), null)
  assert.equal(pairWinner({ time: 5 }, { time: 7 }), 'target')
  assert.equal(pairWinner({ time: 7 }, null), 'target')
  assert.equal(pairWinner({ time: 7 }, { time: 7 }), 'stop')
})

test('partnerOf: target and stop of the same box find each other, the entry has none', () => {
  const list = [base('target'), base('stop'), base('entry'), base('stop', { id: 'x', line: { key: 't:AAPL', drawing: 'other', part: 'stop' } })]
  assert.equal(partnerOf(list[0], list)?.id, 'stop')
  assert.equal(partnerOf(list[1], list)?.id, 'target')
  assert.equal(partnerOf(list[2], list), undefined)
})

test('settlePairs: two devices decided differently: the earlier hit wins everywhere', () => {
  // Phone: stop at 100; PC: target at 200.
  const list = [base('target', { triggeredAt: 200, triggeredPrice: 56 }), base('stop', { triggeredAt: 100, triggeredPrice: 51 }), base('entry')]
  const out = settlePairs(list)
  const t = out.find((a) => a.id === 'target')!
  assert.equal(t.triggeredAt, undefined)
  assert.equal(t.triggeredPrice, undefined)
  assert.equal(t.cancelledAt, 100)
  assert.equal(out.find((a) => a.id === 'stop')!.triggeredAt, 100)
  assert.deepEqual(out.find((a) => a.id === 'entry'), base('entry'))
  assert.deepEqual(settlePairs(out), out)
})

test('settlePairs: the same time goes to the stop', () => {
  const out = settlePairs([base('target', { triggeredAt: 100, triggeredPrice: 56 }), base('stop', { triggeredAt: 100, triggeredPrice: 51 })])
  assert.equal(out[0].cancelledAt, 100)
  assert.equal(out[1].triggeredAt, 100)
})

test('settlePairs: one side reached switches the armed other side off', () => {
  const out = settlePairs([base('target', { triggeredAt: 300, triggeredPrice: 56 }), base('stop')])
  assert.equal(out[1].cancelledAt, 300)
  assert.equal(out[0].triggeredAt, 300)
})

test('settlePairs: a lone or untouched pair stays as it is', () => {
  const list = [base('target'), base('stop')]
  assert.equal(settlePairs(list)[0], list[0])
  const lone = [base('target', { triggeredAt: 5, triggeredPrice: 56 })]
  assert.deepEqual(settlePairs(lone), lone)
})

test('settlePairs: both sides switched off (a sync took each from another device) → the earlier decision is restored', () => {
  // target off because the stop hit at 100; stop off because the target hit at 200 → the stop won at 100.
  const out = settlePairs([base('target', { price: 56, cancelledAt: 100 }), base('stop', { price: 51, cancelledAt: 200 })])
  assert.equal(out[1].triggeredAt, 100)
  assert.equal(out[1].triggeredPrice, 51)
  assert.equal(out[1].cancelledAt, undefined)
  assert.equal(out[0].cancelledAt, 100)
  assert.deepEqual(settlePairs(out), out)
  // The other way round: the target won at 100.
  const back = settlePairs([base('target', { price: 56, cancelledAt: 200 }), base('stop', { price: 51, cancelledAt: 100 })])
  assert.equal(back[0].triggeredAt, 100)
  assert.equal(back[0].triggeredPrice, 56)
  assert.equal(back[1].cancelledAt, 100)
})

test('armBox: without a current price the pair waits for the entry (nothing is known about the side)', () => {
  assert.deepEqual(armBox(base('stop'), box('long', 60, 65, 58), undefined, 500).box, { entry: 60, wait: true })
})

test('armBox: a waiting pair marks the side lying between the price and the entry', () => {
  // Breakout long: price 55, stop 58 (between), entry 60, target 65.
  assert.equal(armBox(base('stop'), box('long', 60, 65, 58), 55, 500).box?.near, true)
  assert.equal(armBox(base('target'), box('long', 60, 65, 58), 55, 500).box?.near, undefined)
  // Far below: price 55, target 53 (between), entry 50, stop 48.
  assert.equal(armBox(base('target'), box('long', 50, 53, 48), 55, 500).box?.near, true)
  // Counting at once: no side is crossed on the way.
  assert.equal(armBox(base('stop'), box('long', 53, 56, 51), 54, 500).box?.near, undefined)
})

test('scanBox: in the entry bar the side crossed on the way to the entry does not count', () => {
  const stop = armBox(base('stop'), box('long', 60, 65, 58), 55, 100)
  // One bar 57.5 → 60.1: entry reached, the stop at 58 was crossed before it.
  const r = scanBox(stop, [bar(200, 57.5, 60.1)])
  assert.equal(r.entryAt, 200)
  assert.equal(r.hit, null)
  // A later bar down to 57.9 is a real stop.
  assert.deepEqual(scanBox(stop, [bar(200, 57.5, 60.1), bar(300, 57.9, 59)]).hit, { time: 300, price: 58 })
  // The far side still counts in the entry bar (a bar spanning entry and target).
  const target = armBox(base('target'), box('long', 60, 65, 58), 55, 100)
  assert.deepEqual(scanBox(target, [bar(200, 59.5, 65.2)]).hit, { time: 200, price: 65 })
})

test('settlePairs: a reached alarm drops a switched-off mark left from a race', () => {
  const out = settlePairs([base('target', { triggeredAt: 100, triggeredPrice: 56, cancelledAt: 150 }), base('stop')])
  assert.equal(out[0].cancelledAt, undefined)
  assert.equal(out[0].triggeredAt, 100)
  assert.equal(out[1].cancelledAt, 100)
})

test('scanBox: an entry stored from the bar now read again still counts that bar as the entry bar', () => {
  // The newest bar is read twice: the first check stored entryAt = 200 and checkedUntil = 200.
  const stop = { ...armBox(base('stop'), box('long', 60, 65, 58), 55, 100), checkedUntil: 200 }
  const again = { ...stop, box: { ...stop.box!, entryAt: 200 } }
  assert.equal(scanBox(again, [bar(200, 57.5, 60.1)]).hit, null)
  assert.equal(scanBox(again, [bar(200, 57.5, 60.1)]).entryAt, 200)
})

test('scanBox: an entry seen by a live price inside a bar does not open the bars before it', () => {
  // Price crossed 60 at 250 (inside the bar at 200); checked only up to 100.
  const stop = { ...armBox(base('stop'), box('long', 60, 65, 58), 55, 100), checkedUntil: 100 }
  const ticked = { ...stop, box: { ...stop.box!, entryAt: 250 } }
  const r = scanBox(ticked, [bar(150, 55, 58.2), bar(200, 57.5, 60.1)])
  assert.equal(r.hit, null)
  assert.equal(r.entryAt, 200)
})

test('settlePairs: a partner hit from before this side was armed does not switch it off', () => {
  const out = settlePairs([base('target', { createdAt: 500 }), base('stop', { triggeredAt: 300, triggeredPrice: 51 })])
  assert.equal(out[0].cancelledAt, undefined)
})
