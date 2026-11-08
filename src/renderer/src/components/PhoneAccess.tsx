import { useEffect, useState } from 'react'
import type { LinkStatus } from '../../../main/link'
import { t } from '../../../shared/i18n'
import { ask } from '../../../mobile/MessageBox'
import { ipcError } from '../lib/format'
import { forgetPartner } from '../services/sync'
import PairWizard from './PairWizard'

// The section sits inside the settings form: Enter must not save and close the settings.
const noEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && e.preventDefault()
const button = 'rounded-lg px-3 py-1.5 text-xs text-white ring-1 ring-line hover:bg-line disabled:opacity-40'
const isLinux = navigator.userAgent.includes('Linux')

const ago = (ms: number) => new Date(ms).toLocaleString()

/**
 * Settings → Pair a phone (Android Abschnitt 2): one button that leads through pairing (PairWizard), the paired
 * phones, start with the system; switch, firewall rule and VPN address under "Advanced".
 */
export default function PhoneAccess() {
  const [status, setStatus] = useState<LinkStatus | null>(null)
  const [vpn, setVpn] = useState('')
  const [error, setError] = useState('')
  const [wizard, setWizard] = useState(false)
  // Windows: KandleOS's own firewall rule exists (null elsewhere, or not known yet).
  const [firewall, setFirewall] = useState<boolean | null>(null)

  const run = async (fn: () => Promise<LinkStatus | void>) => {
    setError('')
    try {
      const s = await fn()
      if (s) setStatus(s)
    } catch (e) {
      setError(ipcError(e))
    }
  }

  useEffect(() => {
    void window.api.link.status().then((s) => {
      setStatus(s)
      setVpn(s.vpnHost)
    })
  }, [])
  // Again after the wizard, which may have added the rule.
  useEffect(() => {
    if (!wizard) void window.api.link.firewall().then(setFirewall)
  }, [wizard])

  if (!status) return null
  const paired = status.devices.length > 0

  return (
    <section aria-labelledby="phone-title">
      <h3 id="phone-title" className="settings-title settings-rule">
        {t('Handy koppeln')}
      </h3>
      <p className="mb-3 text-xs text-muted">{t('Watchlist, Zeichnungen und Alarme mit der KandleOS-App auf dem Handy abgleichen.')}</p>

      {paired && (
        <ul className="mb-3 space-y-1 text-xs">
          {status.devices.map((d) => (
            <li key={d.id} className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${status.enabled ? 'bg-up' : 'bg-muted'}`} aria-hidden />
              <span className="text-slate-200">{d.name}</span>
              <span className="text-muted">{t('zuletzt gesehen {when}', { when: ago(d.lastSeen) })}</span>
              <button
                type="button"
                className="ml-auto text-muted hover:text-down"
                onClick={async () =>
                  (await ask(t('„{name}“ entkoppeln? Das Handy verliert sofort den Zugang.', { name: d.name }), t('Entfernen'), { danger: true })) &&
                  run(async () => {
                    forgetPartner(d.id)
                    return window.api.link.remove(d.id)
                  })
                }
              >
                {t('Entfernen')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {paired && !status.enabled && (
        <p className="mb-2 text-xs text-muted">
          {t('Ausgeschaltet – gekoppelte Handys erreichen den PC gerade nicht.')}{' '}
          <button type="button" className="text-accent hover:underline" onClick={() => run(() => window.api.link.setEnabled(true))}>
            {t('Einschalten')}
          </button>
        </p>
      )}
      {status.error && <p className="mb-2 text-xs text-down">{status.error}</p>}

      <button type="button" className={button} onClick={() => setWizard(true)}>
        {paired ? t('Weiteres Handy koppeln') : t('Jetzt koppeln')}
      </button>

      {status.enabled && (
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={status.autostart}
            onChange={(e) => run(() => window.api.link.setAutostart(e.target.checked))}
            className="mt-0.5 accent-accent"
          />
          <span>
            {isLinux ? t('Beim Anmelden starten (im Infobereich)') : t('Mit Windows starten (im Infobereich)')}
            <span className="block">{t('Beim Schließen des Fensters läuft KandleOS im Infobereich weiter, damit das Handy den PC erreicht.')}</span>
          </span>
        </label>
      )}

      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer select-none hover:text-white">{t('Erweitert')}</summary>
        <div className="mt-2 space-y-3 pl-3">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={status.enabled}
              onChange={(e) => run(() => window.api.link.setEnabled(e.target.checked))}
              className="mt-0.5 accent-accent"
            />
            <span>{t('Handy-Kopplung eingeschaltet (verschlüsselt, nur gekoppelte Geräte, Port {port})', { port: String(status.port) })}</span>
          </label>

          {firewall !== null && (
            <div>
              {firewall ? (
                <p>
                  <span className="text-up">✓</span> {t('Windows-Firewall: KandleOS darf Verbindungen aus deinem Netz annehmen (nur Port {port}).', { port: String(status.port) })}
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    className={button}
                    onClick={() =>
                      run(async () => {
                        const ok = await window.api.link.addFirewall()
                        setFirewall(ok)
                        if (!ok) throw new Error(t('Die Firewall-Regel wurde nicht angelegt (Abfrage abgebrochen?).'))
                      })
                    }
                  >
                    {t('Windows-Firewall einrichten')}
                  </button>
                  <p className="mt-1">
                    {t('Erlaubt nur KandleOS, nur Port {port} und nur Geräte aus deinem Netz – auch wenn das Netz in Windows „Öffentlich“ ist. Windows fragt dafür einmal nach Administrator-Rechten.', { port: String(status.port) })}
                  </p>
                </>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block" htmlFor="vpn-host">
              {t('VPN-Adresse oder Hostname (optional, kommt mit in den QR-Code)')}
            </label>
            <input
              id="vpn-host"
              value={vpn}
              onChange={(e) => setVpn(e.target.value)}
              onBlur={() => vpn !== status.vpnHost && run(() => window.api.link.setVpnHost(vpn))}
              onKeyDown={noEnter}
              spellCheck={false}
              placeholder="100.x.y.z"
              className="w-full rounded-lg bg-bg px-2 py-1.5 text-sm text-white outline-none ring-1 ring-line focus:ring-accent"
            />
          </div>
        </div>
      </details>

      {error && <p className="mt-2 text-xs text-down">{error}</p>}
      {wizard && <PairWizard onClose={() => setWizard(false)} onStatus={setStatus} />}
    </section>
  )
}
