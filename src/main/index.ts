import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { searchSymbols, stockCandles, stockQuotes } from './stocks'

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
// The API key lives apart from the portable store file, encrypted for this OS user (DPAPI on Windows).
const keyFile = (): string => join(app.getPath('userData'), 'finnhub-key.bin')
ipcMain.on('key:get', (e) => {
  try {
    e.returnValue = safeStorage.decryptString(readFileSync(keyFile()))
  } catch {
    e.returnValue = ''
  }
})
ipcMain.handle('key:set', async (_e, key: unknown) => {
  if (typeof key !== 'string' || !/^[A-Za-z0-9]{0,64}$/.test(key)) return
  if (!key) return rm(keyFile(), { force: true })
  await writeFile(keyFile(), safeStorage.encryptString(key))
})
ipcMain.handle('stocks:candles', (_e, symbol, tf, key) => stockCandles(symbol, tf, key))
ipcMain.handle('stocks:quotes', (_e, symbols, key) => stockQuotes(symbols, key))
ipcMain.handle('symbols:search', (_e, query) => searchSymbols(query))

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    backgroundColor: '#0b0e14',
    autoHideMenuBar: true,
    title: 'KandleOS',
    webPreferences: { preload: join(__dirname, '../preload/index.js') }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
