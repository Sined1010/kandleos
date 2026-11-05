import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.sined1010.kandleos',
  appName: 'KandleOS',
  webDir: 'out-mobile',
  backgroundColor: '#0a0c16',
  // Debug builds would otherwise log every plugin call, keys included.
  loggingBehavior: 'none',
  plugins: {
    // Stock requests call CapacitorHttp directly (src/mobile/capHttp.ts); window.fetch stays the WebView's own.
    CapacitorHttp: { enabled: false },
    SplashScreen: { backgroundColor: '#0a0c16', launchAutoHide: false }
  }
}

export default config
