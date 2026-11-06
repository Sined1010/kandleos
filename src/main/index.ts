import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  agentsStatus,
  cancelAgents,
  installAgents,
  keyStatus,
  listAnalyses,
  ollamaModels,
  removeAgents,
  runAgents,
  setKey
} from './agents'
import icon from '../../resources/icon.png?asset'
import { setLang, t } from '../shared/i18n'
import { FINNHUB_KEY_RE } from '../shared/types'
import { VERSION_RE } from '../shared/version'
import { archive } from './archive'
import { applyBackup, exportBackup, pickBackup } from './backup'
import { forecast, modelReady } from './forecast'
import { alpacaHasKeys, setAlpacaKeys, useAlpacaKeyStore } from '../data/alpaca'
import { alpacaKeysFromDisk, finnhubKey, saveAlpacaKeysToDisk, saveFinnhubKey } from './keys'
import { configureLink, linkStatus, removeDevice, resumeLink, setLinkEnabled, setVpnHost, startPairing } from './link'
import { hiddenStart, keepRunning, notify, setAutostart, showWindow, syncTray } from './tray'
import {
  companyInfo,
  finnhubCheck,
  searchSymbols,
  setStockSource,
  stockCandles,
  stockQuotes,
  symbolName
} from '../data/stocks'

useAlpacaKeyStore(alpacaKeysFromDisk, saveAlpacaKeysToDisk)

// Pin the data folder: the installed app is named "KandleOS", the source checkout "kandleos", and on Linux
// those would be two different folders. All data (store, key, single-instance lock) lives here.
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', join(app.getPath('appData'), 'kandleos'))

const storeFile = (): string => join(app.getPath('userData'), 'kandleos-store.json')
let writeQueue = Promise.resolve()

ipcMain.on('app:language', (_e, lang) => setLang(lang))
// Also kept for the phone link, which hands the source choice to a paired phone.
let source: { stockSource: string | null; yahooExtra: boolean } = { stockSource: null, yahooExtra: false }
ipcMain.on('app:stock-source', (_e, s, yahooExtra) => {
  setStockSource(s, yahooExtra)
  source = { stockSource: typeof s === 'string' ? s : null, yahooExtra: yahooExtra === true }
})
// Phone access (link.ts). The phone gets the stock keys and source choice, never the LLM keys.
// The window (also when hidden) holds the store, so it answers sync; main only passes it on.
let linkReq = 0
const pendingLink = new Map<number, (r: { ok: boolean; res?: unknown; error?: string }) => void>()
ipcMain.on('link:reply', (_e, id, r) => {
  pendingLink.get(id)?.(r)
  pendingLink.delete(id)
})
configureLink({
  keys: () => ({ finnhub: finnhubKey(), alpaca: alpacaKeysFromDisk(), ...source }),
  forward: (op, args, device) =>
    new Promise((resolve, reject) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (op !== 'sync' || !win) return reject(new Error('unknown-op'))
      const id = ++linkReq
      const timer = setTimeout(() => {
        pendingLink.delete(id)
        reject(new Error('timeout'))
      }, 10_000)
      pendingLink.set(id, (r) => {
        clearTimeout(timer)
        if (r?.ok) resolve(r.res)
        else reject(new Error(r?.error ?? 'failed'))
      })
      win.webContents.send('link:request', { id, op, args, device })
    }),
  onError: (message) => {
    // With the window in view, the settings show the error; hidden (in the tray, started at login) only this does.
    if (!BrowserWindow.getAllWindows()[0]?.isVisible()) notify(t('Handy-Zugang funktioniert nicht'), message)
    syncTray()
  }
})
ipcMain.handle('link:status', () => linkStatus())
ipcMain.handle('link:set-enabled', async (_e, on) => {
  const status = await setLinkEnabled(on)
  syncTray()
  return status
})
ipcMain.handle('link:start-pairing', () => startPairing())
ipcMain.handle('link:remove', (_e, id) => removeDevice(id))
ipcMain.handle('link:set-vpn-host', (_e, host) => setVpnHost(host))
ipcMain.handle('link:set-autostart', async (_e, on) => {
  await setAutostart(on)
  return linkStatus()
})
ipcMain.on('app:notify', (_e, title, body) => notify(title, body))
// Alpaca keys only go in; the window learns whether they are set.
ipcMain.handle('alpaca:has-keys', () => alpacaHasKeys())
ipcMain.handle('alpaca:set-keys', (_e, id, secret) => setAlpacaKeys(id, secret))
ipcMain.on('store:get', (e) => (e.returnValue = readStore()))
// After an import the old page would save its state back over the imported store; ignore it until the reload.
let storeLocked = false
ipcMain.handle('store:set', (_e, data: unknown) => {
  if (typeof data !== 'string' || storeLocked) return
  // Serialize writes and swap atomically so a crash mid-write never truncates the store.
  writeQueue = writeQueue
    .then(async () => {
      await writeFile(storeFile() + '.tmp', data, 'utf8')
      await rename(storeFile() + '.tmp', storeFile())
    })
    .catch((err) => console.error('Speichern fehlgeschlagen:', err))
  return writeQueue
})
// The Finnhub key is stored apart from the store file (stocks.ts); the window needs it for the live stream.
ipcMain.on('key:get', (e) => (e.returnValue = finnhubKey()))
ipcMain.handle('key:set', async (_e, key: unknown) => {
  if (typeof key === 'string' && FINNHUB_KEY_RE.test(key)) await saveFinnhubKey(key)
})
// Backup file (backup.ts): main shows the dialogs and handles the keys; the window gets a summary only.
const readStore = (): string | null => {
  try {
    return readFileSync(storeFile(), 'utf8')
  } catch {
    return null
  }
}
ipcMain.handle('backup:export', async (e, opts) => {
  await writeQueue
  return exportBackup(e.sender, readStore(), opts)
})
ipcMain.handle('backup:pick', (e) => pickBackup(e.sender))
ipcMain.handle('backup:apply', async (e, password) => {
  const store = await applyBackup(password)
  storeLocked = true
  await writeQueue
  if (store) {
    try {
      await writeFile(storeFile() + '.tmp', store, 'utf8')
      await rename(storeFile() + '.tmp', storeFile())
    } catch (err) {
      // No reload comes, so the page must be able to save again.
      storeLocked = false
      throw err
    }
  }
  // The new page reads the imported store (and keys) on start.
  e.sender.once('did-finish-load', () => (storeLocked = false))
  e.sender.reload()
})
ipcMain.handle('stocks:candles', (_e, symbol, tf, key, extended, older) => stockCandles(symbol, tf, key, extended, older))
ipcMain.handle('stocks:quotes', (_e, symbols, key) => stockQuotes(symbols, key))
ipcMain.handle('symbols:search', (_e, query) => searchSymbols(query))
ipcMain.handle('finnhub:check', (_e, key) => finnhubCheck(key))
ipcMain.handle('symbols:name', (_e, symbol) => symbolName(symbol))
ipcMain.handle('stocks:info', (_e, symbol, key) => companyInfo(symbol, key))
ipcMain.handle('forecast:run', (e, series, groups) => {
  let last = -1
  return forecast(series, groups, (share) => {
    // Report whole percents only; the download emits thousands of chunks.
    const pct = Math.floor(share * 100)
    if (pct !== last && !e.sender.isDestroyed()) e.sender.send('forecast:progress', (last = pct))
  })
})
ipcMain.handle('forecast:model-ready', () => modelReady())
// Forecast archive (see archiveFile.ts); every input is checked there.
ipcMain.handle('archive:add', (_e, entry) => archive().add(entry))
ipcMain.handle('archive:due', (_e, symbol) => archive().due(typeof symbol === 'string' ? symbol : undefined))
ipcMain.handle('archive:settle', (_e, id, result) => archive().settle(id, result))
ipcMain.handle('archive:summary', (_e, key) => archive().summary(key))
ipcMain.handle('archive:clear', () => archive().clear())
// Comprehensive analysis with TradingAgents (see agents.ts). Keys only go in, never back out to the window.
ipcMain.handle('agents:status', () => agentsStatus())
ipcMain.handle('agents:install', (e) =>
  installAgents((p) => !e.sender.isDestroyed() && e.sender.send('agents:setup', p))
)
ipcMain.handle('agents:remove', () => removeAgents())
ipcMain.handle('agents:keys', () => keyStatus())
ipcMain.handle('agents:key-set', (_e, name, value) => setKey(name, value))
ipcMain.handle('agents:run', (e, req) => runAgents(req, (ev) => !e.sender.isDestroyed() && e.sender.send('agents:event', ev)))
ipcMain.handle('agents:cancel', () => cancelAgents())
ipcMain.handle('agents:results', (_e, symbol) => listAnalyses(symbol))
ipcMain.handle('agents:ollama-models', (_e, url) => ollamaModels(url))

function createWindow(): void {
  const hidden = hiddenStart()
  const win = new BrowserWindow({
    show: hidden !== 'hide',
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    backgroundColor: '#0b0e14',
    autoHideMenuBar: true,
    title: 'KandleOS',
    // Without it, title bar and taskbar show Electron's icon on a dev start and in some Linux window managers.
    icon,
    // Electron's secure defaults, spelled out so a later change cannot silently weaken them.
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      // DevTools would reach window.api (e.g. keyGet) with Ctrl+Shift+I; only for development.
      devTools: !app.isPackaged
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  if (DEV_URL) win.loadURL(DEV_URL)
  else win.loadFile(indexFile())
  keepRunning(win)
  if (hidden === 'minimize') win.minimize()
  // Started hidden at login: keep timers running, like a window hidden by closing it.
  if (hidden === 'hide') win.webContents.setBackgroundThrottling(false)
}

// The dev server (electron-vite); a packaged app ignores the variable, so it cannot be pointed at another page.
const DEV_URL = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL
const indexFile = (): string => join(__dirname, '../renderer/index.html')
// The window may only ever show KandleOS itself: no navigation to other pages, no embedded webviews.
// Only its own index.html, not any file:// page: a local HTML file would get window.api (keys, store).
function isAppUrl(url: string): boolean {
  if (DEV_URL) return url.startsWith(DEV_URL)
  try {
    return url.startsWith('file:') && resolve(fileURLToPath(url)) === resolve(indexFile())
  } catch {
    // An unparsable file URL (e.g. with a host) must block, not slip through a thrown handler.
    return false
  }
}
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (e, url) => !isAppUrl(url) && e.preventDefault())
  contents.on('will-attach-webview', (e) => e.preventDefault())
})

// Third-party license texts, shipped next to the app (see scripts/third-party-licenses.mjs).
ipcMain.handle('app:licenses', () =>
  shell.openPath(
    app.isPackaged
      ? join(process.resourcesPath, 'THIRD_PARTY_LICENSES.txt')
      : join(app.getAppPath(), 'resources', 'THIRD_PARTY_LICENSES.txt')
  )
)

// Only when the user turned the update check on or clicked "Check for updates": the newest release number, or null.
ipcMain.handle('app:latest-version', async () => {
  try {
    const res = await fetch('https://api.github.com/repos/Sined1010/kandleos/releases/latest', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KandleOS' },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000)
    })
    const tag = res.ok ? ((await res.json()) as { tag_name?: unknown }).tag_name : null
    const version = typeof tag === 'string' ? tag.replace(/^v/, '') : ''
    return VERSION_RE.test(version) ? version : null
  } catch {
    return null
  }
})

// A second instance would load its own copy of the store and overwrite this one's changes on its next save.
if (!app.requestSingleInstanceLock()) app.quit()
else {
  // Also brings back a window hidden in the notification area.
  app.on('second-instance', showWindow)
  app.whenReady().then(() => {
    // KandleOS needs no camera, microphone, location, notifications etc.; refuse every such request.
    // The one exception is fullscreen, for the chart's fullscreen mode.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'fullscreen'))
    session.defaultSession.setPermissionCheckHandler(() => false)
    // Started from source the process is electron.exe, whose icon Windows puts on the taskbar button; with an
    // own app id the button takes the window's icon. The installed KandleOS.exe carries its icon itself.
    if (process.platform === 'win32' && !app.isPackaged) app.setAppUserModelId('KandleOS.Source')
    createWindow()
    resumeLink()
    syncTray()
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
  })
}
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
// A running analysis must not outlive the app (on Linux nothing else ends it, and it keeps calling paid models).
app.on('will-quit', cancelAgents)

// Finish the last store write before exiting, so a change made right before closing is not lost.
let flushed = false
app.on('before-quit', (e) => {
  if (flushed) return
  e.preventDefault()
  flushed = true
  writeQueue.finally(() => app.quit())
})
