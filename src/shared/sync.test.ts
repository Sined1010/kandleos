import test from 'node:test'
import assert from 'node:assert/strict'
import { stampChanges, unitsOf, type SyncSlice } from './sync.ts'

const indicators = { sma: { on: true, period: 20 } } as unknown as SyncSlice['indicators']
const slice = (over: Partial<SyncSlice> = {}): SyncSlice => ({
  folders: [{ id: 'f1', name: 'Crypto', symbols: ['BTCUSDT', 'ETHUSDT'], collapsed: false }],
  names: { BTCUSDT: 'Bitcoin' },
  tabs: [{ id: 't1', symbol: 'BTCUSDT', timeframe: '1h', range: null }],
  drawings: { 't1:BTCUSDT': [{ id: 'd1', type: 'hline', price: 100 }, { id: 'd2', type: 'vline', time: 5 }] },
  charts: [],
  indicators,
  alarms: [{ id: 'a1', symbol: 'BTCUSDT', op: 'above', price: 120, createdAt: 1, checkedUntil: 50 }],
  ...over
})

test('the same content with keys in another order gives the same units', () => {
  const a = unitsOf(slice())
  const b = unitsOf(slice({ alarms: [{ checkedUntil: 50, createdAt: 1, price: 120, op: 'above', symbol: 'BTCUSDT', id: 'a1' }] }))
  assert.deepEqual(a, b)
})

test('moving one drawing changes only its own unit', () => {
  const before = unitsOf(slice())
  const after = unitsOf(slice({ drawings: { 't1:BTCUSDT': [{ id: 'd1', type: 'hline', price: 101 }, { id: 'd2', type: 'vline', time: 5 }] } }))
  const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k])
  assert.deepEqual(changed, ['drawing:t1:BTCUSDT:d1'])
})

test('reordering symbols in a folder changes only that folder order', () => {
  const before = unitsOf(slice())
  const after = unitsOf(slice({ folders: [{ id: 'f1', name: 'Crypto', symbols: ['ETHUSDT', 'BTCUSDT'], collapsed: false }] }))
  const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k])
  assert.deepEqual(changed, ['order:f1'])
})

test('collapsing a folder and an alarm check are per device, not a change', () => {
  const before = unitsOf(slice())
  const after = unitsOf(
    slice({
      folders: [{ id: 'f1', name: 'Crypto', symbols: ['BTCUSDT', 'ETHUSDT'], collapsed: true }],
      alarms: [{ id: 'a1', symbol: 'BTCUSDT', op: 'above', price: 120, createdAt: 1, checkedUntil: 99 }]
    })
  )
  assert.deepEqual(after, before)
})

test('stampChanges stamps changed, new and deleted units, keeps the rest', () => {
  const prev = { a: '1', b: '2', c: '3' }
  const next = { a: '1', b: '20', d: '4' }
  assert.deepEqual(stampChanges(prev, next, { a: 5, b: 5, c: 5 }, 9), { a: 5, b: 9, c: 9, d: 9 })
})

// ── mergeUnits: base = last agreed state, mine = PC, theirs = phone; offset turns phone stamps into PC time ──
import { capTabs, firstMerge, mergeUnits } from './sync.ts'

const pcU = (over: Partial<SyncSlice> = {}) => unitsOf(slice(over))

test('only the phone changed a unit → the phone version', () => {
  const base = pcU()
  const phone = pcU({ names: { BTCUSDT: 'BTC' } })
  const out = mergeUnits(base, base, phone, {}, { 'name:BTCUSDT': 5 }, 0)
  assert.equal(out['name:BTCUSDT'], '"BTC"')
})

test('both changed the same unit → the later edit wins (PC later)', () => {
  const base = pcU()
  const pc = pcU({ names: { BTCUSDT: 'PC-Name' } })
  const phone = pcU({ names: { BTCUSDT: 'Handy-Name' } })
  assert.equal(mergeUnits(base, pc, phone, { 'name:BTCUSDT': 200 }, { 'name:BTCUSDT': 100 }, 0)['name:BTCUSDT'], '"PC-Name"')
})

test('a PC clock one hour ahead does not decide: the phone edit, really later, wins', () => {
  const base = pcU()
  const pc = pcU({ names: { BTCUSDT: 'PC-Name' } })
  const phone = pcU({ names: { BTCUSDT: 'Handy-Name' } })
  // Real time: PC edited at 1000 s, phone at 2000 s. PC clock is 3600 s ahead, so it stamped 4600.
  assert.equal(mergeUnits(base, pc, phone, { 'name:BTCUSDT': 4600 }, { 'name:BTCUSDT': 2000 }, 3600)['name:BTCUSDT'], '"Handy-Name"')
})

test('phone deletes a drawing the PC changed → the changed drawing stays', () => {
  const base = pcU()
  const pc = pcU({ drawings: { 't1:BTCUSDT': [{ id: 'd1', type: 'hline', price: 150 }, { id: 'd2', type: 'vline', time: 5 }] } })
  const phone = pcU({ drawings: { 't1:BTCUSDT': [{ id: 'd2', type: 'vline', time: 5 }] } })
  const out = mergeUnits(base, pc, phone, { 'drawing:t1:BTCUSDT:d1': 10 }, { 'drawing:t1:BTCUSDT:d1': 20 }, 0)
  assert.equal(out['drawing:t1:BTCUSDT:d1'], pc['drawing:t1:BTCUSDT:d1'])
})

test('the same symbol added to the same folder on both sides ends up once', () => {
  const base = pcU()
  const add = { folders: [{ id: 'f1', name: 'Crypto', symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'], collapsed: false }] }
  const out = mergeUnits(base, pcU(add), pcU(add), { 'order:f1': 5 }, { 'order:f1': 6 }, 0)
  assert.deepEqual(JSON.parse(out['order:f1']), ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'])
})

test('a symbol added on the PC and one on the phone are both kept, in the later order', () => {
  const base = pcU()
  const pc = pcU({ folders: [{ id: 'f1', name: 'Crypto', symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'], collapsed: false }] })
  const phone = pcU({ folders: [{ id: 'f1', name: 'Crypto', symbols: ['XRPUSDT', 'BTCUSDT', 'ETHUSDT'], collapsed: false }] })
  const out = mergeUnits(base, pc, phone, { 'order:f1': 5 }, { 'order:f1': 6 }, 0)
  assert.deepEqual(JSON.parse(out['order:f1']), ['XRPUSDT', 'BTCUSDT', 'ETHUSDT', 'SOLUSDT'])
})

test('a symbol removed on one side and untouched on the other is gone, and stays gone', () => {
  const base = pcU()
  const phone = pcU({ folders: [{ id: 'f1', name: 'Crypto', symbols: ['BTCUSDT'], collapsed: false }] })
  const out = mergeUnits(base, base, phone, {}, { 'order:f1': 5, 'entry:f1:ETHUSDT': 5 }, 0)
  assert.equal(out['entry:f1:ETHUSDT'], undefined)
  assert.deepEqual(JSON.parse(out['order:f1']), ['BTCUSDT'])
})

test('phone deletes a folder the PC just added a symbol to → the folder comes back with it', () => {
  const two = { folders: [{ id: 'f1', name: 'Crypto', symbols: ['BTCUSDT'], collapsed: false }, { id: 'f2', name: 'Stocks', symbols: ['AAPL'], collapsed: false }] }
  const base = pcU(two)
  const pc = pcU({ folders: [two.folders[0], { ...two.folders[1], symbols: ['AAPL', 'NVDA'] }] })
  const phone = pcU({ folders: [two.folders[0]] })
  const out = mergeUnits(base, pc, phone, { 'order:f2': 9, 'entry:f2:NVDA': 9 }, { 'folder:f2': 8, 'order:folders': 8, 'order:f2': 8, 'entry:f2:AAPL': 8 }, 0)
  assert.ok(out['folder:f2'])
  assert.deepEqual(JSON.parse(out['order:folders']), ['f1', 'f2'])
  assert.ok(JSON.parse(out['order:f2']).includes('NVDA'))
})

test('first merge: folders meet by name, phone tabs with drawings become saved charts, names clash gets (Handy)', () => {
  const pc = slice({ charts: [{ id: 'c1', name: 'Idee', symbol: 'BTCUSDT', timeframe: '1h', drawings: [], indicators, savedAt: 1 }] })
  const phone = slice({
    folders: [{ id: 'x9', name: 'crypto ', symbols: ['SOLUSDT', 'BTCUSDT'], collapsed: false }],
    tabs: [{ id: 'p1', symbol: 'ETHUSDT', timeframe: '4h', range: null }],
    drawings: { 'p1:ETHUSDT': [{ id: 'q', type: 'hline', price: 3 }] },
    charts: [{ id: 'c2', name: 'idee', symbol: 'BTCUSDT', timeframe: '1D', drawings: [], indicators, savedAt: 2 }]
  })
  const { slice: out, savedTabs } = firstMerge(pc, phone, 'Tab vom Handy', ' (Handy)')
  assert.equal(out.folders.length, 1)
  assert.deepEqual(out.folders[0].symbols, ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'])
  assert.deepEqual(out.tabs.map((t) => t.id), ['t1'])
  assert.equal(savedTabs, 1)
  const fromTab = out.charts.find((c) => c.name === 'Tab vom Handy')!
  assert.equal(fromTab.symbol, 'ETHUSDT')
  assert.equal(fromTab.drawings.length, 1)
  assert.ok(out.charts.some((c) => c.id === 'c2' && c.name === 'idee (Handy)'))
})

test('first merge: start folders in the other language are one folder, a folder with the same id keeps the phone symbols', () => {
  const pc = slice({
    folders: [
      { id: 'a', name: 'Krypto', symbols: ['BTCUSDT'], collapsed: false },
      { id: 'b', name: 'Aktien', symbols: ['AAPL'], collapsed: false },
      { id: 'c', name: 'Ideen', symbols: [], collapsed: false }
    ]
  })
  const phone = slice({
    folders: [
      { id: 'x', name: 'Crypto', symbols: ['BTCUSDT', 'SOLUSDT'], collapsed: false },
      { id: 'y', name: 'Stocks', symbols: ['NVDA'], collapsed: false },
      { id: 'c', name: 'Ideas', symbols: ['TSLA'], collapsed: false }
    ]
  })
  const out = firstMerge(pc, phone, 'Tab vom Handy', ' (Handy)').slice.folders
  assert.deepEqual(out.map((f) => [f.name, f.symbols]), [['Krypto', ['BTCUSDT', 'SOLUSDT']], ['Aktien', ['AAPL', 'NVDA']], ['Ideen', ['TSLA']]])
})

test('first merge: an exact name wins over a translated one', () => {
  const pc = slice({ folders: [{ id: 'a', name: 'Krypto', symbols: [], collapsed: false }, { id: 'b', name: 'Crypto', symbols: [], collapsed: false }] })
  const phone = slice({ folders: [{ id: 'x', name: 'Crypto', symbols: ['SOLUSDT'], collapsed: false }] })
  const out = firstMerge(pc, phone, 'Tab vom Handy', ' (Handy)').slice.folders
  assert.deepEqual(out.map((f) => f.symbols), [[], ['SOLUSDT']])
})

test('capTabs keeps the first three tabs and saves a dropped tab with drawings as a chart', () => {
  const tabs = ['a', 'b', 'c', 'd'].map((id) => ({ id, symbol: 'BTCUSDT', timeframe: '1h' as const, range: null }))
  const out = capTabs(slice({ tabs, drawings: { 'd:BTCUSDT': [{ id: 'z', type: 'hline', price: 1 }] } }), 3, 'Tab vom PC')
  assert.deepEqual(out.tabs.map((t) => t.id), ['a', 'b', 'c'])
  assert.equal(out.drawings['d:BTCUSDT'], undefined)
  assert.equal(out.charts.find((c) => c.name === 'Tab vom PC')?.drawings.length, 1)
})

// ── applyUnits: put the merge result onto the store as it is now (it may have changed meanwhile) ──
import { applyUnits, sliceOf } from './sync.ts'

test('sliceOf rebuilds the slice from its units, keeping per-device bits', () => {
  const s = slice({ folders: [{ id: 'f1', name: 'Crypto', symbols: ['BTCUSDT', 'ETHUSDT'], collapsed: true }] })
  assert.deepEqual(sliceOf(unitsOf(s), s), s)
})

test('a drawing made while the sync was underway survives the sync result', () => {
  const sent = slice()
  const sentUnits = unitsOf(sent)
  const remote = unitsOf(slice({ drawings: { 't1:BTCUSDT': [...sent.drawings['t1:BTCUSDT'], { id: 'B', type: 'hline', price: 7 }] } }))
  const now = slice({ drawings: { 't1:BTCUSDT': [...sent.drawings['t1:BTCUSDT'], { id: 'C', type: 'hline', price: 8 }] } })
  const ids = applyUnits(now, sentUnits, remote).drawings['t1:BTCUSDT'].map((d) => d.id)
  assert.deepEqual(ids.sort(), ['B', 'C', 'd1', 'd2'])
})

test('a folder deleted on the other side goes, with its symbols', () => {
  const two = slice({ folders: [{ id: 'f1', name: 'Crypto', symbols: ['BTCUSDT'], collapsed: false }, { id: 'f2', name: 'Stocks', symbols: ['AAPL'], collapsed: false }] })
  const out = applyUnits(two, unitsOf(two), unitsOf(slice({ folders: [two.folders[0]] })))
  assert.deepEqual(out.folders.map((f) => f.id), ['f1'])
})

test('broken units from the other side are skipped, not crashing', () => {
  const s = slice()
  const bad = { ...unitsOf(s), 'chart:x': '{oops', 'tab:t9': '{"symbol":5}', 'order:tabs': '["t1","t9"]', 'drawing:t1:BTCUSDT:z': 'null' }
  const out = sliceOf(bad, s)
  assert.deepEqual(out.tabs.map((t) => t.id), ['t1'])
  assert.equal(out.charts.length, 0)
  assert.equal(out.drawings['t1:BTCUSDT'].length, 2)
})

test('drawings, tabs and charts missing what they are drawn with are skipped', () => {
  const s = slice()
  const d = (key: string, v: unknown) => ({ [`drawing:t1:BTCUSDT:${key}`]: JSON.stringify(v) })
  const bad = {
    ...unitsOf(s),
    ...d('a', { id: 'a', type: 'trend', p1: { time: 1, price: 2 } }),
    ...d('b', { id: 'b', type: 'elliott', points: [{ time: 1, price: 2 }] }),
    ...d('c', { id: 'c', type: 'hline', price: 'x' }),
    ...d('e', { id: 'e', type: 'evil', price: 1 }),
    ...d('f', { id: 'f', type: 'text', points: [{ time: 1, price: 2 }] }),
    ...d('g', { id: 'g', type: 'rect', points: [{ time: 1, price: 2 }, { time: 3, price: 4 }], color: 7 }),
    ...d('ok', { id: 'ok', type: 'text', points: [{ time: 1, price: 2 }], text: 'hi' }),
    'tab:t9': JSON.stringify({ symbol: 'ETHUSDT', timeframe: '7x', range: null }),
    'order:tabs': '["t1","t9"]',
    'chart:c1': JSON.stringify({ id: 'c1', name: 'n', symbol: 'BTCUSDT', timeframe: '1h', drawings: [{ id: 'x', type: 'vline' }] })
  }
  const out = sliceOf(bad, s)
  assert.deepEqual(out.drawings['t1:BTCUSDT'].map((x) => x.id).sort(), ['d1', 'd2', 'ok'])
  assert.deepEqual(out.tabs.map((t) => t.id), ['t1'])
  assert.equal(out.charts.length, 0)
})

// ── one full round: phone sends, PC answers, phone receives ──
import { answerSync, checkSyncRequest, emptySync, receiveSync } from './sync.ts'

const labels = { fromPhone: 'Tab vom Handy', clash: ' (Handy)' }

test('checkSyncRequest refuses malformed or oversized input', () => {
  const ok = { units: { 'name:BTCUSDT': '"B"', indicators: '{}' }, stamps: { 'name:BTCUSDT': 5 }, phoneNow: 1, baseId: null }
  assert.ok(checkSyncRequest(ok))
  assert.equal(checkSyncRequest({ ...ok, units: { 'evil:../x': '1' } }), null)
  assert.equal(checkSyncRequest({ ...ok, units: { 'name:A': 5 } }), null)
  assert.equal(checkSyncRequest({ ...ok, stamps: { a: 'x' } }), null)
  assert.equal(checkSyncRequest({ ...ok, phoneNow: 'now' }), null)
  assert.equal(checkSyncRequest({ ...ok, units: { 'name:A': 'x'.repeat(300_001) } }), null)
  assert.equal(checkSyncRequest(null), null)
})

test('a full round: both sides end with the same data, and the next round changes nothing', () => {
  let pc = slice({ names: { BTCUSDT: 'Bitcoin' } })
  let phone = slice({ folders: [{ id: 'x', name: 'Crypto', symbols: ['SOLUSDT'], collapsed: false }], tabs: [{ id: 'p', symbol: 'ETHUSDT', timeframe: '1h', range: null }], drawings: {} })
  let pcSync = emptySync(), phoneSync = emptySync()
  for (let round = 0; round < 2; round++) {
    const sent = unitsOf(phone)
    const req = { units: sent, stamps: phoneSync.stamps, phoneNow: 1000 + round, baseId: phoneSync.bases.pc?.[0]?.id ?? null }
    const a = answerSync(pc, pcSync, 'dev', req, 1000 + round, labels)
    pc = a.slice
    pcSync = a.sync
    const r = receiveSync(phone, phoneSync, 'pc', sent, a.reply, 1000 + round)
    phone = r.slice
    phoneSync = r.sync
    assert.deepEqual(unitsOf(phone), unitsOf(pc), 'round ' + round)
  }
  assert.deepEqual(pc.folders[0].symbols, ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'])
  assert.deepEqual(phone.tabs.map((t) => t.id), ['t1'])
})

test('stamps of deleted units are dropped after a sync on both sides', () => {
  let pc = slice({ names: { BTCUSDT: 'Bitcoin', ETHUSDT: 'Ether' } })
  let phone = slice()
  let pcSync = emptySync(), phoneSync = emptySync()
  const round = (now: number) => {
    const sent = unitsOf(phone)
    const a = answerSync(pc, pcSync, 'dev', { units: sent, stamps: phoneSync.stamps, phoneNow: now, baseId: phoneSync.bases.pc?.[0]?.id ?? null }, now, labels)
    pc = a.slice
    pcSync = a.sync
    const r = receiveSync(phone, phoneSync, 'pc', sent, a.reply, now)
    phone = r.slice
    phoneSync = r.sync
    return a.reply
  }
  round(10)
  assert.ok('name:ETHUSDT' in phoneSync.stamps)
  // The phone removes the name; the stamp of the deleted unit must not live on.
  phone = { ...phone, names: { BTCUSDT: 'Bitcoin' } }
  phoneSync = { ...phoneSync, stamps: stampChanges(phoneSync.seen, unitsOf(phone), phoneSync.stamps, 20), seen: unitsOf(phone) }
  const reply = round(20)
  assert.equal(pc.names.ETHUSDT, undefined)
  for (const st of [pcSync.stamps, phoneSync.stamps, reply.stamps]) {
    assert.equal('name:ETHUSDT' in st, false)
    assert.ok('name:BTCUSDT' in st)
  }
})

test('a change on the phone during the round stays and goes with the next round', () => {
  let pc = slice()
  let phone = slice()
  let pcSync = emptySync(), phoneSync = emptySync()
  const sent = unitsOf(phone)
  const a = answerSync(pc, pcSync, 'dev', { units: sent, stamps: {}, phoneNow: 10, baseId: null }, 10, labels)
  pc = a.slice
  pcSync = a.sync
  // Meanwhile the phone renamed BTC.
  phone = { ...phone, names: { BTCUSDT: 'Neu' } }
  const r = receiveSync(phone, phoneSync, 'pc', sent, a.reply, 11)
  phone = r.slice
  phoneSync = r.sync
  assert.equal(phone.names.BTCUSDT, 'Neu')
  const b = answerSync(pc, pcSync, 'dev', { units: unitsOf(phone), stamps: phoneSync.stamps, phoneNow: 20, baseId: phoneSync.bases.pc[0].id }, 20, labels)
  assert.equal(b.slice.names.BTCUSDT, 'Neu')
})

test('a lost reply does not delete what the PC added meanwhile (retry merges against the base the phone holds)', () => {
  let pc = slice()
  let phone = slice()
  let pcSync = emptySync(), phoneSync = emptySync()
  const roundTrip = (lose: boolean, now: number) => {
    const sent = unitsOf(phone)
    const a = answerSync(pc, pcSync, 'dev', { units: sent, stamps: phoneSync.stamps, phoneNow: now, baseId: phoneSync.bases.pc?.[0]?.id ?? null }, now, labels)
    pc = a.slice
    pcSync = a.sync
    if (lose) return
    const r = receiveSync(phone, phoneSync, 'pc', sent, a.reply, now)
    phone = r.slice
    phoneSync = r.sync
  }
  roundTrip(false, 10)
  // The PC draws D; the next reply never reaches the phone.
  pc = { ...pc, drawings: { 't1:BTCUSDT': [...pc.drawings['t1:BTCUSDT'], { id: 'D', type: 'hline', price: 5 }] } }
  roundTrip(true, 20)
  roundTrip(false, 30)
  assert.ok(pc.drawings['t1:BTCUSDT'].some((d) => d.id === 'D'), 'PC keeps D')
  assert.ok(phone.drawings['t1:BTCUSDT'].some((d) => d.id === 'D'), 'phone gets D')
})

test('a first sync retried after a lost reply does not save the phone tabs twice', () => {
  let pc = slice()
  const phone = slice({ tabs: [{ id: 'p1', symbol: 'ETHUSDT', timeframe: '1h', range: null }], drawings: { 'p1:ETHUSDT': [{ id: 'q', type: 'hline', price: 1 }] } })
  let pcSync = emptySync()
  for (const now of [10, 20]) {
    const a = answerSync(pc, pcSync, 'dev', { units: unitsOf(phone), stamps: {}, phoneNow: now, baseId: null }, now, labels)
    pc = a.slice
    pcSync = a.sync
  }
  assert.equal(pc.charts.filter((c) => c.name === 'Tab vom Handy').length, 1)
})
