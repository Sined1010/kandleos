import test from 'node:test'
import assert from 'node:assert/strict'
import type { Http, HttpInit } from '../data/http.ts'
import { fromB64url, openEnvelope, sealEnvelope, toB64url, type Envelope, type PairingCode } from '../shared/link.ts'
import { createLinkClient, type Pairing } from './linkClient.ts'

const devKey = new Uint8Array(32).fill(3)
const paired: Pairing = { pcId: 'pc', pcName: 'Desktop', addrs: ['10.0.0.1', '10.0.0.2'], port: 47321, deviceId: 'dev', key: toB64url(devKey), lastCtr: 0 }

/** A fake PC: answers hello on the addresses in `up`, records every request. */
function fakePc(up: string[], answer: (env: Envelope) => Promise<unknown> = async (env) => {
  const o = await openEnvelope(devKey, env, 0, 'req')
  return o.ok ? sealEnvelope(devKey, 'dev', { ctr: o.body.ctr, res: { pcNow: 1 } }, 'res') : null
}) {
  const calls: string[] = []
  const http: Http = async (url: string, init: HttpInit) => {
    calls.push(url)
    if (!up.some((a) => url.includes(a))) throw new Error('unreachable')
    const out = await answer(JSON.parse(init.body!))
    return { status: 200, ok: true, json: async () => out, text: async () => JSON.stringify(out), setCookies: [] }
  }
  return { http, calls }
}

function client(http: Http, start: Pairing | null = paired) {
  let stored = start
  let removed = 0
  const c = createLinkClient({
    http,
    load: async () => stored,
    save: async (p) => void (stored = p),
    onRemoved: async () => {
      removed++
      stored = null
    }
  })
  return { c, stored: () => stored, removed: () => removed }
}

test('call falls back to the next address and remembers the one that answered', async () => {
  const pc = fakePc(['10.0.0.2'])
  const { c, stored } = client(pc.http)
  assert.deepEqual(await c.call('hello'), { pcNow: 1 })
  assert.deepEqual(pc.calls, ['http://10.0.0.1:47321/k', 'http://10.0.0.2:47321/k'])
  assert.deepEqual(stored()!.addrs, ['10.0.0.2', '10.0.0.1'])
  assert.ok(stored()!.lastCtr > 0)
})

test('no address answers → offline', async () => {
  const { c } = client(fakePc([]).http)
  await assert.rejects(c.call('hello'), /offline/)
})

test('a sealed "removed" unpairs exactly once and stops all further requests', async () => {
  const pc = fakePc(['10.0.0.1'], async (env) => {
    const o = await openEnvelope(devKey, env, 0, 'req')
    return sealEnvelope(devKey, 'dev', { ctr: o.ok ? o.body.ctr : 0, error: 'removed' }, 'res')
  })
  const { c, removed } = client(pc.http)
  await assert.rejects(c.call('hello'), /removed/)
  await assert.rejects(c.call('hello'), /not-paired/)
  assert.equal(removed(), 1)
  assert.equal(pc.calls.length, 1)
})

test('a plaintext "unknown-device" (another PC on the old address, or a forger) does not unpair', async () => {
  const pc = fakePc(['10.0.0.1'], async () => ({ error: 'unknown-device' }))
  const { c, removed, stored } = client(pc.http)
  await assert.rejects(c.call('hello'), /offline/)
  assert.equal(removed(), 0)
  assert.ok(stored())
})

test('a reply that does not belong to the request (wrong counter) is refused', async () => {
  const pc = fakePc(['10.0.0.1'], async (env) => {
    const o = await openEnvelope(devKey, env, 0, 'req')
    return sealEnvelope(devKey, 'dev', { ctr: o.ok ? o.body.ctr + 1 : 0, res: 'forged' }, 'res')
  })
  const { c } = client(pc.http)
  await assert.rejects(c.call('hello'), /offline/)
})

test('calls made at the same time go one after another, each with its own counter', async () => {
  // Like the real PC: a counter not above the last one gets no answer.
  let last = 0
  const pc = fakePc(['10.0.0.1'], async (env) => {
    const o = await openEnvelope(devKey, env, last, 'req')
    if (!o.ok) return null
    last = o.body.ctr
    return sealEnvelope(devKey, 'dev', { ctr: o.body.ctr, res: o.body.op }, 'res')
  })
  const { c } = client(pc.http)
  assert.deepEqual(await Promise.all([c.call('hello'), c.call('keys'), c.call('sync')]), ['hello', 'keys', 'sync'])
})

test('a failed call does not block the next one', async () => {
  let up = false
  const pc = fakePc(['10.0.0.1'], async (env) => {
    const o = await openEnvelope(devKey, env, 0, 'req')
    return up && o.ok ? sealEnvelope(devKey, 'dev', { ctr: o.body.ctr, res: 'ok' }, 'res') : null
  })
  const { c } = client(pc.http)
  await assert.rejects(c.call('hello'), /offline/)
  up = true
  assert.equal(await c.call('hello'), 'ok')
})

test('pair stores the device key from the PC and returns the stock keys', async () => {
  const pairKey = new Uint8Array(32).fill(9)
  const code: PairingCode = { v: 1, pc: 'pc', name: 'Desktop', addrs: ['192.168.1.2'], port: 47321, key: toB64url(pairKey), exp: 0 }
  const keys = { finnhub: 'fh', alpaca: null, stockSource: 'yahoo', yahooExtra: false }
  const pc = fakePc(['192.168.1.2'], async (env) => {
    const o = await openEnvelope(pairKey, env, 0, 'req')
    if (!o.ok || o.body.op !== 'pair' || o.body.name !== 'Pixel 8') return null
    return sealEnvelope(pairKey, 'pair', { ctr: o.body.ctr, deviceId: 'dev-9', deviceKey: toB64url(devKey), pcId: 'pc', pcName: 'Desktop', keys }, 'res')
  })
  const { c, stored } = client(pc.http, null)
  const out = await c.pair(code, 'Pixel 8')
  assert.deepEqual(out.keys, keys)
  assert.equal(stored()!.deviceId, 'dev-9')
  assert.deepEqual(fromB64url(stored()!.key), devKey)
})
