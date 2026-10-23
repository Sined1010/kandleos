// The backup file (Settings → Back up data): store, saved analyses and, only with a password, the API keys.
// A backup may come from someone else, so everything read from it is checked here before backup.ts writes it.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import type { SavedAnalysis } from './agents'
import { keyEnvFor, PROVIDERS, type ProviderId } from '../shared/agents.ts'
import { t } from '../shared/i18n.ts'
import { ALPACA_KEY_RE, FINNHUB_KEY_RE, SYMBOL_RE } from '../shared/types.ts'

export const MAX_BACKUP_BYTES = 50 * 1024 * 1024

export interface BackupKeys {
  finnhub?: string
  alpaca?: { id: string; secret: string }
  /** Provider and FRED keys of the comprehensive analysis, by key name (shared/agents.ts). */
  agents?: Record<string, string>
}

/** Keys encrypted with a password: scrypt derives the AES-256-GCM key, the tag detects a wrong password. */
export interface SealedKeys {
  kdf: 'scrypt'
  n: number
  r: number
  p: number
  salt: string
  iv: string
  tag: string
  data: string
}

export interface Backup {
  app: 'KandleOS'
  format: 1
  appVersion: string
  exportedAt: string
  /** The persisted store as zustand writes it ({ state, version }); null if nothing was saved yet. */
  store: { state: Record<string, unknown>; version: number } | null
  analyses: SavedAnalysis[]
  keys: SealedKeys | null
}

// Fixed cost: an imported file cannot pick parameters that make deriving the key hang.
const N = 2 ** 15
const R = 8
const P = 1
const derive = (password: string, salt: Buffer): Buffer =>
  scryptSync(password.normalize('NFC'), salt, 32, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 })

export const MIN_PASSWORD = 8

export function sealKeys(keys: BackupKeys, password: string): SealedKeys {
  if (password.length < MIN_PASSWORD) throw new Error(t('Das Passwort muss mindestens {n} Zeichen haben.', { n: String(MIN_PASSWORD) }))
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', derive(password, salt), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(keys), 'utf8'), cipher.final()])
  const b64 = (b: Buffer) => b.toString('base64')
  return { kdf: 'scrypt', n: N, r: R, p: P, salt: b64(salt), iv: b64(iv), tag: b64(cipher.getAuthTag()), data: b64(data) }
}

/** Decrypts and checks the keys; throws on a wrong password or invalid content. */
export function openKeys(sealed: SealedKeys, password: string): BackupKeys {
  let plain: string
  try {
    const decipher = createDecipheriv('aes-256-gcm', derive(password, Buffer.from(sealed.salt, 'base64')), Buffer.from(sealed.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'))
    plain = Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    throw new Error(t('Falsches Passwort'))
  }
  return checkKeys(JSON.parse(plain))
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const fail = (): never => {
  throw new Error(t('Keine gültige KandleOS-Sicherung'))
}

/** Same rules as entering the keys by hand (index.ts, alpaca.ts, agents.ts). */
export function checkKeys(v: unknown): BackupKeys {
  if (!isObject(v)) return fail()
  const out: BackupKeys = {}
  if (v.finnhub !== undefined) {
    if (typeof v.finnhub !== 'string' || !v.finnhub || !FINNHUB_KEY_RE.test(v.finnhub)) return fail()
    out.finnhub = v.finnhub
  }
  if (v.alpaca !== undefined) {
    const a = v.alpaca
    if (!isObject(a) || typeof a.id !== 'string' || typeof a.secret !== 'string') return fail()
    if (!ALPACA_KEY_RE.test(a.id) || !ALPACA_KEY_RE.test(a.secret)) return fail()
    out.alpaca = { id: a.id, secret: a.secret }
  }
  if (v.agents !== undefined) {
    if (!isObject(v.agents)) return fail()
    out.agents = {}
    for (const [name, value] of Object.entries(v.agents)) {
      if (!keyEnvFor(name) || typeof value !== 'string' || !/^[\x21-\x7e]{1,300}$/.test(value)) return fail()
      out.agents[name] = value
    }
  }
  return out
}

const SEALED_FIELDS = ['salt', 'iv', 'tag', 'data'] as const

/** A saved analysis rebuilt from known fields only; null if it does not look like one. */
export function checkAnalysis(v: unknown): SavedAnalysis | null {
  if (!isObject(v)) return null
  const { id, symbol, ticker, date, createdAt, durationSec, provider, deepModel, quickModel, analysts, rating, reports, stats } = v
  const ok =
    typeof id === 'string' &&
    // Becomes the file name: only the format runAgents itself uses.
    /^\d{4}-\d{2}-\d{2}_\d{1,16}$/.test(id) &&
    typeof symbol === 'string' &&
    SYMBOL_RE.test(symbol) &&
    str(ticker, 40) &&
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    num(createdAt) &&
    num(durationSec) &&
    PROVIDERS.some((p) => p.id === provider) &&
    str(deepModel, 80) &&
    str(quickModel, 80) &&
    Array.isArray(analysts) &&
    analysts.length <= 20 &&
    analysts.every((a) => str(a, 40)) &&
    str(rating, 40) &&
    isObject(reports) &&
    Object.entries(reports).every(([k, r]) => k.length <= 40 && str(r, 500_000)) &&
    isObject(stats) &&
    num(stats.calls) &&
    num(stats.tokensIn) &&
    num(stats.tokensOut)
  if (!ok) return null
  return {
    id,
    symbol,
    ticker,
    date,
    createdAt,
    durationSec,
    provider: provider as ProviderId,
    deepModel,
    quickModel,
    analysts: analysts as string[],
    rating,
    reports: { ...(reports as Record<string, string>) },
    stats: { calls: stats.calls as number, tokensIn: stats.tokensIn as number, tokensOut: stats.tokensOut as number }
  }
}

/** Parses and checks a backup file. Invalid analyses are dropped; anything else invalid rejects the file. */
export function parseBackup(text: string): Backup {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    return fail()
  }
  if (!isObject(v) || v.app !== 'KandleOS' || v.format !== 1) return fail()
  const store = v.store
  if (store !== null && !(isObject(store) && isObject(store.state) && Number.isInteger(store.version))) return fail()
  if (!Array.isArray(v.analyses) || v.analyses.length > 10_000) return fail()
  const keys = v.keys
  if (keys !== null) {
    if (!isObject(keys) || keys.kdf !== 'scrypt' || keys.n !== N || keys.r !== R || keys.p !== P) return fail()
    if (!SEALED_FIELDS.every((f) => typeof keys[f] === 'string' && /^[A-Za-z0-9+/=]{1,200000}$/.test(keys[f] as string))) return fail()
  }
  return {
    app: 'KandleOS',
    format: 1,
    appVersion: str(v.appVersion, 40) ? v.appVersion : '',
    exportedAt: str(v.exportedAt, 40) ? v.exportedAt : '',
    store: store as Backup['store'],
    analyses: v.analyses.map(checkAnalysis).filter((a): a is SavedAnalysis => a !== null),
    keys: keys as SealedKeys | null
  }
}
