import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// No StrictMode: its mount/unmount/remount cycle would run chart effects against an already removed chart instance.
createRoot(document.getElementById('root')!).render(<App />)
