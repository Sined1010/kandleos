import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { createRoot } from 'react-dom/client'
import { handleBack } from './backStack'
import MobileApp from './MobileApp'
import { watchStatusBar } from './statusBar'
import './mobile.css'

export function start(): void {
  createRoot(document.getElementById('root')!).render(<MobileApp />)
  if (!Capacitor.isNativePlatform()) return
  void StatusBar.setStyle({ style: Style.Dark })
  void StatusBar.setBackgroundColor({ color: '#10131f' }).catch(() => {})
  watchStatusBar()
  // The first frame is drawn by now; the splash (same night blue) goes without a white flash.
  requestAnimationFrame(() => void SplashScreen.hide())
  void CapApp.addListener('backButton', () => {
    if (!handleBack()) void CapApp.minimizeApp()
  })
}
