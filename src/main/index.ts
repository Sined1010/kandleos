import { app, BrowserWindow, ipcMain, safeStorage, session, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { forecast } from './forecast'
import { finnhubCheck, searchSymbols, stockCandles, stockQuotes, symbolName } from './stocks'

// Pin the data folder: the installed app is named "KandleOS", the source checkout "kandleos", and on Linux
// those would be two different folders. All data (store, key, single-instance lock) lives here.
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', join(app.getPath('appData'), 'kandleos'))

const storeFile = (): string => join(app.getPath('userData'), 'kandleos-store.json')
let writeQueue = Promise.resolve()

ipcMain.on('store:get', (e) => {
  try {
    e.returnValue = readFileSync(storeFile(), 'utf8')
  } catch {
    e.returnValue = null
  }
})
ipcMain.handle('store:set', (_e, data: unknown) => {
  if (typeof data !== 'string') return
  // Serialize writes and swap atomically so a crash mid-write never truncates the store.
  writeQueue = writeQueue
    .then(async () => {
      await writeFile(storeFile() + '.tmp', data, 'utf8')
      await rename(storeFile() + '.tmp', storeFile())
    })
    .catch((err) => console.error('Speichern fehlgeschlagen:', err))
  return writeQueue
})
// The API key lives apart from the portable store file, encrypted for this OS user
// (DPAPI on Windows, Secret Service/KWallet on Linux).
const keyFile = (): string => join(app.getPath('userData'), 'finnhub-key.bin')
const plainKeyFile = (): string => join(app.getPath('userData'), 'finnhub-key.txt')
ipcMain.on('key:get', (e) => {
  try {
    e.returnValue = safeStorage.decryptString(readFileSync(keyFile()))
  } catch {
    try {
      e.returnValue = readFileSync(plainKeyFile(), 'utf8')
    } catch {
      e.returnValue = ''
    }
  }
})
ipcMain.handle('key:set', async (_e, key: unknown) => {
  if (typeof key !== 'string' || !/^[A-Za-z0-9]{0,64}$/.test(key)) return
  await rm(keyFile(), { force: true })
  await rm(plainKeyFile(), { force: true })
  if (!key) return
  if (safeStorage.isEncryptionAvailable()) await writeFile(keyFile(), safeStorage.encryptString(key))
  // shortcut: without an OS keyring (some Linux setups) the key is plain text readable only by this user; install gnome-keyring/KWallet to get encryption.
  else await writeFile(plainKeyFile(), key, { mode: 0o600 })
})
ipcMain.handle('stocks:candles', (_e, symbol, tf, key, extended) => stockCandles(symbol, tf, key, extended))
ipcMain.handle('stocks:quotes', (_e, symbols, key) => stockQuotes(symbols, key))
ipcMain.handle('symbols:search', (_e, query) => searchSymbols(query))
ipcMain.handle('finnhub:check', (_e, key) => finnhubCheck(key))
ipcMain.handle('symbols:name', (_e, symbol) => symbolName(symbol))
ipcMain.handle('forecast:run', (e, series, groups) => {
  let last = -1
  return forecast(series, groups, (share) => {
    // Report whole percents only; the download emits thousands of chunks.
    const pct = Math.floor(share * 100)
    if (pct !== last && !e.sender.isDestroyed()) e.sender.send('forecast:progress', (last = pct))
  })
})

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
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

// The window may only ever show KandleOS itself: no navigation to other pages, no embedded webviews.
const isAppUrl = (url: string) =>
  process.env.ELECTRON_RENDERER_URL ? url.startsWith(process.env.ELECTRON_RENDERER_URL) : url.startsWith('file://')
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
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
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
