import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import './wire'
import { createCandleCache } from '../../mobile/candleCache'
import { setCandleCache } from './services/marketData'

// The PC keeps the last charts in memory only: switching back shows them at once while fresh candles load.
setCandleCache(createCandleCache({ read: async () => null, write: async () => {}, rename: async () => {}, remove: async () => {} }))

// No StrictMode: its mount/unmount/remount cycle would run chart effects against an already removed chart instance.
createRoot(document.getElementById('root')!).render(<App />)
