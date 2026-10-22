import { createRoot } from 'react-dom/client'
import { setLang, type Lang } from '../../shared/i18n'
import App from './App'
import './index.css'
import { useStore } from './store/useStore'

// The language applies before anything renders, and again on every switch (App then redraws everything).
const applyLanguage = (lang: Lang) => {
  setLang(lang)
  window.api.setLanguage(lang)
  document.documentElement.lang = lang
}
applyLanguage(useStore.getState().language)
useStore.subscribe((s, prev) => s.language !== prev.language && applyLanguage(s.language))

// No StrictMode: its mount/unmount/remount cycle would run chart effects against an already removed chart instance.
createRoot(document.getElementById('root')!).render(<App />)
