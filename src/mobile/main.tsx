import '../renderer/src/index.css'
import { createMobileApi } from './api'
import { appFiles } from './files'
import { createCandleCache } from './candleCache'

// window.api must exist before the store module loads (it hydrates synchronously from storeGet), so the
// app itself is imported only afterwards.
async function boot() {
  window.api = await createMobileApi()
  const cache = createCandleCache(appFiles)
  await cache.load()
  const { setCandleCache } = await import('../renderer/src/services/marketData')
  setCandleCache(cache)
  await import('../renderer/src/wire')
  const { start } = await import('./start')
  start()
}

boot()
