// Glue between the store and the sync rules in shared/sync.ts, for both sides: stamping local changes, the PC's
// answer to a phone, and the phone applying the PC's answer.
import { t } from '../../../shared/i18n'
import {
  answerSync,
  checkSyncReply,
  checkSyncRequest,
  emptySync,
  receiveSync,
  stampChanges,
  unitsOf,
  type SyncReply,
  type SyncSlice,
  type SyncState,
  type Units
} from '../../../shared/sync'
import { useStore } from '../store/useStore'

const sliceOfStore = (): SyncSlice => {
  const s = useStore.getState()
  return { folders: s.folders, names: s.names, tabs: s.tabs, drawings: s.drawings, charts: s.charts, indicators: s.indicators, alarms: s.alarms }
}

const same = (a: Units, b: Units) => {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}

/** Slice and bookkeeping in one write, so the stamper never mistakes a sync result for a local edit. */
function apply(next: SyncSlice, sync: SyncState): void {
  const s = useStore.getState()
  const tabs = next.tabs.length ? next.tabs : s.tabs
  // The active tab is per device; if the other side closed it, show the first one.
  const active = tabs.find((tb) => tb.id === s.activeTab) ?? tabs[0]
  useStore.setState({ ...next, tabs, sync, activeTab: active.id, symbol: active.symbol, timeframe: active.timeframe, range: active.range })
}

/** Stamps what changed since the last look; true when something did. */
function stampNow(): boolean {
  const s = useStore.getState()
  const units = unitsOf(sliceOfStore())
  if (same(units, s.sync.seen)) return false
  useStore.setState({ sync: { ...s.sync, stamps: stampChanges(s.sync.seen, units, s.sync.stamps, Date.now()), seen: units } })
  return true
}

/** Watches the synced parts of the store; `onLocalChange` runs after the user changed something. */
export function startStamping(onLocalChange?: () => void): () => void {
  let timer = 0
  stampNow()
  const unsub = useStore.subscribe((st, prev) => {
    const synced: (keyof SyncSlice)[] = ['folders', 'names', 'tabs', 'drawings', 'charts', 'indicators', 'alarms']
    if (synced.every((k) => st[k] === prev[k])) return
    clearTimeout(timer)
    timer = window.setTimeout(() => stampNow() && onLocalChange?.(), 500)
  })
  return () => {
    clearTimeout(timer)
    unsub()
  }
}

/** PC: a phone's sync request (forwarded by main/link.ts), merged into this store; returns the answer. */
export function answerPhone(device: string, raw: unknown): SyncReply {
  const req = checkSyncRequest(raw)
  if (!req) throw new Error('bad-request')
  stampNow()
  const out = answerSync(sliceOfStore(), useStore.getState().sync, device, req, Date.now(), {
    fromPhone: t('Tab vom Handy'),
    clash: ' ' + t('(Handy)')
  })
  apply(out.slice, out.sync)
  return out.reply
}

/** PC: a removed phone's base goes too, so pairing it again starts with a first sync. */
export function forgetPartner(id: string): void {
  const { sync } = useStore.getState()
  const { [id]: _b, ...bases } = sync.bases
  useStore.setState({ sync: { ...sync, bases } })
}

/** Phone: after unpairing, nothing of the old PC's sync state is kept. */
export function resetSync(): void {
  useStore.setState({ sync: emptySync() })
}

let running: Promise<void> | null = null
let firstNotice = false

/** Phone: one sync with the PC; a second call while one runs waits for it. */
export function syncWithPc(pcId: string, call: (op: string, args: unknown) => Promise<unknown>): Promise<void> {
  running ??= (async () => {
    try {
      stampNow()
      const st = useStore.getState().sync
      const sent = unitsOf(sliceOfStore())
      const baseId = st.bases[pcId]?.[0]?.id ?? null
      const s = useStore.getState()
      // Once per app start, not again on every retry while the PC is unreachable.
      if (!baseId && !firstNotice && s.tabs.some((tb) => Object.entries(s.drawings).some(([k, list]) => k.startsWith(tb.id + ':') && list.length))) {
        firstNotice = true
        alert(t('Beim ersten Abgleich übernimmt das Handy die Tabs vom PC. Deine Handy-Tabs mit Zeichnungen werden als Chart-Stände „Tab vom Handy“ gespeichert.'))
      }
      const reply = checkSyncReply(await call('sync', { units: sent, stamps: st.stamps, phoneNow: Date.now(), baseId }))
      if (!reply) throw new Error('bad-reply')
      const out = receiveSync(sliceOfStore(), useStore.getState().sync, pcId, sent, reply, Date.now())
      apply(out.slice, out.sync)
    } finally {
      running = null
    }
  })()
  return running
}
