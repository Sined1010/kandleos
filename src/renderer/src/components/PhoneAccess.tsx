import qrcode from 'qrcode-generator'
import { useEffect, useState } from 'react'
import type { LinkStatus } from '../../../main/link'
import { t } from '../../../shared/i18n'
import { ipcError } from '../lib/format'
import { forgetPartner } from '../services/sync'

// The section sits inside the settings form: Enter must not save and close the settings.
const noEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && e.preventDefault()
const button = 'rounded-lg px-3 py-1.5 text-xs text-white ring-1 ring-line hover:bg-line disabled:opacity-40'
const isLinux = navigator.userAgent.includes('Linux')

/** QR as SVG: generated from our own pairing code, never from outside input. Low error correction keeps it less dense
 * (easier for a phone camera to read off a screen, where nothing smudges it). */
function qrSvg(text: string): string {
  const qr = qrcode(0, 'L')
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
}

const ago = (ms: number) => new Date(ms).toLocaleString()

/** Settings → Phone access (Android Abschnitt 2): switch, pairing QR, paired phones, start with the system. */
export default function PhoneAccess() {
  const [status, setStatus] = useState<LinkStatus | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [vpn, setVpn] = useState('')
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState('')

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
  // While a code is shown: count down and pick up the phone once it has paired.
  useEffect(() => {
    if (!code) return
    const id = setInterval(() => {
      setNow(Date.now())
      void window.api.link.status().then(setStatus)
    }, 1000)
    return () => clearInterval(id)
  }, [code])
  // Paired (code used up) or expired: hide it.
  useEffect(() => {
    if (code && status && !status.pairingUntil) setCode(null)
  }, [code, status])

  if (!status) return null
  const left = status.pairingUntil ? Math.max(0, Math.round((status.pairingUntil - now) / 1000)) : 0

  return (
    <section aria-labelledby="phone-title">
      <h3 id="phone-title" className="mb-1 mt-5 text-xs text-muted">
        {t('Handy-Zugang')}
      </h3>
      <label className="mb-1 flex cursor-pointer items-start gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={status.enabled}
          onChange={(e) => run(() => window.api.link.setEnabled(e.target.checked))}
          className="mt-0.5 accent-accent"
        />
        <span>
          {t('Die KandleOS-App auf dem Handy darf sich im Heimnetz oder über VPN mit diesem PC verbinden (verschlüsselt, nur gekoppelte Geräte). Beim ersten Einschalten fragt die Windows-Firewall nach; erlaube den Zugriff für private Netzwerke. Solange der Zugang an ist, läuft KandleOS beim Schließen des Fensters im Infobereich weiter.')}
        </span>
      </label>
      {status.error && <p className="mb-2 ml-5 text-xs text-down">{status.error}</p>}

      {status.enabled && (
        <div className="ml-5 space-y-3">
          {code ? (
            <div className="flex gap-3">
              <div className="w-64 shrink-0 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: qrSvg(code) }} />
              <div className="min-w-0 text-xs leading-relaxed text-muted">
                <p className="text-slate-200">{t('In der KandleOS-App: Einstellungen → Mit PC koppeln, dann diesen Code scannen.')}</p>
                <p>{t('Gültig noch {s} s, für ein Gerät.', { s: String(left) })}</p>
                <button type="button" className="mt-1 text-accent hover:underline" onClick={() => navigator.clipboard.writeText(code)}>
                  {t('Code kopieren')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={button}
              onClick={() =>
                run(async () => {
                  const next = await window.api.link.startPairing()
                  const s = await window.api.link.status()
                  // Both at once: with the code but the old status, the effect below would hide the code at once.
                  setStatus(s)
                  setCode(next)
                })
              }
            >
              {t('Handy koppeln')}
            </button>
          )}

          <div>
            <label className="mb-1 block text-xs text-muted" htmlFor="vpn-host">
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
              className="w-full rounded-lg bg-bg px-2 py-1.5 text-sm outline-none ring-1 ring-line focus:ring-accent"
            />
          </div>

          {status.devices.length > 0 && (
            <ul className="space-y-1 text-xs">
              {status.devices.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <span className="text-slate-200">{d.name}</span>
                  <span className="text-muted">{t('zuletzt gesehen {when}', { when: ago(d.lastSeen) })}</span>
                  <button
                    type="button"
                    className="ml-auto text-muted hover:text-down"
                    onClick={() => confirm(t('„{name}“ entkoppeln? Das Handy verliert sofort den Zugang.', { name: d.name })) && run(async () => {
                        forgetPartner(d.id)
                        return window.api.link.remove(d.id)
                      })}
                  >
                    {t('Entfernen')}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="flex cursor-pointer items-start gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={status.autostart}
              onChange={(e) => run(() => window.api.link.setAutostart(e.target.checked))}
              className="mt-0.5 accent-accent"
            />
            <span>{isLinux ? t('Beim Anmelden starten (im Infobereich)') : t('Mit Windows starten (im Infobereich)')}</span>
          </label>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-down">{error}</p>}
    </section>
  )
}
