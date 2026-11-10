import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { t } from '../../../shared/i18n'
import { isNewer } from '../../../shared/version'
import { useStore } from '../store/useStore'
import BackupSection from './BackupSection'
import PhoneAccess from './PhoneAccess'
import LanguageSwitch from './LanguageSwitch'
import StockSourcePicker, { useSourceForm } from './StockSourcePicker'
import { RELEASES_URL } from './UpdateBadge'
import { IS_MOBILE, PAGE } from '../lib/platform'

/** Phone: price alarms every 15 s with a permanent notification (more battery) instead of about every 15 min. */
function InstantAlarms() {
  const on = useStore((s) => s.instantAlarms)
  return (
    <label className="flex cursor-pointer items-start gap-2 text-xs text-muted">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => useStore.setState({ instantAlarms: e.target.checked })}
        className="mt-0.5 accent-accent"
      />
      <span>
        <span className="text-slate-200">{t('Sofort-Alarme')}</span>
        {' – '}
        {t('Kurs-Alarme alle 15 Sekunden prüfen statt etwa alle 15 Minuten. Solange Alarme aktiv sind, zeigt Android dafür einen Dauer-Hinweis; das kostet mehr Akku. Bei ausgeschaltetem Bildschirm kann Android die Prüfung verzögern.')}
      </span>
    </label>
  )
}

/**
 * linkSection: the phone's "PC" section (src/mobile/PcLink.tsx), passed in so no phone code lands in the PC bundle.
 * keysFromPc: while paired, the stock source and keys come from the PC and are read-only here.
 */
export default function SettingsModal({ onClose, linkSection, keysFromPc = false }: { onClose: () => void; linkSection?: React.ReactNode; keysFromPc?: boolean }) {
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
    if (keysFromPc) return onClose()
    if (!valid || !(await source.apply())) return
    setFinnhubKey(key.trim())
    onClose()
  }

  return (
    <div className={PAGE?.backdrop ?? 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm'} onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className={PAGE?.dialog ?? 'max-h-[90vh] w-[480px] overflow-y-auto rounded-xl border border-line bg-panel/95 backdrop-blur p-5 shadow-2xl'}
      >
        <div className={`${PAGE?.head ?? 'mb-4'} flex items-center justify-between`}>
          <h2 id="settings-title" className="text-base font-semibold text-white">
            {t('Einstellungen')}
          </h2>
          <button type="button" onClick={onClose} className={IS_MOBILE ? 'mobile-icon -mr-2' : 'text-muted hover:text-white'} aria-label={t('Schließen')}>
            <X size={IS_MOBILE ? 22 : 18} />
          </button>
        </div>

        <h3 className="settings-title">{t('Allgemein')}</h3>
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

        {/* Applies at once, like the language. The phone gets updates through Obtainium. */}
        {!IS_MOBILE && (<>
        <p className="mb-1 text-xs text-muted">{t('Updates')}</p>
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
        <p className="ml-5 text-xs text-muted">
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
        </>)}

        {IS_MOBILE && <InstantAlarms />}
        {linkSection}

        {/* Only this section waits for Save; everything else applies at once. */}
        <h3 className="settings-title settings-rule flex items-baseline justify-between gap-2">
          {t('Kursdaten')}
          {!keysFromPc && <span className="text-xs font-normal text-muted">{t('gilt nach „Speichern“')}</span>}
        </h3>
        <fieldset disabled={keysFromPc} className="disabled:opacity-60">
        {keysFromPc && <p className="mb-2 text-xs text-accent">{t('Vom PC übernommen – Kursquelle und Keys am PC ändern.')}</p>}
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
          {IS_MOBILE
            ? t('Der Key wird verschlüsselt im Schlüsselspeicher des Handys gespeichert.')
            : t('Der Key wird verschlüsselt auf diesem Rechner gespeichert (unter Linux nur mit gnome-keyring oder KWallet). Für einen anderen Rechner unten bei „Daten sichern“ mitexportieren oder dort neu eintragen.')}
        </p>
        </fieldset>

        {!IS_MOBILE && <PhoneAccess />}
        {!IS_MOBILE && <BackupSection />}

        <div className={PAGE?.foot ?? 'mt-5 flex items-center justify-end gap-2'}>
          {/* Shown next to the disabled button, so it is clear what is still missing. */}
          {(!valid || source.missing) && (
            <p className="mr-auto text-xs text-muted" role="status">
              {valid ? source.missing : t('Der Finnhub-Key darf nur Buchstaben und Ziffern enthalten.')}
            </p>
          )}
          {/* The phone closes with × or the back gesture. */}
          {!IS_MOBILE && (
            <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-muted hover:bg-line hover:text-white">
              {t('Abbrechen')}
            </button>
          )}
          <button
            type="submit"
            disabled={!keysFromPc && (!valid || !source.ready || source.busy)}
            className={`${PAGE?.button ?? 'rounded-lg px-3 py-1.5'} bg-brand font-medium text-white shadow-glow hover:brightness-110 disabled:opacity-40 disabled:shadow-none`}
          >
            {t('Speichern')}
          </button>
        </div>
      </form>
    </div>
  )
}
