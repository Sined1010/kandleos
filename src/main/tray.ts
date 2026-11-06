// With phone access on, KandleOS keeps running in the notification area: closing the window only hides it, so
// the store, sync, alarms and running analyses go on in the (hidden) window. With phone access off, nothing changes.
import { app, BrowserWindow, dialog, Menu, Notification, Tray } from 'electron'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import icon from '../../resources/icon.png?asset'
import { t } from '../shared/i18n'
import { agentsRunning } from './agents'
import { linkEnabled, setLinkAutostart, setLinkEnabled, takeFirstHideHint } from './link'

let tray: Tray | null = null
let quitting = false
// GNOME shows no tray icons without an extension; there the window is minimized instead of hidden.
const noTray = process.platform === 'linux' && /gnome/i.test(process.env.XDG_CURRENT_DESKTOP ?? '')

const win = (): BrowserWindow | undefined => BrowserWindow.getAllWindows()[0]

export function showWindow(): void {
  const w = win()
  if (!w) return
  w.webContents.setBackgroundThrottling(true)
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
}

export function notify(title: unknown, body: unknown): void {
  if (typeof title === 'string' && Notification.isSupported())
    new Notification({ title: title.slice(0, 120), body: typeof body === 'string' ? body.slice(0, 300) : '', icon }).show()
}

/** Asks first while an analysis runs, since quitting stops it. */
async function quit(): Promise<void> {
  if (agentsRunning()) {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: [t('Beenden'), t('Abbrechen')],
      defaultId: 1,
      cancelId: 1,
      message: t('Es läuft eine Analyse. KandleOS beenden und die Analyse abbrechen?')
    })
    if (response !== 0) return
  }
  quitting = true
  app.quit()
}

/** Tray icon while phone access is on (call after every switch). */
export function syncTray(): void {
  if (linkEnabled() && !tray && !noTray) {
    tray = new Tray(icon)
    tray.setToolTip('KandleOS')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: t('Öffnen'), click: showWindow },
        {
          label: t('Handy-Zugang aus'),
          click: async () => {
            await setLinkEnabled(false)
            syncTray()
            showWindow()
          }
        },
        { type: 'separator' },
        { label: t('Beenden'), click: () => void quit() }
      ])
    )
    tray.on('click', showWindow)
  } else if (!linkEnabled() && tray) {
    tray.destroy()
    tray = null
  }
}

/** Closing hides (or minimizes) the window while phone access is on. */
export function keepRunning(w: BrowserWindow): void {
  w.on('close', (e) => {
    if (quitting || !linkEnabled()) return
    e.preventDefault()
    // Hidden, Chromium would pause timers and requestAnimationFrame: sync and alarms must keep going.
    w.webContents.setBackgroundThrottling(false)
    if (noTray) w.minimize()
    else w.hide()
    if (takeFirstHideHint()) notify(t('KandleOS läuft im Infobereich weiter'), t('Über das Symbol im Infobereich öffnen oder beenden.'))
  })
}

app.on('before-quit', () => (quitting = true))

/** "Start with Windows" (or at login on Linux), in the notification area. */
export async function setAutostart(on: unknown): Promise<void> {
  const open = on === true
  await setLinkAutostart(open)
  if (process.platform === 'linux') {
    const dir = join(homedir(), '.config', 'autostart')
    const file = join(dir, 'kandleos.desktop')
    if (!open) return rm(file, { force: true })
    await mkdir(dir, { recursive: true })
    // The AppImage runs from a temporary mount; its own path is in APPIMAGE.
    const exec = process.env.APPIMAGE ?? process.execPath
    await writeFile(file, `[Desktop Entry]\nType=Application\nName=KandleOS\nExec="${exec}" --hidden\nX-GNOME-Autostart-enabled=true\n`)
  } else app.setLoginItemSettings({ openAtLogin: open, args: ['--hidden'] })
}

/** Started at login with --hidden: hide only when there is a tray icon to come back through, else minimize. */
export function hiddenStart(): 'hide' | 'minimize' | null {
  if (!process.argv.includes('--hidden') || !linkEnabled()) return null
  return noTray ? 'minimize' : 'hide'
}
