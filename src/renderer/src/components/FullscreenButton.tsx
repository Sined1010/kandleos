import { Maximize, Minimize } from 'lucide-react'
import { useEffect, useState } from 'react'
import { t } from '../../../shared/i18n'

/** Element shown in fullscreen: the chart with its drawing tools (see App.tsx). */
export const FULLSCREEN_ID = 'chart-workspace'

function toggleFullscreen(): void {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.getElementById(FULLSCREEN_ID)?.requestFullscreen()
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)

/** Shows the chart alone on the whole screen; also Shift+F like on TradingView, Esc leaves. */
export default function FullscreenButton() {
  const [full, setFull] = useState(!!document.fullscreenElement)

  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement)
    const onKey = (e: KeyboardEvent) => {
      // Electron does not always leave fullscreen on Esc by itself.
      if (e.key === 'Escape' && document.fullscreenElement) document.exitFullscreen()
      else if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.code === 'KeyF' && !isTyping(e.target)) {
        e.preventDefault()
        toggleFullscreen()
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const label = full ? t('Vollbild beenden (Esc)') : t('Vollbild (Umschalt+F)')
  return (
    <button
      onClick={toggleFullscreen}
      aria-pressed={full}
      title={label}
      aria-label={label}
      className="ml-1 rounded-md px-1.5 py-0.5 text-muted hover:bg-line hover:text-white"
    >
      {full ? <Minimize size={13} /> : <Maximize size={13} />}
    </button>
  )
}
