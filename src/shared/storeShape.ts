// The stored state's outline, checked before the app takes it in (a backup on import, the store file at start).
// Only what the app would trip over right away: a field that is there must have the right kind. Missing fields are
// fine, merge fills them in; the content of single entries (alarms, drawings) is checked where it is used.
import { isObj } from './types.ts'

/** The store version this app writes (useStore.ts persist); a newer one belongs to a newer app. */
export const STORE_VERSION = 8

const str = (v: unknown): boolean => typeof v === 'string'
const strs = (v: unknown): boolean => Array.isArray(v) && v.every(str)
const objs = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.every(isObj)

const RULES: Record<string, (v: unknown) => boolean> = {
  symbol: str,
  timeframe: str,
  activeTab: str,
  language: str,
  watchlist: strs,
  folders: (v) => objs(v) && v.every((f) => strs(f.symbols)),
  tabs: (v) => objs(v) && v.every((t) => str(t.symbol)),
  drawings: (v) => isObj(v) && Object.values(v).every(objs),
  charts: objs,
  names: isObj,
  forecastView: isObj,
  forecastRun: isObj,
  agentsConfig: isObj,
  eventFilters: isObj,
  sync: isObj
}

export function storeShapeOk(state: unknown, version: unknown): boolean {
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0 || version > STORE_VERSION) return false
  return isObj(state) && Object.entries(RULES).every(([k, ok]) => state[k] === undefined || ok(state[k]))
}
