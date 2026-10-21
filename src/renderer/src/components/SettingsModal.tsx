import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const finnhubKey = useStore((s) => s.finnhubKey)
  const setFinnhubKey = useStore((s) => s.setFinnhubKey)
  const [key, setKey] = useState(finnhubKey)
  const valid = key === '' || /^[A-Za-z0-9]{1,64}$/.test(key.trim())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setFinnhubKey(key.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-[440px] rounded-xl border border-line bg-panel/95 backdrop-blur p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="settings-title" className="text-base font-semibold text-white">
            Einstellungen
          </h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-white" aria-label="Schließen">
            <X size={18} />
          </button>
        </div>

        <label className="mb-1 block text-xs text-muted" htmlFor="finnhub-key">
          Finnhub API-Key
        </label>
        <input
          id="finnhub-key"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoFocus
          spellCheck={false}
          className={`w-full rounded-lg bg-bg px-2 py-1.5 outline-none ring-1 ${valid ? 'ring-line focus:ring-accent' : 'ring-down'}`}
        />
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Ohne Key kommen Aktienkurse über Yahoo Finance (alle 15 s aktualisiert). Mit Key gibt es Echtzeit-Trades über den
          Finnhub-WebSocket. Kostenloser Key:{' '}
          <a href="https://finnhub.io/register" target="_blank" rel="noreferrer" className="text-accent hover:underline">
            finnhub.io/register
          </a>
          . Der Key wird getrennt von kandleos-store.json gespeichert – verschlüsselt für dein Benutzerkonto, sofern das
          System einen Schlüsselbund hat (Windows immer, Linux mit gnome-keyring/KWallet). Nach einem Gerätewechsel hier
          einfach neu eintragen.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-muted hover:bg-line hover:text-white">
            Abbrechen
          </button>
          <button type="submit" disabled={!valid} className="rounded-lg bg-brand font-medium text-white shadow-glow hover:brightness-110 px-3 py-1.5 disabled:opacity-40 disabled:shadow-none">
            Speichern
          </button>
        </div>
      </form>
    </div>
  )
}
