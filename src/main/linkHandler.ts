// The PC side of the phone link, without Electron: one request in, new state and the reply out (link.ts does the
// network, the file and the window). The PC answers a fixed list of ops; anything else is an encrypted error.
import { fromB64url, openEnvelope, sealEnvelope, toB64url, type Envelope, type SourceKeys } from '../shared/link.ts'

export type { SourceKeys }

export interface LinkDevice {
  id: string
  name: string
  /** base64url, 32 bytes. */
  key: string
  lastCtr: number
  /** Milliseconds, PC clock. */
  lastSeen: number
}

export interface LinkState {
  pcId: string
  pcName: string
  devices: LinkDevice[]
  /** Removed phones (id and key), so they can be told, sealed, that they are out; nobody else can tell them. */
  removed: { id: string; key: string }[]
  /** The open QR code: its key and when it runs out (ms). */
  pairing: { key: string; exp: number } | null
}

export interface LinkContext {
  now: number
  keys: () => SourceKeys
  /** Ops the window answers (sync); throws Error('unknown-op') for anything it does not know. */
  forward: (op: string, args: unknown, device: string) => Promise<unknown>
  /** Called with the new counter in place before the op runs; link.ts saves it and lets the next request in. */
  accepted?: (state: LinkState) => Promise<void>
}

type Reply = Envelope | null

export const keysVersion = async (k: SourceKeys): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(k))))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

const deviceName = (v: unknown): string => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : 'Android')

/**
 * Takes a request's device changes onto the list as it is now: counters and "last seen" of phones still there, and
 * a newly paired phone. A phone removed while the request ran stays removed.
 */
export function mergeDevices(current: LinkDevice[], before: LinkDevice[], after: LinkDevice[]): LinkDevice[] {
  const out = current.map((c) => {
    const a = after.find((x) => x.id === c.id)
    return a ? { ...c, lastCtr: Math.max(c.lastCtr, a.lastCtr), lastSeen: Math.max(c.lastSeen, a.lastSeen) } : c
  })
  for (const a of after) if (!before.some((b) => b.id === a.id) && !out.some((c) => c.id === a.id)) out.push(a)
  return out
}

export async function handleRequest(env: unknown, state: LinkState, ctx: LinkContext): Promise<{ state: LinkState; reply: Reply }> {
  const e = env as Envelope
  if (typeof e?.d !== 'string') return { state, reply: null }

  if (e.d === 'pair') {
    const p = state.pairing
    if (!p || ctx.now > p.exp) return { state, reply: null }
    const key = fromB64url(p.key)!
    const opened = await openEnvelope(key, e, 0, 'req')
    if (!opened.ok || opened.body.op !== 'pair') return { state, reply: null }
    const device: LinkDevice = {
      id: crypto.randomUUID(),
      name: deviceName(opened.body.name),
      key: toB64url(crypto.getRandomValues(new Uint8Array(32))),
      lastCtr: 0,
      lastSeen: ctx.now
    }
    const reply = await sealEnvelope(key, 'pair', {
      ctr: opened.body.ctr,
      deviceId: device.id,
      deviceKey: device.key,
      pcId: state.pcId,
      pcName: state.pcName,
      keys: ctx.keys()
    }, 'res')
    // A code pairs once: used up even before the phone has the answer.
    return { state: { ...state, devices: [...state.devices, device], pairing: null }, reply }
  }

  const device = state.devices.find((d) => d.id === e.d)
  if (!device) {
    // Only a removed phone that still holds its key gets an answer; anyone else gets none.
    const gone = state.removed.find((d) => d.id === e.d)
    const key = gone && fromB64url(gone.key)
    const opened = key ? await openEnvelope(key, e, 0, 'req') : null
    return { state, reply: key && opened?.ok ? await sealEnvelope(key, e.d, { ctr: opened.body.ctr, error: 'removed' }, 'res') : null }
  }
  const key = fromB64url(device.key)!
  const opened = await openEnvelope(key, e, device.lastCtr, 'req')
  if (!opened.ok) return { state, reply: null }
  const { ctr, op, args } = opened.body
  const next = { ...state, devices: state.devices.map((d) => (d === device ? { ...d, lastCtr: ctr, lastSeen: ctx.now } : d)) }
  // From here a replay of this message is refused, so a long op (a forecast) need not hold up other requests.
  await ctx.accepted?.(next)

  let body: Record<string, unknown>
  try {
    const res =
      op === 'hello'
        ? { pcNow: ctx.now, keysVersion: await keysVersion(ctx.keys()) }
        : op === 'keys'
          ? ctx.keys()
          : await ctx.forward(String(op), args, device.id)
    body = { res }
  } catch (err) {
    // In words ("an analysis is already running"), but never 'removed': that one would unpair the phone.
    const message = (err as Error).message
    body = { error: message && message !== 'removed' ? message : 'failed' }
  }
  return { state: next, reply: await sealEnvelope(key, device.id, { ctr, ...body }, 'res') }
}
