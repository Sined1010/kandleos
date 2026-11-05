import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { createRoot } from 'react-dom/client'
import { handleBack } from './backStack'
import MobileApp from './MobileApp'
import './mobile.css'

export function start(): void {
  createRoot(document.getElementById('root')!).render(<MobileApp />)
  if (!Capacitor.isNativePlatform()) return
  void StatusBar.setStyle({ style: Style.Dark })
  void StatusBar.setBackgroundColor({ color: '#10131f' }).catch(() => {})
  // Landscape shows the chart alone (mobile.css, same query): the status bar goes too.
  const landscape = window.matchMedia('(orientation: landscape) and (max-height: 500px)')
  const bar = () => void (landscape.matches ? StatusBar.hide() : StatusBar.show()).catch(() => {})
  bar()
  landscape.addEventListener('change', bar)
  // The first frame is drawn by now; the splash (same night blue) goes without a white flash.
  requestAnimationFrame(() => void SplashScreen.hide())
  void CapApp.addListener('backButton', () => {
    if (!handleBack()) void CapApp.minimizeApp()
  })
}
