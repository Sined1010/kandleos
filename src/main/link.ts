// "Phone access" (Android Abschnitt 2): a small HTTP service on the home network, only while switched on.
// One endpoint, POST /k, encrypted envelopes only (shared/link.ts), private senders only; linkHandler.ts decides.
import { app } from 'electron'
import { createServer, type Server } from 'node:http'
import { hostname, networkInterfaces } from 'node:os'
import { encodePairing, isPrivateAddress, LINK_PORT, toB64url } from '../shared/link'
import { handleRequest, mergeDevices, type LinkDevice, type LinkState, type SourceKeys } from './linkHandler'
import { t } from '../shared/i18n'
import { read, save } from './keys'

interface LinkFile {
  pcId: string
  enabled: boolean
  vpnHost: string
  autostart: boolean
  devices: LinkDevice[]
  removed?: { id: string; key: string }[]
  hideHintShown?: boolean
}

export interface LinkStatus {
  enabled: boolean
  port: number
  error: string | null
  vpnHost: string
  autostart: boolean
  devices: { id: string; name: string; lastSeen: number }[]
  /** Until when the shown QR code is valid (ms), or null. */
  pairingUntil: number | null
}

const MAX_BODY = 2 * 1024 * 1024
const PAIRING_MS = 5 * 60 * 1000
// Encrypted like the stock keys (keys.ts): the device keys are as sensitive.
const FILES = ['link-devices.bin', 'link-devices.json'] as const

let file: LinkFile | null = null
let pairing: LinkState['pairing'] = null
let server: Server | null = null
let error: string | null = null
let queue: Promise<unknown> = Promise.resolve()
let keys: () => SourceKeys = () => ({ finnhub: '', alpaca: null, stockSource: null, yahooExtra: false })
let forward: (op: string, args: unknown, device: string) => Promise<unknown> = async () => {
  throw new Error('unknown-op')
}
let onError: (message: string) => void = () => {}

function load(): LinkFile {
  if (file) return file
  try {
    file = JSON.parse(read(...FILES) ?? 'null')
  } catch {
    file = null
  }
  file ??= { pcId: crypto.randomUUID(), enabled: false, vpnHost: '', autostart: false, devices: [] }
  return file
}

const persist = () => save(...FILES, JSON.stringify(load()))

export function linkStatus(): LinkStatus {
  const f = load()
  return {
    enabled: f.enabled,
    port: LINK_PORT,
    error,
    vpnHost: f.vpnHost,
    autostart: f.autostart,
    devices: f.devices.map(({ id, name, lastSeen }) => ({ id, name, lastSeen })),
    pairingUntil: pairing && pairing.exp > Date.now() ? pairing.exp : null
  }
}

/** What the window and the tray hand in: where the stock keys come from, who answers sync, who hears of a failed start. */
export function configureLink(o: { keys: () => SourceKeys; forward: typeof forward; onError: typeof onError }): void {
  keys = o.keys
  forward = o.forward
  onError = o.onError
}

async function answer(raw: string): Promise<string | null> {
  let env: unknown
  try {
    env = JSON.parse(raw)
  } catch {
    return null
  }
  const f = load()
  const before = f.devices
  const open = pairing
  const { state, reply } = await handleRequest(env, { pcId: f.pcId, pcName: hostname(), devices: before, removed: f.removed ?? [], pairing: open }, { now: Date.now(), keys, forward })
  // The window may take seconds to answer a sync: meanwhile a phone may have been removed or a new QR shown.
  if (state.pairing !== open && pairing === open) pairing = state.pairing
  if (state.devices !== before) {
    f.devices = mergeDevices(f.devices, before, state.devices)
    await persist()
  }
  return reply ? JSON.stringify(reply) : null
}

/** Resolves once the port is open or failed, so the status returned afterwards shows the error. */
function start(): Promise<void> {
  if (server) return Promise.resolve()
  error = null
  const s = createServer((req, res) => {
    // Strangers from outside the home network or VPN get nothing, not even an error page.
    if (!isPrivateAddress(req.socket.remoteAddress ?? '') || req.method !== 'POST' || req.url !== '/k') {
      req.socket.destroy()
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) req.socket.destroy()
      else chunks.push(c)
    })
    req.on('end', () => {
      // One at a time, so two requests cannot both pass the same counter.
      const run = queue.then(() => answer(Buffer.concat(chunks).toString('utf8')))
      queue = run.catch(() => {})
      run
        .then((out) => {
          if (out === null) return req.socket.destroy()
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(out)
        })
        .catch(() => req.socket.destroy())
    })
  })
  s.on('error', (err: NodeJS.ErrnoException) => {
    error = err.code === 'EADDRINUSE' ? t('Port {port} ist belegt', { port: String(LINK_PORT) }) : err.message
    server = null
    // Started hidden at login, nobody would see it in the settings.
    onError(error)
  })
  // '::' takes IPv4 too (dual stack); the sender check above filters both.
  s.listen(LINK_PORT, '::')
  server = s
  return new Promise((resolve) => {
    s.once('listening', resolve)
    s.once('error', () => resolve())
  })
}

function stop(): void {
  server?.close()
  // close() alone lets a phone's kept-alive connection go on for a few seconds.
  server?.closeAllConnections()
  server = null
  pairing = null
}

/** Called once at startup and whenever the switch changes. */
export async function setLinkEnabled(on: unknown): Promise<LinkStatus> {
  const f = load()
  f.enabled = on === true
  await persist()
  if (f.enabled) await start()
  else stop()
  return linkStatus()
}

export const linkEnabled = (): boolean => load().enabled
export const resumeLink = (): void => void (load().enabled && start())

/** Private IPv4 addresses of this PC, plus the VPN address/hostname the user entered. */
function addresses(): string[] {
  const own = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal && isPrivateAddress(a.address))
    .map((a) => a!.address)
  const vpn = load().vpnHost
  return vpn ? [...own, vpn] : own
}

export function startPairing(): string {
  if (!server) throw new Error(t('Handy-Zugang ist aus'))
  const key = toB64url(crypto.getRandomValues(new Uint8Array(32)))
  const exp = Date.now() + PAIRING_MS
  pairing = { key, exp }
  return encodePairing({ v: 1, pc: load().pcId, name: hostname(), addrs: addresses(), port: LINK_PORT, key, exp: Math.floor(exp / 1000) })
}

const KEEP_REMOVED = 20
export async function removeDevice(id: unknown): Promise<LinkStatus> {
  const f = load()
  const gone = f.devices.find((d) => d.id === id)
  f.devices = f.devices.filter((d) => d.id !== id)
  if (gone) f.removed = [{ id: gone.id, key: gone.key }, ...(f.removed ?? [])].slice(0, KEEP_REMOVED)
  await persist()
  return linkStatus()
}

const HOST_RE = /^[A-Za-z0-9.:-]{0,253}$/
export async function setVpnHost(host: unknown): Promise<LinkStatus> {
  if (typeof host !== 'string' || !HOST_RE.test(host.trim())) throw new Error(t('Ungültige Adresse'))
  load().vpnHost = host.trim()
  await persist()
  return linkStatus()
}

export async function setLinkAutostart(on: boolean): Promise<void> {
  load().autostart = on
  await persist()
}

/** True once: the first time the window hides into the notification area, the user gets a hint. */
export function takeFirstHideHint(): boolean {
  const f = load()
  if (f.hideHintShown) return false
  f.hideHintShown = true
  void persist()
  return true
}

app.on('before-quit', stop)
