import { Capacitor } from '@capacitor/core'
import { StatusBar } from '@capacitor/status-bar'

// Landscape shows the chart alone (mobile.css, same query), and so does full screen: the status bar goes too.
const landscape = window.matchMedia('(orientation: landscape) and (max-height: 500px)')
let full = false

const sync = () => {
  if (!Capacitor.isNativePlatform()) return
  void (landscape.matches || full ? StatusBar.hide() : StatusBar.show()).catch(() => {})
}

/** Hides the status bar in landscape (and in full screen) from now on. */
export function watchStatusBar(): void {
  sync()
  landscape.addEventListener('change', sync)
}

export function setFullscreen(on: boolean): void {
  full = on
  sync()
}
