import test from 'node:test'
import assert from 'node:assert/strict'
import { fromB64url, openEnvelope, sealEnvelope, toB64url, type Envelope } from '../shared/link.ts'
import { handleRequest, mergeDevices, type LinkDevice, type LinkState, type SourceKeys } from './linkHandler.ts'

const pairKey = new Uint8Array(32).fill(7)
const keys: SourceKeys = { finnhub: 'fh', alpaca: null, stockSource: 'yahoo', yahooExtra: false }
const base = (): LinkState => ({ pcId: 'pc-1', pcName: 'Desktop', devices: [], removed: [], pairing: { key: toB64url(pairKey), exp: 1000 } })
const ctx = (now = 500, forward: (op: string, args: unknown) => Promise<unknown> = async () => { throw new Error('unknown-op') }) => ({ now, keys: () => keys, forward })

async function pairPhone(state = base(), now = 500) {
  const env = await sealEnvelope(pairKey, 'pair', { ctr: 1, op: 'pair', name: 'Pixel 8' }, 'req')
  return { env, ...(await handleRequest(env, state, ctx(now))) }
}

test('pairing with a valid code creates exactly one device and uses the code up', async () => {
  const { state, reply } = await pairPhone()
  assert.equal(state.devices.length, 1)
  assert.equal(state.devices[0].name, 'Pixel 8')
  assert.equal(state.pairing, null)
  const opened = await openEnvelope(pairKey, reply as Envelope, 0, 'res')
  assert.ok(opened.ok)
  const body: Record<string, unknown> = opened.ok ? opened.body : {}
  assert.equal(body.deviceId, state.devices[0].id)
  assert.equal(body.deviceKey, state.devices[0].key)
  assert.deepEqual(body.keys, keys)
})

test('the same pairing code cannot pair a second phone', async () => {
  const { env, state } = await pairPhone()
  const again = await handleRequest(env, state, ctx())
  assert.equal(again.reply, null)
  assert.equal(again.state.devices.length, 1)
})

test('an expired pairing code is refused', async () => {
  const { state, reply } = await pairPhone(base(), 1001)
  assert.equal(reply, null)
  assert.equal(state.devices.length, 0)
})

test('an unknown device gets no answer at all', async () => {
  const env = await sealEnvelope(new Uint8Array(32).fill(1), 'nobody', { ctr: 5, op: 'hello' }, 'req')
  const { reply } = await handleRequest(env, base(), ctx())
  assert.equal(reply, null)
})

test('a removed device learns it, sealed with its own key; someone else using its id learns nothing', async () => {
  const key = new Uint8Array(32).fill(4)
  const state = { ...base(), removed: [{ id: 'old', key: toB64url(key) }] }
  const r = await handleRequest(await sealEnvelope(key, 'old', { ctr: 9, op: 'hello' }, 'req'), state, ctx())
  const opened = await openEnvelope(key, r.reply as Envelope, 0, 'res')
  assert.ok(opened.ok)
  assert.equal(opened.ok && opened.body.error, 'removed')
  const forged = await handleRequest(await sealEnvelope(new Uint8Array(32).fill(5), 'old', { ctr: 9, op: 'hello' }, 'req'), state, ctx())
  assert.equal(forged.reply, null)
})

test('mergeDevices: a phone removed while its request ran stays removed; counters and new phones carry over', () => {
  const d = (id: string, lastCtr = 0): LinkDevice => ({ id, name: id, key: 'k', lastCtr, lastSeen: 0 })
  const before = [d('a'), d('b')]
  const after = [d('a', 7), d('b', 3), d('new')]
  const current = [d('a')] // b was removed during the request
  assert.deepEqual(mergeDevices(current, before, after).map((x) => [x.id, x.lastCtr]), [['a', 7], ['new', 0]])
})

test('hello answers with the PC time and a keys version, and remembers counter and time', async () => {
  const { state } = await pairPhone()
  const dev = state.devices[0]
  const key = fromB64url(dev.key)!
  const r = await handleRequest(await sealEnvelope(key, dev.id, { ctr: 10, op: 'hello' }, 'req'), state, ctx(700))
  const opened = await openEnvelope(key, r.reply as Envelope, 0, 'res')
  assert.ok(opened.ok)
  const body: Record<string, unknown> = opened.ok ? opened.body : {}
  assert.equal(body.ctr, 10)
  assert.equal((body.res as { pcNow: number }).pcNow, 700)
  assert.match((body.res as { keysVersion: string }).keysVersion, /^[0-9a-f]{64}$/)
  assert.equal(r.state.devices[0].lastCtr, 10)
  assert.equal(r.state.devices[0].lastSeen, 700)
})

test('a replayed message from a paired phone gets no answer', async () => {
  const { state } = await pairPhone()
  const dev = state.devices[0]
  const env = await sealEnvelope(fromB64url(dev.key)!, dev.id, { ctr: 10, op: 'hello' }, 'req')
  const first = await handleRequest(env, state, ctx())
  const replay = await handleRequest(env, first.state, ctx())
  assert.equal(replay.reply, null)
})

test('keys returns the stock keys, other ops go to forward, unknown ops get an encrypted error', async () => {
  const { state } = await pairPhone()
  const dev = state.devices[0]
  const key = fromB64url(dev.key)!
  const fwd = async (op: string, args: unknown) => {
    if (op === 'sync') return { echo: args }
    throw new Error('unknown-op')
  }
  const k = await handleRequest(await sealEnvelope(key, dev.id, { ctr: 1, op: 'keys' }, 'req'), state, ctx(500, fwd))
  const s = await handleRequest(await sealEnvelope(key, dev.id, { ctr: 2, op: 'sync', args: 1 }, 'req'), k.state, ctx(500, fwd))
  const u = await handleRequest(await sealEnvelope(key, dev.id, { ctr: 3, op: 'rm-rf' }, 'req'), s.state, ctx(500, fwd))
  const body = async (r: { reply: unknown }) => {
    const o = await openEnvelope(key, r.reply as Envelope, 0, 'res')
    return o.ok ? o.body : null
  }
  assert.deepEqual((await body(k))?.res, keys)
  assert.deepEqual((await body(s))?.res, { echo: 1 })
  assert.equal((await body(u))?.error, 'unknown-op')
})
