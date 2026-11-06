import test from 'node:test'
import assert from 'node:assert/strict'
import { decodePairing, encodePairing, isPrivateAddress, nextCtr, openEnvelope, sealEnvelope, type PairingCode } from './link.ts'

const key = (fill: number) => new Uint8Array(32).fill(fill)
const code: PairingCode = { v: 1, pc: 'pc-1', name: 'Desktop', addrs: ['192.168.1.20'], port: 47321, key: 'A'.repeat(43), exp: 1_800_000_000 }

test('pairing code survives encode and decode', () => {
  const s = encodePairing(code)
  assert.ok(s.startsWith('kandleos:'))
  assert.deepEqual(decodePairing(s), code)
})

test('decodePairing rejects foreign or broken codes', () => {
  assert.equal(decodePairing('kandleos:xyz'), null)
  assert.equal(decodePairing('https://example.com'), null)
  assert.equal(decodePairing(encodePairing({ ...code, port: 0 })), null)
  assert.equal(decodePairing(encodePairing({ ...code, key: 'AAAA' })), null)
  assert.equal(decodePairing('kandleos:' + btoa(JSON.stringify({ ...code, addrs: 'x' }))), null)
})

test('an envelope opens with the same key and a newer counter', async () => {
  const env = await sealEnvelope(key(1), 'dev-1', { ctr: 5, op: 'hello' }, 'req')
  const opened = await openEnvelope(key(1), env, 4, 'req')
  assert.deepEqual(opened, { ok: true, body: { ctr: 5, op: 'hello' } })
})

test('an envelope with another key is rejected', async () => {
  const env = await sealEnvelope(key(1), 'dev-1', { ctr: 5 }, 'req')
  assert.deepEqual(await openEnvelope(key(2), env, 0, 'req'), { ok: false, reason: 'bad-key' })
})

test('a replayed envelope (counter not newer) is rejected', async () => {
  const env = await sealEnvelope(key(1), 'dev-1', { ctr: 5 }, 'req')
  assert.deepEqual(await openEnvelope(key(1), env, 5, 'req'), { ok: false, reason: 'replay' })
})

test('an envelope moved to another device id is rejected', async () => {
  const env = await sealEnvelope(key(1), 'dev-1', { ctr: 5 }, 'req')
  assert.deepEqual(await openEnvelope(key(1), { ...env, d: 'dev-2' }, 0, 'req'), { ok: false, reason: 'bad-key' })
})

test('a request sent back to the phone is no reply (direction is sealed in)', async () => {
  const env = await sealEnvelope(key(1), 'dev-1', { ctr: 5, op: 'hello' }, 'req')
  assert.deepEqual(await openEnvelope(key(1), env, 4, 'res'), { ok: false, reason: 'bad-key' })
  const reply = await sealEnvelope(key(1), 'dev-1', { ctr: 5, res: 1 }, 'res')
  assert.deepEqual(await openEnvelope(key(1), reply, 4, 'req'), { ok: false, reason: 'bad-key' })
})

test('a malformed envelope is rejected as format', async () => {
  assert.deepEqual(await openEnvelope(key(1), { d: 'x', n: '!!', c: '' } as never, 0, 'req'), { ok: false, reason: 'format' })
  assert.deepEqual(await openEnvelope(key(1), null as never, 0, 'req'), { ok: false, reason: 'format' })
})

test('only private and loopback addresses count as private', () => {
  for (const ip of ['192.168.1.5', '10.0.0.1', '172.31.255.255', '100.100.1.1', '127.0.0.1', '::1', 'fd12::1', 'fe80::1', '::ffff:192.168.0.2'])
    assert.equal(isPrivateAddress(ip), true, ip)
  for (const ip of ['172.32.0.1', '8.8.8.8', '::ffff:8.8.8.8', '2001:db8::1', '100.128.0.1', '', 'garbage'])
    assert.equal(isPrivateAddress(ip), false, ip)
})

test('nextCtr always grows, even when the clock goes back', () => {
  assert.equal(nextCtr(10, 5), 11)
  assert.equal(nextCtr(10, 50), 50)
})
