// The phone side of the PC link, without Capacitor (link.ts wires storage and the store): pairing and calls.
// The phone always asks, the PC only answers; every message is sealed with the device key (shared/link.ts).
import type { Http } from '../data/http.ts'
import { fromB64url, nextCtr, openEnvelope, sealEnvelope, type Envelope, type PairingCode, type SourceKeys } from '../shared/link.ts'

export interface Pairing {
  pcId: string
  pcName: string
  /** Last address that answered first. */
  addrs: string[]
  port: number
  deviceId: string
  /** base64url, 32 bytes. */
  key: string
  lastCtr: number
}

export interface LinkDeps {
  http: Http
  load(): Promise<Pairing | null>
  save(p: Pairing): Promise<void>
  /** The PC no longer knows this phone: clear the pairing and what came with it. */
  onRemoved(): Promise<void>
}

const TIMEOUT_MS = 4000
const url = (addr: string, port: number) => `http://${addr.includes(':') ? `[${addr}]` : addr}:${port}/k`

export function createLinkClient(deps: LinkDeps) {
  /** Sends one sealed message to the first address that answers with a reply to exactly this message. */
  async function send(addrs: string[], port: number, key: Uint8Array<ArrayBuffer>, device: string, ctr: number, body: Record<string, unknown>, timeoutMs = TIMEOUT_MS) {
    const env = await sealEnvelope(key, device, { ctr, ...body }, 'req')
    for (const addr of addrs) {
      let reply: unknown
      try {
        const res = await deps.http(url(addr, port), {
          method: 'POST',
          body: JSON.stringify(env),
          headers: { 'Content-Type': 'application/json' },
          timeoutMs
        })
        if (!res.ok) continue
        reply = await res.json()
      } catch {
        continue
      }
      // Anything not sealed with our key (another PC on an old address, a stranger) is not an answer.
      const opened = await openEnvelope(key, reply as Envelope, ctr - 1, 'res')
      // Only the answer to this very message counts (same counter), never an old one.
      if (opened.ok && opened.body.ctr === ctr) return { addr, body: opened.body }
    }
    return null
  }

  async function callNow(op: string, args?: unknown, timeoutMs?: number): Promise<unknown> {
    const p = await deps.load()
    if (!p) throw new Error('not-paired')
    const ctr = nextCtr(p.lastCtr)
    // Saved before sending: a counter is never used twice, even if the app dies mid-request.
    await deps.save({ ...p, lastCtr: ctr })
    const got = await send(p.addrs, p.port, fromB64url(p.key)!, p.deviceId, ctr, { op, args }, timeoutMs)
    if (!got) throw new Error('offline')
    // Sealed with our own key, so it really is our PC saying it removed this phone.
    if (got.body.error === 'removed') {
      await deps.onRemoved()
      throw new Error('removed')
    }
    if (got.addr !== p.addrs[0]) await deps.save({ ...p, lastCtr: ctr, addrs: [got.addr, ...p.addrs.filter((a) => a !== got.addr)] })
    if (typeof got.body.error === 'string') throw new Error(got.body.error)
    return got.body.res
  }

  // One call at a time: two at once would read the same counter, and the PC drops the later one as a replay.
  let queue: Promise<unknown> = Promise.resolve()

  return {
    async pair(code: PairingCode, name: string): Promise<{ pairing: Pairing; keys: SourceKeys }> {
      const key = fromB64url(code.key)!
      const got = await send(code.addrs, code.port, key, 'pair', nextCtr(0), { op: 'pair', name })
      const b = got && 'body' in got ? got.body : null
      if (!b || typeof b.deviceId !== 'string' || fromB64url(String(b.deviceKey))?.length !== 32) throw new Error('offline')
      const pairing: Pairing = {
        pcId: String(b.pcId),
        pcName: String(b.pcName),
        addrs: [got!.addr, ...code.addrs.filter((a) => a !== got!.addr)],
        port: code.port,
        deviceId: b.deviceId,
        key: String(b.deviceKey),
        lastCtr: 0
      }
      await deps.save(pairing)
      return { pairing, keys: b.keys as SourceKeys }
    },

    /** `timeoutMs` per address: a forecast takes the PC far longer than a hello. */
    call(op: string, args?: unknown, timeoutMs?: number): Promise<unknown> {
      const run = queue.then(() => callNow(op, args, timeoutMs))
      queue = run.catch(() => {})
      return run
    }
  }
}
