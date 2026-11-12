import { app, safeStorage } from 'electron'
import { readFileSync } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { AlpacaKeys } from '../data/alpaca'
import { writeFileAtomic } from './atomicFile'

// Keys live apart from the portable store file, encrypted for this OS user (DPAPI on Windows, Secret
// Service/KWallet on Linux). The window only learns whether Alpaca keys are set.
// Names are relative to userData (the TradingAgents keys use 'agents/…').
const file = (name: string): string => join(app.getPath('userData'), name)

export async function save(encrypted: string, plain: string, value: string): Promise<void> {
  // A file that cannot be decrypted now is kept aside, not overwritten or removed: it may hold keys a later start can
  // read again (an empty field in the settings may only mean the keyring is still locked).
  if (decryptFails(encrypted)) await rename(file(encrypted), file(encrypted + '.unreadable')).catch(() => {})
  if (!value) {
    await rm(file(encrypted), { force: true })
    await rm(file(plain), { force: true })
    return
  }
  // The new file first, in one step; only then the other variant goes. A crash never leaves no file at all.
  if (safeStorage.isEncryptionAvailable()) {
    await writeFileAtomic(file(encrypted), safeStorage.encryptString(value))
    await rm(file(plain), { force: true })
  } else {
    // shortcut: without an OS keyring (some Linux setups) the key is plain text readable only by this user; install gnome-keyring/KWallet to get encryption.
    await writeFileAtomic(file(plain), value)
    await rm(file(encrypted), { force: true })
  }
}

/**
 * The encrypted file is there but cannot be decrypted: on Linux the keyring may still be locked right after login,
 * or the data folder came from another PC. Not the same as "no file", or the next save would wipe what is in it.
 */
export class Unreadable extends Error {}

function decryptFails(encrypted: string): boolean {
  try {
    read(encrypted, '')
    return false
  } catch (e) {
    return e instanceof Unreadable
  }
}

export function read(encrypted: string, plain: string): string | null {
  let data: Buffer | undefined
  try {
    data = readFileSync(file(encrypted))
  } catch {
    // no encrypted file: maybe the plain one
  }
  if (data) {
    try {
      return safeStorage.decryptString(data)
    } catch {
      throw new Unreadable(encrypted)
    }
  }
  if (!plain) return null
  try {
    return readFileSync(file(plain), 'utf8')
  } catch {
    return null
  }
}

export function finnhubKey(): string {
  try {
    return read('finnhub-key.bin', 'finnhub-key.txt') ?? ''
  } catch {
    return ''
  }
}

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
