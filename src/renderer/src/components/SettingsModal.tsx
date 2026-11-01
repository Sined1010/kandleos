import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { t } from '../../../shared/i18n'
import { isNewer } from '../../../shared/version'
import { useStore } from '../store/useStore'
import BackupSection from './BackupSection'
import LanguageSwitch from './LanguageSwitch'
import StockSourcePicker, { useSourceForm } from './StockSourcePicker'
import { RELEASES_URL } from './UpdateBadge'

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const finnhubKey = useStore((s) => s.finnhubKey)
  const setFinnhubKey = useStore((s) => s.setFinnhubKey)
  const updateCheck = useStore((s) => s.updateCheck)
  const updateLatest = useStore((s) => s.updateLatest)
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
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-muted">{t('Sprache')}</span>
          <LanguageSwitch />
        </div>
        {/* App.tsx shows the start window until the notice is confirmed again; the current choices stay filled in. */}
        <button
          type="button"
          onClick={() => {
            useStore.setState({ disclaimerAccepted: false })
            onClose()
          }}
          className="mb-3 text-xs text-accent hover:underline"
        >
          {t('Startfenster erneut zeigen')}
        </button>

        {/* Applies at once, like the language. */}
        <label className="mb-1 flex cursor-pointer items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={updateCheck}
            onChange={(e) => useStore.setState({ updateCheck: e.target.checked })}
            className="mt-0.5 accent-accent"
          />
          <span>
            {t('Einmal täglich bei GitHub nachsehen, ob es eine neue Version gibt. GitHub sieht dabei deine IP-Adresse; heruntergeladen oder installiert wird nichts automatisch.')}
          </span>
        </label>
        {/* Fills in by itself once the check (started by ticking the box) has an answer. */}
        <p className="mb-5 ml-5 text-xs text-muted">
          {t('Installiert: {v}', { v: __APP_VERSION__ })}
          {updateLatest &&
            (isNewer(updateLatest, __APP_VERSION__) ? (
              <>
                {' · '}
                <span className="text-slate-200">{t('Version {v} ist verfügbar:', { v: updateLatest })}</span>{' '}
                <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {t('herunterladen')}
                </a>
              </>
            ) : (
              <> · {t('Du hast die neueste Version.')}</>
            ))}
        </p>

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
          {t('Mit Key laufen US-Aktien in Echtzeit mit, auch vor- und nachbörslich. Ohne Key werden die Kurse alle 5 s (Alpaca) oder 15 s (Yahoo) abgefragt. Für andere Börsen, Indizes und Krypto ändert sich nichts. Kostenloser Key:')}{' '}
          <a href="https://finnhub.io/register" target="_blank" rel="noreferrer" className="text-accent hover:underline">
            finnhub.io/register
          </a>
          .
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {t('Der Key wird verschlüsselt auf diesem Rechner gespeichert (unter Linux nur mit gnome-keyring oder KWallet). Für einen anderen Rechner unten bei „Daten sichern“ mitexportieren oder dort neu eintragen.')}
        </p>

        <BackupSection />

        <div className="mt-5 flex items-center justify-end gap-2">
          {/* Shown next to the disabled button, so it is clear what is still missing. */}
          {(!valid || source.missing) && (
            <p className="mr-auto text-xs text-muted" role="status">
              {valid ? source.missing : t('Der Finnhub-Key darf nur Buchstaben und Ziffern enthalten.')}
            </p>
          )}
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
