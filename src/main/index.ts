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
import { setLang } from '../shared/i18n'
import { FINNHUB_KEY_RE } from '../shared/types'
import { applyBackup, exportBackup, pickBackup } from './backup'
import { forecast } from './forecast'
import { alpacaHasKeys, setAlpacaKeys } from './alpaca'
import {
  companyInfo,
  finnhubCheck,
  finnhubKey,
  saveFinnhubKey,
  searchSymbols,
  setStockSource,
  stockCandles,
  stockQuotes,
  symbolName
} from './stocks'

// Pin the data folder: the installed app is named "KandleOS", the source checkout "kandleos", and on Linux
// those would be two different folders. All data (store, key, single-instance lock) lives here.
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', join(app.getPath('appData'), 'kandleos'))

const storeFile = (): string => join(app.getPath('userData'), 'kandleos-store.json')
let writeQueue = Promise.resolve()

ipcMain.on('app:language', (_e, lang) => setLang(lang))
ipcMain.on('app:stock-source', (_e, s, yahooExtra) => setStockSource(s, yahooExtra))
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
    await writeFile(storeFile() + '.tmp', store, 'utf8')
    await rename(storeFile() + '.tmp', storeFile())
  }
  // The new page reads the imported store (and keys) on start.
  e.sender.once('did-finish-load', () => (storeLocked = false))
  e.sender.reload()
})
ipcMain.handle('stocks:candles', (_e, symbol, tf, key, extended) => stockCandles(symbol, tf, key, extended))
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
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    backgroundColor: '#0b0e14',
    autoHideMenuBar: true,
    title: 'KandleOS',
    // Electron's secure defaults, spelled out so a later change cannot silently weaken them.
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(indexFile())
}

const indexFile = (): string => join(__dirname, '../renderer/index.html')
// The window may only ever show KandleOS itself: no navigation to other pages, no embedded webviews.
// Only its own index.html, not any file:// page: a local HTML file would get window.api (keys, store).
function isAppUrl(url: string): boolean {
  if (process.env.ELECTRON_RENDERER_URL) return url.startsWith(process.env.ELECTRON_RENDERER_URL)
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

// A second instance would load its own copy of the store and overwrite this one's changes on its next save.
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win?.isMinimized()) win.restore()
    win?.focus()
  })
  app.whenReady().then(() => {
    // KandleOS needs no camera, microphone, location, notifications etc.; refuse every such request.
    // The one exception is fullscreen, for the chart's fullscreen mode.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'fullscreen'))
    session.defaultSession.setPermissionCheckHandler(() => false)
    createWindow()
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
  })
}
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())

// Finish the last store write before exiting, so a change made right before closing is not lost.
let flushed = false
app.on('before-quit', (e) => {
  if (flushed) return
  e.preventDefault()
  flushed = true
  writeQueue.finally(() => app.quit())
})
