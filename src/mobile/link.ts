// Phone ↔ PC link on the phone: pairing in the Keystore-backed storage, a hello every few minutes while the app is in
// front, and the stock keys the PC hands over (the PC is their source while paired). Protocol in linkClient.ts.
import { App as CapApp } from '@capacitor/app'
import { usePcStatus } from '../renderer/src/lib/pcStatus'
import { saveAlpacaKeys } from '../data/alpaca'
import { decodePairing, type PairingCode, type SourceKeys } from '../shared/link'
import { t } from '../shared/i18n'
import type { StockSource } from '../shared/types'
import { resetSync, startStamping, syncWithPc } from '../renderer/src/services/sync'
import { useStore } from '../renderer/src/store/useStore'
import { capHttp } from './capHttp'
import { createLinkClient, type Pairing } from './linkClient'
import { ask, tell } from './MessageBox'
import { KandleNative } from './native'

type Stored = Pairing & { keysVersion?: string }
const SECURE = 'link'
const HELLO_MS = 3 * 60 * 1000

async function load(): Promise<Stored | null> {
  try {
    return JSON.parse((await KandleNative.secureGet({ name: SECURE })).value ?? 'null')
  } catch {
    return null
  }
}
const save = (p: Stored) => KandleNative.secureSet({ name: SECURE, value: JSON.stringify(p) })

export { usePcStatus }

const client = createLinkClient({ http: capHttp, load, save, onRemoved: () => unpair() })
export const call = client.call

async function applyKeys(k: SourceKeys): Promise<void> {
  const s = useStore.getState()
  s.setFinnhubKey(k.finnhub)
  await saveAlpacaKeys(k.alpaca)
  const source = (['alpaca', 'yahoo', 'none'] as StockSource[]).find((v) => v === k.stockSource)
  // No source (unpaired, or none chosen on the PC yet): the start window asks again.
  if (source) s.setStockSource(source, k.yahooExtra === true)
  else useStore.setState({ stockSource: null, yahooExtra: false })
}

/** "Pixel 8" from the WebView's user agent, so the PC's device list shows something recognizable. */
const deviceName = () => /Android [\d.]+; ([^;)]+)/.exec(navigator.userAgent)?.[1]?.replace(/\s*Build\/.*$/, '').trim() || 'Android'

/** Asks the PC whether it is there; fetches the stock keys again when they changed on the PC. */
export async function hello(): Promise<void> {
  const p = await load()
  if (!p) return usePcStatus.setState({ state: 'none' })
  let reached = false
  try {
    const res = (await call('hello')) as { keysVersion: string }
    if (res.keysVersion !== p.keysVersion) {
      await applyKeys((await call('keys')) as SourceKeys)
      const now = await load()
      if (now) await save({ ...now, keysVersion: res.keysVersion })
    }
    reached = true
    usePcStatus.setState({ state: 'online', pcName: p.pcName, lastSeen: Date.now() })
    await syncWithPc(p.pcId, call)
    usePcStatus.setState({ syncFailed: false })
  } catch (e) {
    const msg = (e as Error).message
    if (/removed|not-paired/.test(msg)) usePcStatus.setState({ state: 'none' })
    // Answered hello, then the sync failed (window busy, bad reply): the PC is there, the sync is what went wrong.
    // 'bad-request': this phone builds its requests itself, so a PC refusing one is an older version (it does not know pin:<symbol>).
    else if (reached && msg !== 'offline') usePcStatus.setState({ syncFailed: /sync-format|bad-request/.test(msg) ? 'format' : true })
    else usePcStatus.setState({ state: 'offline', pcName: p.pcName })
  }
}

/** Scanned or pasted code: a new pairing, or for the PC already paired just its new addresses. */
export async function pairWith(code: PairingCode): Promise<void> {
  const p = await load()
  // The known PC's new addresses go in front of the old ones, never instead: a link with this PC's id and wrong
  // addresses (anyone can send one) must not cut the phone off. Only answers sealed with the device key count anyway.
  if (p?.pcId === code.pc) await save({ ...p, addrs: [...new Set([...code.addrs, ...p.addrs])].slice(0, 8), port: code.port })
  else {
    const { keys } = await client.pair(code, deviceName())
    await applyKeys(keys)
  }
  await hello()
}

/** Ends the pairing on this phone: the stock keys came from the PC, so they go too; the start window asks again. */
export async function unpair(): Promise<void> {
  await KandleNative.secureRemove({ name: SECURE })
  await applyKeys({ finnhub: '', alpaca: null, stockSource: null, yahooExtra: false })
  resetSync()
  usePcStatus.setState({ state: 'none', pcName: '', lastSeen: null, syncFailed: false })
}

/**
 * A kandleos: link opened from outside (the phone's camera app or Google Lens scanned the PC's code). Anyone can
 * send such a link, and the name in it is the sender's choice: pairing waits for the user's yes, and a link to another
 * PC says that it replaces the current pairing.
 */
async function openLink(url: string): Promise<void> {
  const code = decodePairing(url)
  if (!code) return
  const p = await load()
  const question = !p
    ? t('Mit dem PC „{name}“ koppeln? Watchlist, Zeichnungen und Alarme werden dann mit ihm abgeglichen.', { name: code.name })
    : p.pcId === code.pc
      ? t('Neue Adressen für den PC „{name}“ übernehmen?', { name: p.pcName })
      : t('Das Handy ist mit „{current}“ gekoppelt. Stattdessen mit „{name}“ koppeln? Watchlist, Zeichnungen und Alarme gehen dann an diesen PC. Koppel nur mit Codes, die dein eigener PC gerade anzeigt.', { current: p.pcName, name: code.name })
  if (!(await ask(question, t('Koppeln'), p && p.pcId !== code.pc ? { danger: true } : undefined))) return
  try {
    await pairWith(code)
    tell(t('Mit „{name}“ gekoppelt.', { name: code.name }))
  } catch (e) {
    tell((e as Error).message === 'offline' ? t('PC nicht erreichbar, oder der Code ist abgelaufen bzw. schon benutzt. Ist das Handy im selben WLAN oder im VPN? Blockt eine Firewall am PC (z. B. Portmaster) die Verbindung?') : (e as Error).message)
  }
}

/** Hello (and sync) at start, every few minutes while in front, when the app comes back, and 5 s after a change. */
export function startLink(): () => void {
  void hello()
  let soon = 0
  const stopStamping = startStamping(() => {
    clearTimeout(soon)
    soon = window.setTimeout(() => usePcStatus.getState().state !== 'none' && void hello(), 5000)
  })
  const id = setInterval(() => document.visibilityState === 'visible' && void hello(), HELLO_MS)
  const resume = CapApp.addListener('resume', () => void hello())
  const opened = CapApp.addListener('appUrlOpen', ({ url }) => void openLink(url))
  void CapApp.getLaunchUrl().then((l) => {
    if (l?.url) void openLink(l.url)
  })
  return () => {
    stopStamping()
    clearTimeout(soon)
    clearInterval(id)
    void resume.then((h) => h.remove())
    void opened.then((h) => h.remove())
  }
}
