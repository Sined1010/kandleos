import { app, safeStorage } from 'electron'
import { readFileSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AlpacaKeys } from '../data/alpaca'

// Keys live apart from the portable store file, encrypted for this OS user (DPAPI on Windows, Secret
// Service/KWallet on Linux). The window only learns whether Alpaca keys are set.
// Names are relative to userData (the TradingAgents keys use 'agents/…').
const file = (name: string): string => join(app.getPath('userData'), name)

export async function save(encrypted: string, plain: string, value: string): Promise<void> {
  await rm(file(encrypted), { force: true })
  await rm(file(plain), { force: true })
  if (!value) return
  if (safeStorage.isEncryptionAvailable()) await writeFile(file(encrypted), safeStorage.encryptString(value))
  // shortcut: without an OS keyring (some Linux setups) the key is plain text readable only by this user; install gnome-keyring/KWallet to get encryption.
  else await writeFile(file(plain), value, { mode: 0o600 })
}

export function read(encrypted: string, plain: string): string | null {
  try {
    return safeStorage.decryptString(readFileSync(file(encrypted)))
  } catch {
    try {
      return readFileSync(file(plain), 'utf8')
    } catch {
      return null
    }
  }
}

export const finnhubKey = (): string => read('finnhub-key.bin', 'finnhub-key.txt') ?? ''

/** Stores the key (empty removes it); the caller has checked it against FINNHUB_KEY_RE. */
export const saveFinnhubKey = (key: string): Promise<void> => save('finnhub-key.bin', 'finnhub-key.txt', key)

export function alpacaKeysFromDisk(): AlpacaKeys | null {
  try {
    return JSON.parse(read('alpaca-key.bin', 'alpaca-key.json') ?? 'null')
  } catch {
    return null
  }
}

export const saveAlpacaKeysToDisk = (k: AlpacaKeys | null): Promise<void> =>
  save('alpaca-key.bin', 'alpaca-key.json', k ? JSON.stringify(k) : '')
