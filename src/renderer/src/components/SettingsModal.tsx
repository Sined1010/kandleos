import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { t } from '../../../shared/i18n'
import { useStore } from '../store/useStore'
import LanguageSwitch from './LanguageSwitch'
import StockSourcePicker, { useSourceForm } from './StockSourcePicker'

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const finnhubKey = useStore((s) => s.finnhubKey)
  const setFinnhubKey = useStore((s) => s.setFinnhubKey)
  const [key, setKey] = useState(finnhubKey)
  const valid = key === '' || /^[A-Za-z0-9]{1,64}$/.test(key.trim())
  const source = useSourceForm()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || !(await source.apply())) return
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
        className="max-h-[90vh] w-[480px] overflow-y-auto rounded-xl border border-line bg-panel/95 backdrop-blur p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="settings-title" className="text-base font-semibold text-white">
            {t('Einstellungen')}
          </h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-white" aria-label={t('Schließen')}>
            <X size={18} />
          </button>
        </div>

        {/* Applies at once: the window redraws in the new language. */}
        <div className="mb-5 flex items-center justify-between">
          <span className="text-xs text-muted">{t('Sprache')}</span>
          <LanguageSwitch />
        </div>

        <p className="mb-2 text-xs text-muted">{t('Datenquelle für Aktien')}</p>
        <StockSourcePicker form={source} />

        <label className="mb-1 mt-5 block text-xs text-muted" htmlFor="finnhub-key">
          {t('Finnhub API-Key (optional)')}
        </label>
        <input
          id="finnhub-key"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          spellCheck={false}
          className={`w-full rounded-lg bg-bg px-2 py-1.5 outline-none ring-1 ${valid ? 'ring-line focus:ring-accent' : 'ring-down'}`}
        />
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {t('Warum Finnhub? Ohne Key werden Aktienkurse nur in Abständen abgefragt (Alpaca alle 5 s, Yahoo alle 15 s). Mit Key erscheint jeder Trade einer US-Aktie sofort über den Finnhub-WebSocket, auch vor- und nachbörslich: Watchlist und Chart laufen live mit. Für andere Börsen, Indizes und Krypto ändert sich nichts; Verlauf und Suche kommen weiter von Alpaca oder Yahoo. Kostenloser Key:')}{' '}
          <a href="https://finnhub.io/register" target="_blank" rel="noreferrer" className="text-accent hover:underline">
            finnhub.io/register
          </a>
          .
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {t(
            'Der Key wird getrennt von kandleos-store.json gespeichert – verschlüsselt für dein Benutzerkonto, sofern das System einen Schlüsselbund hat (Windows immer, Linux mit gnome-keyring/KWallet). Nach einem Gerätewechsel hier einfach neu eintragen.'
          )}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-muted hover:bg-line hover:text-white">
            {t('Abbrechen')}
          </button>
          <button
            type="submit"
            disabled={!valid || !source.ready || source.busy}
            className="rounded-lg bg-brand font-medium text-white shadow-glow hover:brightness-110 px-3 py-1.5 disabled:opacity-40 disabled:shadow-none"
          >
            {t('Speichern')}
          </button>
        </div>
      </form>
    </div>
  )
}
