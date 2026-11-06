// PC <-> phone link (Android Abschnitt 2): the pairing QR code and the encrypted envelope every message travels in.
// AES-256-GCM via WebCrypto, which Electron's main process and the Android WebView both have. The envelope's device
// id is bound as additional data, the counter inside the ciphertext stops replays. No plaintext ever goes over the wire.

export const LINK_PORT = 47321
const PREFIX = 'kandleos:'

export interface PairingCode {
  v: 1
  pc: string
  name: string
  addrs: string[]
  port: number
  /** base64url, 32 bytes; valid for one pairing until `exp`. */
  key: string
  /** Seconds, PC clock. */
  exp: number
}

export interface Envelope {
  /** Device id, or 'pair' while pairing. */
  d: string
  /** Nonce, 12 bytes, base64url. */
  n: string
  /** Ciphertext with GCM tag, base64url. */
  c: string
}

export type Body = { ctr: number } & Record<string, unknown>

/** Stock data keys and source choice; the phone fetches prices with them itself. LLM keys never leave the PC. */
export interface SourceKeys {
  finnhub: string
  alpaca: { id: string; secret: string } | null
  stockSource: string | null
  yahooExtra: boolean
}

export function toB64url(bytes: Uint8Array): string {
  let s = ''
  // In chunks: spreading a large array into fromCharCode overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) return null
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
  } catch {
    return null
  }
}

const utf8 = new TextEncoder()

export function encodePairing(p: PairingCode): string {
  return PREFIX + toB64url(utf8.encode(JSON.stringify(p)))
}

export function decodePairing(s: string): PairingCode | null {
  if (typeof s !== 'string' || !s.startsWith(PREFIX)) return null
  const bytes = fromB64url(s.slice(PREFIX.length))
  if (!bytes) return null
  let p: PairingCode
  try {
    p = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
  const ok =
    p?.v === 1 &&
    typeof p.pc === 'string' && p.pc.length > 0 &&
    typeof p.name === 'string' &&
    Array.isArray(p.addrs) && p.addrs.length > 0 && p.addrs.every((a) => typeof a === 'string') &&
    Number.isInteger(p.port) && p.port > 0 && p.port < 65536 &&
    fromB64url(p.key)?.length === 32 &&
    Number.isFinite(p.exp)
  return ok ? p : null
}

const aesKey = (raw: Uint8Array<ArrayBuffer>) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])

export async function sealEnvelope(key: Uint8Array<ArrayBuffer>, device: string, body: Body): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8.encode(device) }, await aesKey(key), utf8.encode(JSON.stringify(body)))
  return { d: device, n: toB64url(iv), c: toB64url(new Uint8Array(c)) }
}

export async function openEnvelope(
  key: Uint8Array<ArrayBuffer>,
  env: Envelope,
  lastCtr: number
): Promise<{ ok: true; body: Body } | { ok: false; reason: 'bad-key' | 'replay' | 'format' }> {
  const iv = typeof env?.d === 'string' ? fromB64url(env.n) : null
  const c = iv ? fromB64url(env.c) : null
  if (!iv || iv.length !== 12 || !c || c.length < 16) return { ok: false, reason: 'format' }
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: utf8.encode(env.d) }, await aesKey(key), c)
  } catch {
    return { ok: false, reason: 'bad-key' }
  }
  let body: Body
  try {
    body = JSON.parse(new TextDecoder().decode(plain))
  } catch {
    return { ok: false, reason: 'format' }
  }
  if (!Number.isFinite(body?.ctr)) return { ok: false, reason: 'format' }
  // Checked after decrypting, so a stranger learns nothing from the answer.
  if (body.ctr <= lastCtr) return { ok: false, reason: 'replay' }
  return { ok: true, body }
}

const v4 = (ip: string): number[] | null => {
  const parts = ip.split('.')
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && +p <= 255)) return null
  return parts.map(Number)
}

/** Home network, VPN (Tailscale's 100.64/10) or this computer; everything else is turned away. */
export function isPrivateAddress(ip: string): boolean {
  const ip4 = v4(ip.startsWith('::ffff:') ? ip.slice(7) : ip)
  if (ip4) {
    const [a, b] = ip4
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  const s = ip.toLowerCase()
  if (!s.includes(':')) return false
  return s === '::1' || /^f[cd][0-9a-f]{0,2}:/.test(s) || /^fe[89ab][0-9a-f]?:/.test(s)
}

/** Strictly growing message counter; the clock only makes it start high after a reinstall. */
export const nextCtr = (last: number, now = Date.now()) => Math.max(now, last + 1)
