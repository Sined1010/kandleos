// Sync between PC and phone (Android Abschnitt 2), as pure functions. The store is cut into small units with a stable
// key and a JSON value; each device remembers the units it last agreed on with its partner (the base) and when it
// last changed each unit (stamps). Comparing base, mine and theirs per unit shows who changed what; nothing in the
// store's actions has to know about sync.
import type { Alarm } from './alarms.ts'
import { checkDrawing } from './drawings.ts'
import { TIMEFRAMES, type Timeframe } from './types.ts'
import type { ChartTab, Drawing, Folder, Indicators } from '../renderer/src/store/useStore.ts'
import type { SavedChart } from '../renderer/src/lib/charts.ts'

export type UnitKey = string
/** Unit key → stable JSON of the unit. */
export type Units = Record<UnitKey, string>
export type Stamps = Record<UnitKey, number>

export interface SyncSlice {
  folders: Folder[]
  names: Record<string, string>
  tabs: ChartTab[]
  drawings: Record<string, Drawing[]>
  charts: SavedChart[]
  indicators: Indicators
  alarms: Alarm[]
}

/** JSON with object keys sorted, so equal content is an equal string. */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']'
  if (v && typeof v === 'object')
    return (
      '{' +
      Object.keys(v)
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stable((v as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    )
  return JSON.stringify(v)
}

/**
 * Keys: folder:<id> (name) · entry:<folderId>:<symbol> · order:folders · order:<folderId> · name:<symbol> ·
 * tab:<id> · order:tabs · drawing:<tabId>:<symbol>:<id> · chart:<id> · indicators · alarm:<id>.
 * Left out on purpose: whether a folder is collapsed and how far an alarm is checked (both per device).
 */
export function unitsOf(s: SyncSlice): Units {
  const u: Units = {}
  u['order:folders'] = stable(s.folders.map((f) => f.id))
  for (const f of s.folders) {
    u[`folder:${f.id}`] = stable({ name: f.name })
    u[`order:${f.id}`] = stable(f.symbols)
    for (const sym of f.symbols) u[`entry:${f.id}:${sym}`] = '1'
  }
  for (const [sym, name] of Object.entries(s.names)) u[`name:${sym}`] = stable(name)
  u['order:tabs'] = stable(s.tabs.map((t) => t.id))
  for (const { id, ...tab } of s.tabs) u[`tab:${id}`] = stable(tab)
  for (const [key, list] of Object.entries(s.drawings)) for (const d of list) u[`drawing:${key}:${d.id}`] = stable(d)
  for (const c of s.charts) u[`chart:${c.id}`] = stable(c)
  u.indicators = stable(s.indicators)
  for (const { checkedUntil: _, ...a } of s.alarms) u[`alarm:${a.id}`] = stable(a)
  return u
}

/** Gives every unit that is new, changed or gone since `prev` the time `now`. */
export function stampChanges(prev: Units, next: Units, stamps: Stamps, now: number): Stamps {
  const out = { ...stamps }
  for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) if (prev[k] !== next[k]) out[k] = now
  return out
}

const parse = <T>(s: string | undefined, fallback: T): T => {
  try {
    return s === undefined ? fallback : JSON.parse(s)
  } catch {
    return fallback
  }
}

/** Order lists keep only what exists and append what is missing, so no entry is ever lost or doubled. */
function fixOrder(u: Units, key: string, ids: string[]): void {
  const want = new Set(ids)
  const list = parse<string[]>(u[key], []).filter((id, i, all) => want.has(id) && all.indexOf(id) === i)
  u[key] = stable([...list, ...ids.filter((id) => !list.includes(id))])
}

/**
 * Three-way merge per unit. Only one side changed → that side. Both changed → the later stamp (theirs moved into my
 * clock with `offset`); a delete never beats a change, so nothing disappears silently. Afterwards a child that
 * survived (symbol, drawing) brings back a deleted parent (folder, tab), and order lists are made whole.
 */
export function mergeUnits(base: Units, mine: Units, theirs: Units, stampsMine: Stamps, stampsTheirs: Stamps, offset: number): Units {
  const out: Units = {}
  for (const k of new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])) {
    const b = base[k], m = mine[k], t = theirs[k]
    let v: string | undefined
    if (m === t || t === b) v = m
    else if (m === b) v = t
    else if (m === undefined) v = t
    else if (t === undefined) v = m
    else v = (stampsTheirs[k] ?? 0) + offset > (stampsMine[k] ?? 0) ? t : m
    if (v !== undefined) out[k] = v
  }
  return normalize(out, [mine, theirs, base])
}

/** A surviving child brings back its deleted parent (taken from `sources`); order lists are made whole. */
function normalize(out: Units, sources: Units[]): Units {
  const restore = (key: string) => {
    if (!out[key]) {
      const v = sources.map((u) => u[key]).find((x) => x !== undefined)
      if (v !== undefined) out[key] = v
    }
  }
  for (const k of Object.keys(out)) {
    if (k.startsWith('entry:')) restore(`folder:${k.split(':')[1]}`)
    else if (k.startsWith('drawing:')) restore(`tab:${k.split(':')[1]}`)
  }
  const folders = Object.keys(out).filter((k) => k.startsWith('folder:')).map((k) => k.slice(7))
  fixOrder(out, 'order:folders', folders)
  for (const k of Object.keys(out)) if (k.startsWith('order:') && k !== 'order:folders' && k !== 'order:tabs' && !folders.includes(k.slice(6))) delete out[k]
  for (const f of folders) {
    const prefix = `entry:${f}:`
    fixOrder(out, `order:${f}`, Object.keys(out).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)))
  }
  fixOrder(out, 'order:tabs', Object.keys(out).filter((k) => k.startsWith('tab:')).map((k) => k.slice(4)))
  return out
}

const norm = (s: string) => s.trim().toLocaleLowerCase()
// The start folders carry the language of the install (an older PC has "Krypto", a new phone "Crypto"): one folder.
const SAME_FOLDER: Record<string, string> = { krypto: 'crypto', aktien: 'stocks' }
const folderName = (s: string) => SAME_FOLDER[norm(s)] ?? norm(s)

// The id follows from tab and symbol, so a retried first sync recognizes the chart it already made.
const chartFromTab = (s: SyncSlice, tab: ChartTab, drawings: Drawing[], name: string): SavedChart => ({
  id: `tab-${tab.id}-${tab.symbol}`,
  name,
  symbol: tab.symbol,
  timeframe: tab.timeframe,
  drawings,
  indicators: s.indicators,
  savedAt: Date.now()
})

/** Drawings of a tab, over all symbols it showed (keys "<tabId>:<symbol>"). */
const drawingsOf = (s: SyncSlice, tabId: string) => Object.entries(s.drawings).filter(([k]) => k.startsWith(`${tabId}:`))

/**
 * The very first sync after pairing, when there is no common base yet: folders meet by id or name and symbols by
 * ticker, names/indicators/tabs come from the PC, the phone's tabs with drawings are kept as saved charts,
 * saved charts and alarms of both are kept (a clashing chart name per symbol gets `clash` appended).
 */
export function firstMerge(pc: SyncSlice, phone: SyncSlice, tabLabel: string, clash: string): { slice: SyncSlice; savedTabs: number } {
  const folders = pc.folders.map((f) => ({ ...f, symbols: [...f.symbols] }))
  for (const f of phone.folders) {
    // Same id (synced before, base lost) or same name: one folder, nothing of the phone's is dropped.
    const same =
      folders.find((p) => p.id === f.id) ??
      folders.find((p) => norm(p.name) === norm(f.name)) ??
      folders.find((p) => folderName(p.name) === folderName(f.name))
    if (same) same.symbols.push(...f.symbols.filter((s) => !same.symbols.includes(s)))
    else folders.push({ ...f, symbols: [...f.symbols] })
  }
  const charts = [...pc.charts]
  for (const c of phone.charts) {
    if (charts.some((p) => p.id === c.id)) continue
    const taken = charts.some((p) => p.symbol === c.symbol && norm(p.name) === norm(c.name))
    charts.push(taken ? { ...c, name: c.name + clash } : c)
  }
  let savedTabs = 0
  for (const tab of phone.tabs) {
    for (const [key, list] of drawingsOf(phone, tab.id)) {
      const c = chartFromTab(phone, { ...tab, symbol: key.slice(tab.id.length + 1) }, list, tabLabel)
      if (!list.length || charts.some((p) => p.id === c.id)) continue
      charts.push(c)
      savedTabs++
    }
  }
  return {
    slice: {
      folders,
      names: { ...phone.names, ...pc.names },
      tabs: pc.tabs,
      drawings: pc.drawings,
      charts,
      indicators: pc.indicators,
      alarms: [...pc.alarms, ...phone.alarms.filter((a) => !pc.alarms.some((p) => p.id === a.id))]
    },
    savedTabs
  }
}

/** More tabs than allowed after a merge: the extra ones close; one with drawings is kept as a saved chart first. */
export function capTabs(s: SyncSlice, max: number, label: string): SyncSlice {
  if (s.tabs.length <= max) return s
  const drawings = { ...s.drawings }
  const charts = [...s.charts]
  for (const tab of s.tabs.slice(max))
    for (const [key, list] of drawingsOf(s, tab.id)) {
      const c = chartFromTab(s, { ...tab, symbol: key.slice(tab.id.length + 1) }, list, label)
      if (list.length && !charts.some((p) => p.id === c.id)) charts.push(c)
      delete drawings[key]
    }
  return { ...s, tabs: s.tabs.slice(0, max), drawings, charts }
}

const str = (v: unknown): v is string => typeof v === 'string'
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
/** Keeps `current`'s order for what is still there and appends the rest. */
const inOrder = <T extends { id: string }>(items: T[], current: T[]) =>
  [...items].sort((x, y) => {
    const i = current.findIndex((c) => c.id === x.id), j = current.findIndex((c) => c.id === y.id)
    return (i < 0 ? Infinity : i) - (j < 0 ? Infinity : j)
  })

/**
 * Units back to a slice. `keep` supplies what is per device (folder collapsed, alarm checked-until) and the order of
 * drawings, charts and alarms. Units that do not parse or lack their essential fields are skipped: they come from
 * the other device and must never break this one.
 */
export function sliceOf(u: Units, keep: SyncSlice): SyncSlice {
  const keys = Object.keys(u)
  const folders: Folder[] = parse<string[]>(u['order:folders'], [])
    .filter(str)
    .flatMap((id) => {
      const f = parse<unknown>(u[`folder:${id}`], null)
      if (!isObj(f) || !str(f.name)) return []
      const symbols = parse<string[]>(u[`order:${id}`], []).filter((sym) => str(sym) && u[`entry:${id}:${sym}`] !== undefined)
      return [{ id, name: f.name, symbols, collapsed: keep.folders.find((k) => k.id === id)?.collapsed ?? false }]
    })
  const names: Record<string, string> = {}
  for (const k of keys) if (k.startsWith('name:')) {
    const n = parse<unknown>(u[k], null)
    if (str(n)) names[k.slice(5)] = n
  }
  const tabs: ChartTab[] = parse<string[]>(u['order:tabs'], [])
    .filter(str)
    .flatMap((id) => {
      const t = parse<unknown>(u[`tab:${id}`], null)
      return isObj(t) && str(t.symbol) && TIMEFRAMES.includes(t.timeframe as Timeframe) ? [{ ...(t as unknown as Omit<ChartTab, 'id'>), id }] : []
    })
  const drawings: Record<string, Drawing[]> = {}
  for (const k of keys) if (k.startsWith('drawing:')) {
    const d = checkDrawing(parse<unknown>(u[k], null))
    if (!d || !k.endsWith(':' + d.id)) continue
    const key = k.slice(8, k.length - d.id.length - 1)
    ;(drawings[key] ??= []).push(d)
  }
  for (const key of Object.keys(drawings)) drawings[key] = inOrder(drawings[key], keep.drawings[key] ?? [])
  const charts = inOrder(
    keys.filter((k) => k.startsWith('chart:')).flatMap((k) => {
      const c = parse<unknown>(u[k], null)
      return isObj(c) && str(c.id) && str(c.name) && str(c.symbol) && TIMEFRAMES.includes(c.timeframe as Timeframe) && Array.isArray(c.drawings) && c.drawings.every(checkDrawing)
        ? [c as unknown as SavedChart]
        : []
    }),
    keep.charts
  )
  const indicators = parse<unknown>(u.indicators, null)
  const alarms = inOrder(
    keys.filter((k) => k.startsWith('alarm:')).flatMap((k) => {
      const a = parse<unknown>(u[k], null)
      if (!isObj(a) || !str(a.id) || !str(a.symbol) || typeof a.price !== 'number') return []
      const checkedUntil = keep.alarms.find((x) => x.id === a.id)?.checkedUntil
      return [{ ...(a as unknown as Alarm), ...(checkedUntil !== undefined && { checkedUntil }) }]
    }),
    keep.alarms
  )
  return { folders, names, tabs, drawings, charts, indicators: isObj(indicators) ? (indicators as unknown as Indicators) : keep.indicators, alarms }
}

/**
 * Puts a sync result onto the store as it is now: only what changed between the units sent (`from`) and the result
 * (`to`) is applied, so anything done locally meanwhile stays (and goes along with the next sync).
 */
export function applyUnits(current: SyncSlice, from: Units, to: Units): SyncSlice {
  const u = unitsOf(current)
  for (const k of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (from[k] === to[k]) continue
    if (to[k] === undefined) delete u[k]
    else u[k] = to[k]
  }
  return sliceOf(normalize(u, [to, from]), current)
}

/** What each device keeps for sync, in its store. */
export interface SyncState {
  /** When each unit last changed on this device (its own clock). */
  stamps: Stamps
  /** The units the stamps were last taken from. */
  seen: Units
  /**
   * Per partner (PC: device id, phone: PC id): the units both agreed on, newest first, each with an id. The PC keeps
   * the last few, because its answer may never reach the phone; the phone names the one it really has.
   */
  bases: Record<string, Base[]>
}
export interface Base {
  id: string
  units: Units
}
export const emptySync = (): SyncState => ({ stamps: {}, seen: {}, bases: {} })
/** Stamps of units that are gone: never compared again (a delete never beats a change), so they are dropped. */
const stampsOf = (stamps: Stamps, units: Units): Stamps => Object.fromEntries(Object.entries(stamps).filter(([k]) => Object.hasOwn(units, k)))
const KEEP_BASES = 3

// Same as MAX_TABS in the store (not imported: this file must run without the window).
const MAX_TABS = 3
const UNIT_KEY =
  /^(indicators|order:folders|order:tabs|(folder|order|name|tab|chart|alarm):[^:\s]{1,200}|entry:[^:\s]{1,200}:[^:\s]{1,40}|drawing:[^:\s]{1,200}:[^:\s]{1,40}:[^:\s]{1,200})$/
const MAX_UNITS = 100_000
const MAX_VALUE = 300_000

export interface SyncRequest {
  units: Units
  stamps: Stamps
  /** Phone clock when sending (ms); gives the clock offset. */
  phoneNow: number
  /** Id of the base the phone holds; null = never synced with this PC (first pairing or after a reinstall). */
  baseId: string | null
}
export interface SyncReply {
  units: Units
  /** In the PC's clock. */
  stamps: Stamps
  pcNow: number
  /** Id of the new common base. */
  baseId: string
}

const unitsOk = (v: unknown): v is Units =>
  isObj(v) && Object.keys(v).length <= MAX_UNITS && Object.entries(v).every(([k, x]) => UNIT_KEY.test(k) && str(x) && x.length <= MAX_VALUE)
const stampsOk = (v: unknown): v is Stamps =>
  isObj(v) && Object.keys(v).length <= MAX_UNITS && Object.values(v).every((x) => typeof x === 'number' && Number.isFinite(x))

/** What arrives from the phone, checked like any IPC input before it touches the store. */
export function checkSyncRequest(v: unknown): SyncRequest | null {
  if (!isObj(v) || !unitsOk(v.units) || !stampsOk(v.stamps) || typeof v.phoneNow !== 'number' || !Number.isFinite(v.phoneNow)) return null
  const baseId = typeof v.baseId === 'string' && v.baseId.length <= 100 ? v.baseId : null
  return { units: v.units, stamps: v.stamps, phoneNow: v.phoneNow, baseId }
}
export function checkSyncReply(v: unknown): SyncReply | null {
  if (!isObj(v) || !unitsOk(v.units) || !stampsOk(v.stamps) || typeof v.pcNow !== 'number' || !Number.isFinite(v.pcNow) || !str(v.baseId)) return null
  return { units: v.units, stamps: v.stamps, pcNow: v.pcNow, baseId: v.baseId }
}

/**
 * PC side of one sync with a phone: merge against the base the phone names, keep at most three tabs, and answer
 * with the result and its stamps in the PC's clock. Both sides then store the result as their common base.
 * Without a known base (first sync, or answers lost more often than bases are kept) firstMerge joins both sides
 * and deletes nothing: a unit missing on one side is never read as "deleted" without a base that shows it.
 */
export function answerSync(
  pc: SyncSlice,
  st: SyncState,
  device: string,
  req: SyncRequest,
  now: number,
  labels: { fromPhone: string; clash: string }
): { slice: SyncSlice; sync: SyncState; reply: SyncReply } {
  const pcUnits = unitsOf(pc)
  const pcStamps = stampChanges(st.seen, pcUnits, st.stamps, now)
  // phone clock + offset = PC clock (the request is a few ms old; that is far below any edit gap that matters).
  const offset = now - req.phoneNow
  const known = Array.isArray(st.bases[device]) ? st.bases[device] : []
  const base = req.baseId === null ? undefined : known.find((b) => b.id === req.baseId)
  const mergedSlice = base
    ? sliceOf(mergeUnits(base.units, pcUnits, req.units, pcStamps, req.stamps, offset), pc)
    : firstMerge(pc, sliceOf(req.units, pc), labels.fromPhone, labels.clash).slice
  const merged = unitsOf(capTabs(mergedSlice, MAX_TABS, labels.fromPhone))
  const stamps: Stamps = { ...pcStamps }
  for (const [k, s] of Object.entries(req.stamps)) if (s + offset > (stamps[k] ?? -Infinity)) stamps[k] = s + offset
  for (const k of Object.keys(merged)) stamps[k] ??= now
  const slice = applyUnits(pc, pcUnits, merged)
  const seen = unitsOf(slice)
  const baseId = `${now}-${crypto.randomUUID().slice(0, 8)}`
  return {
    slice,
    sync: { stamps: stampsOf(stamps, seen), seen, bases: { ...st.bases, [device]: [{ id: baseId, units: merged }, ...known].slice(0, KEEP_BASES) } },
    reply: { units: merged, stamps: stampsOf(stamps, merged), pcNow: now, baseId }
  }
}

/**
 * Phone side: apply the PC's answer to the store as it is now. What changed locally while the request was out is
 * kept and stamped, so it goes along with the next sync.
 */
export function receiveSync(phone: SyncSlice, st: SyncState, pcId: string, sent: Units, reply: SyncReply, now: number): { slice: SyncSlice; sync: SyncState } {
  const current = unitsOf(phone)
  const offset = reply.pcNow - now
  const stamps: Stamps = {}
  for (const [k, s] of Object.entries(reply.stamps)) stamps[k] = s - offset
  for (const k of new Set([...Object.keys(sent), ...Object.keys(current)])) if (sent[k] !== current[k]) stamps[k] = now
  const slice = applyUnits(phone, sent, reply.units)
  const seen = unitsOf(slice)
  return { slice, sync: { stamps: stampsOf(stamps, seen), seen, bases: { ...st.bases, [pcId]: [{ id: reply.baseId, units: reply.units }] } } }
}
