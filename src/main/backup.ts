// Export and import of the user's data (Settings → Back up data). The window never picks a path or sees a key:
// main shows the file dialogs, reads the keys itself and only reports a summary back.
import { app, BrowserWindow, dialog, type WebContents } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { allAnalyses, readKeys, saveAnalysis, writeKeys } from './agents'
import { alpacaKeys, saveAlpacaKeys } from './alpaca'
import { MAX_BACKUP_BYTES, MIN_PASSWORD, openKeys, parseBackup, sealKeys, type Backup, type BackupKeys } from './backupFormat'
import { finnhubKey, saveFinnhubKey } from './stocks'
import { t } from '../shared/i18n'

const FILTERS = [{ name: 'KandleOS', extensions: ['json'] }]

function currentKeys(): BackupKeys {
  const keys: BackupKeys = {}
  const finnhub = finnhubKey()
  if (finnhub) keys.finnhub = finnhub
  const alpaca = alpacaKeys()
  if (alpaca) keys.alpaca = alpaca
  const agents = readKeys()
  if (Object.keys(agents).length) keys.agents = agents
  return keys
}

/** Writes a backup file the user picks; resolves to its path, or null if the dialog was cancelled. */
export async function exportBackup(wc: WebContents, store: string | null, opts: unknown): Promise<string | null> {
  const { withKeys, password } = (opts ?? {}) as { withKeys?: unknown; password?: unknown }
  if (withKeys === true && (typeof password !== 'string' || password.length < MIN_PASSWORD))
    throw new Error(t('Das Passwort muss mindestens {n} Zeichen haben.', { n: String(MIN_PASSWORD) }))
  const keys = withKeys === true ? currentKeys() : null
  const backup: Backup = {
    app: 'KandleOS',
    format: 1,
    appVersion: app.getVersion(),
    exportedAt: new Date().toISOString(),
    store: store ? JSON.parse(store) : null,
    analyses: (await allAnalyses()) as Backup['analyses'],
    keys: keys && Object.keys(keys).length ? sealKeys(keys, password as string) : null
  }
  const day = backup.exportedAt.slice(0, 10)
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(wc)!, {
    title: t('Daten exportieren'),
    defaultPath: `KandleOS-Sicherung-${day}.json`,
    filters: FILTERS
  })
  if (canceled || !filePath) return null
  await writeFile(filePath, JSON.stringify(backup, null, 1), 'utf8')
  return filePath
}

export interface BackupSummary {
  appVersion: string
  exportedAt: string
  storeVersion: number | null
  symbols: number
  analyses: number
  hasKeys: boolean
}

// The file picked by pickBackup, waiting for the user to confirm (and enter the password) in applyBackup.
let pending: Backup | null = null

/** Lets the user pick a backup, checks it and returns what it contains; null if the dialog was cancelled. */
export async function pickBackup(wc: WebContents): Promise<BackupSummary | null> {
  pending = null
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(wc)!, {
    title: t('Daten importieren'),
    filters: FILTERS,
    properties: ['openFile']
  })
  if (canceled || !filePaths[0]) return null
  if ((await stat(filePaths[0])).size > MAX_BACKUP_BYTES) throw new Error(t('Keine gültige KandleOS-Sicherung'))
  const backup = parseBackup(await readFile(filePaths[0], 'utf8'))
  pending = backup
  const folders = backup.store?.state.folders
  const symbols = Array.isArray(folders)
    ? new Set(folders.flatMap((f) => (Array.isArray(f?.symbols) ? f.symbols : []))).size
    : 0
  return {
    appVersion: backup.appVersion,
    exportedAt: backup.exportedAt,
    storeVersion: backup.store?.version ?? null,
    symbols,
    analyses: backup.analyses.length,
    hasKeys: backup.keys !== null
  }
}

/**
 * Applies the picked backup: keys (only with the right password; empty skips them), analyses, and returns the
 * store text for index.ts to write. Nothing is written if the password is wrong.
 */
export async function applyBackup(password: unknown): Promise<string | null> {
  const backup = pending
  if (!backup) throw new Error(t('Keine Sicherung ausgewählt'))
  const keys = backup.keys && typeof password === 'string' && password ? openKeys(backup.keys, password) : null
  pending = null
  if (keys?.finnhub) await saveFinnhubKey(keys.finnhub)
  if (keys?.alpaca) await saveAlpacaKeys(keys.alpaca)
  if (keys?.agents) await writeKeys({ ...readKeys(), ...keys.agents })
  for (const a of backup.analyses) await saveAnalysis(a)
  return backup.store ? JSON.stringify(backup.store) : null
}
