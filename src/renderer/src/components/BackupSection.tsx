import { useState } from 'react'
import type { BackupSummary } from '../../../main/backup'
import { t } from '../../../shared/i18n'
import { useStore } from '../store/useStore'

const MIN_PASSWORD = 8
const message = (e: unknown) => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
// The section sits inside the settings form: Enter in a password field must not save and close the settings.
const noEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && e.preventDefault()
const input = 'w-full rounded-lg bg-bg px-2 py-1.5 text-sm outline-none ring-1 ring-line focus:ring-accent'
const button = 'rounded-lg px-3 py-1.5 text-xs text-white ring-1 ring-line hover:bg-line disabled:opacity-40'

/** Settings → Back up data: export to a file and import from one (backup.ts does the work in main). */
export default function BackupSection() {
  const [withKeys, setWithKeys] = useState(false)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [picked, setPicked] = useState<BackupSummary | null>(null)
  const [keyPassword, setKeyPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const passwordHint = !withKeys
    ? ''
    : password.length < MIN_PASSWORD
      ? t('Das Passwort muss mindestens {n} Zeichen haben.', { n: String(MIN_PASSWORD) })
      : password !== repeat
        ? t('Die Passwörter stimmen nicht überein.')
        : ''

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setStatus('')
    try {
      await fn()
    } catch (e) {
      setStatus(message(e))
    } finally {
      setBusy(false)
    }
  }

  const exportData = () =>
    run(async () => {
      const path = await window.api.backup.export(withKeys, withKeys ? password : '')
      if (!path) return
      setStatus(t('Gespeichert: {path}', { path }))
      setPassword('')
      setRepeat('')
    })

  const pick = () =>
    run(async () => {
      setPicked(null)
      const summary = await window.api.backup.pick()
      if (!summary) return
      if ((summary.storeVersion ?? 0) > (useStore.persist.getOptions().version ?? 0))
        throw new Error(t('Die Sicherung stammt von einer neueren KandleOS-Version.'))
      setKeyPassword('')
      setPicked(summary)
    })

  // On success main reloads the window, which then starts with the imported data.
  const apply = () => run(() => window.api.backup.apply(keyPassword))

  const date = picked?.exportedAt ? new Date(picked.exportedAt).toLocaleString() : '?'

  return (
    <section aria-labelledby="backup-title">
      <h3 id="backup-title" className="mb-1 mt-5 text-xs text-muted">
        {t('Daten sichern')}
      </h3>
      <p className="mb-2 text-xs leading-relaxed text-muted">
        {t('Watchlist, Zeichnungen, Indikatoren, Chart-Tabs, Einstellungen und gespeicherte Analysen als Datei sichern, z. B. für einen neuen Rechner.')}
      </p>
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={withKeys} onChange={(e) => setWithKeys(e.target.checked)} />
        {t('API-Keys mitexportieren (mit Passwort verschlüsselt)')}
      </label>
      {withKeys && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={noEnter}
            placeholder={t('Passwort (mind. 8 Zeichen)')}
            aria-label={t('Passwort (mind. 8 Zeichen)')}
            autoComplete="new-password"
            className={input}
          />
          <input
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            onKeyDown={noEnter}
            placeholder={t('Passwort wiederholen')}
            aria-label={t('Passwort wiederholen')}
            autoComplete="new-password"
            className={input}
          />
        </div>
      )}
      {passwordHint && <p className="mt-1 text-xs text-muted">{passwordHint}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={exportData} disabled={busy || !!passwordHint} className={button}>
          {t('Exportieren …')}
        </button>
        <button type="button" onClick={pick} disabled={busy} className={button}>
          {t('Importieren …')}
        </button>
      </div>

      {picked && (
        <div className="mt-3 rounded-lg p-3 text-xs leading-relaxed text-slate-300 ring-1 ring-line">
          <p>
            {t('Sicherung vom {date} (KandleOS {version}): {symbols} Werte in der Watchlist, {analyses} gespeicherte Analysen.', {
              date,
              version: picked.appVersion || '?',
              symbols: String(picked.symbols),
              analyses: String(picked.analyses)
            })}
          </p>
          {picked.hasKeys && (
            <>
              <p className="mt-2 text-muted">{t('Enthält verschlüsselte API-Keys. Passwort eingeben, um sie zu übernehmen, oder leer lassen.')}</p>
              <input
                type="password"
                value={keyPassword}
                onChange={(e) => setKeyPassword(e.target.value)}
                onKeyDown={noEnter}
                placeholder={t('Passwort für die API-Keys')}
                aria-label={t('Passwort für die API-Keys')}
                autoComplete="off"
                className={`${input} mt-1`}
              />
            </>
          )}
          <p className="mt-2 text-muted">{t('Ersetzt Watchlist, Zeichnungen und Einstellungen auf diesem Rechner. KandleOS lädt danach neu.')}</p>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setPicked(null)} className="rounded px-3 py-1.5 text-muted hover:bg-line hover:text-white">
              {t('Abbrechen')}
            </button>
            <button type="button" onClick={apply} disabled={busy} className={button}>
              {t('Importieren')}
            </button>
          </div>
        </div>
      )}
      {status && (
        <p className="mt-2 break-all text-xs text-muted" role="status">
          {status}
        </p>
      )}
    </section>
  )
}
