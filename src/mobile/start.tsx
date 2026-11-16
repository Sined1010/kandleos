import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { createRoot } from 'react-dom/client'
import { handleBack } from './backStack'
import ChartBoundary from '../renderer/src/components/ChartBoundary'
import MobileApp from './MobileApp'
import { watchStatusBar } from './statusBar'
import './mobile.css'

export function start(): void {
  // Last net: one broken piece outside the chart shows a note instead of a blank screen.
  createRoot(document.getElementById('root')!).render(
    <ChartBoundary whole>
      <MobileApp />
    </ChartBoundary>
  )
  if (!Capacitor.isNativePlatform()) return
  void StatusBar.setStyle({ style: Style.Dark })
  void StatusBar.setBackgroundColor({ color: '#0a0c16' }).catch(() => {})
  watchStatusBar()
  // The first frame is drawn by now; the splash (same night blue) goes without a white flash.
  requestAnimationFrame(() => void SplashScreen.hide())
  void CapApp.addListener('backButton', () => {
    if (!handleBack()) void CapApp.minimizeApp()
  })
}
