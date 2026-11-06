import qrcode from 'qrcode-generator'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { LinkStatus } from '../../../main/link'
import { t } from '../../../shared/i18n'
import { ipcError } from '../lib/format'

/** QR as SVG: generated from our own pairing code, never from outside input. Low error correction keeps it less dense
 * (easier for a phone camera to read off a screen, where nothing smudges it). */
function qrSvg(text: string): string {
  const qr = qrcode(0, 'L')
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
}

const HELP_AFTER_MS = 30_000
const primary = 'rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white shadow-glow hover:brightness-110'
const secondary = 'rounded-lg px-3 py-1.5 text-sm text-muted ring-1 ring-line hover:bg-line hover:text-white'

type Step =
  | { kind: 'start' }
  | { kind: 'firewall'; failed: boolean }
  | { kind: 'qr'; code: string; known: string[]; since: number }
  | { kind: 'done'; name: string }
  | { kind: 'error'; message: string }

/**
 * "Pair a phone" step by step: switch the link on, on Windows let KandleOS through the firewall (one admin prompt),
 * show the QR code, and say when the phone has paired. Help appears only when nothing happens for a while.
 */
export default function PairWizard({ onClose, onStatus }: { onClose: () => void; onStatus: (s: LinkStatus) => void }) {
  const [step, setStep] = useState<Step>({ kind: 'start' })
  const [now, setNow] = useState(Date.now())
  const [until, setUntil] = useState<number | null>(null)
  const [others, setOthers] = useState<string[] | null>(null)
  const firstButton = useRef<HTMLButtonElement>(null)

  const fail = (e: unknown) => setStep({ kind: 'error', message: ipcError(e) })

  const showCode = async () => {
    const code = await window.api.link.startPairing()
    const s = await window.api.link.status()
    onStatus(s)
    setUntil(s.pairingUntil)
    setStep({ kind: 'qr', code, known: s.devices.map((d) => d.id), since: Date.now() })
  }

  // Step 1, by itself: switch on; on Windows without our rule, ask first, since the admin prompt is coming.
  useEffect(() => {
    void (async () => {
      const s = await window.api.link.setEnabled(true)
      onStatus(s)
      if (s.error) return setStep({ kind: 'error', message: s.error })
      if ((await window.api.link.firewall()) === false) setStep({ kind: 'firewall', failed: false })
      else await showCode()
    })().catch(fail)
    // Once, when the wizard opens.
  }, [])

  // While the code is shown: count down and notice the new phone.
  useEffect(() => {
    if (step.kind !== 'qr') return
    const id = setInterval(() => {
      setNow(Date.now())
      void window.api.link.status().then((s) => {
        onStatus(s)
        setUntil(s.pairingUntil)
        const added = s.devices.find((d) => !step.known.includes(d.id))
        if (added) setStep({ kind: 'done', name: added.name })
      })
    }, 1000)
    return () => clearInterval(id)
  }, [step, onStatus])

  // Help only when the phone has not shown up for a while; then name the security suite that may be in the way.
  const helpDue = step.kind === 'qr' && now - step.since > HELP_AFTER_MS
  useEffect(() => {
    if (helpDue && others === null) void window.api.link.otherFirewalls().then(setOthers, () => setOthers([]))
  }, [helpDue, others])

  // Esc closes the wizard only, not the settings underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  useEffect(() => firstButton.current?.focus(), [step.kind])

  const left = until ? Math.max(0, Math.round((until - now) / 1000)) : 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={(e) => e.stopPropagation()}>
      <div role="dialog" aria-modal="true" aria-labelledby="pair-title" className="w-[420px] rounded-xl border border-line bg-panel p-5 text-sm shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="pair-title" className="text-base font-semibold text-white">
            {t('Handy koppeln')}
          </h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-white" aria-label={t('Schließen')}>
            <X size={18} />
          </button>
        </div>

        {step.kind === 'start' && <p className="text-muted">{t('Einen Moment …')}</p>}

        {step.kind === 'firewall' && (
          <>
            <p className="mb-4 leading-relaxed text-slate-200">
              {step.failed
                ? t('Das hat nicht geklappt. Ohne diese Erlaubnis erreicht das Handy den PC meist nicht.')
                : t('Windows fragt gleich, ob KandleOS Verbindungen aus deinem Heimnetz annehmen darf. Bitte mit „Ja“ bestätigen.')}
            </p>
            <div className="flex justify-end gap-2">
              {step.failed && (
                <button type="button" className={secondary} onClick={() => void showCode().catch(fail)}>
                  {t('Trotzdem weiter')}
                </button>
              )}
              <button
                ref={firstButton}
                type="button"
                className={primary}
                onClick={() =>
                  void window.api.link
                    .addFirewall()
                    .then((ok) => (ok ? showCode() : setStep({ kind: 'firewall', failed: true })))
                    .catch(fail)
                }
              >
                {step.failed ? t('Nochmal versuchen') : t('Weiter')}
              </button>
            </div>
          </>
        )}

        {step.kind === 'qr' && (
          <>
            <div className="mx-auto mb-3 w-64 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: qrSvg(step.code) }} />
            <p className="mb-1 text-center leading-relaxed text-slate-200">
              {t('Scanne den Code mit der Kamera deines Handys – oder in der KandleOS-App: Einstellungen → Mit PC koppeln.')}
            </p>
            {left > 0 ? (
              <p className="text-center text-xs text-muted">{t('Gültig noch {s} s.', { s: String(left) })}</p>
            ) : (
              <div className="mt-2 text-center">
                <button ref={firstButton} type="button" className={secondary} onClick={() => void showCode().catch(fail)}>
                  {t('Neuen Code anzeigen')}
                </button>
              </div>
            )}
            {helpDue && (
              <div className="mt-4 rounded-lg bg-bg p-3 text-xs leading-relaxed text-muted">
                <p className="mb-1 font-semibold text-slate-200">{t('Klappt nicht?')}</p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>{t('Ist das Handy im selben WLAN wie dieser PC?')}</li>
                  <li>{t('Ist die KandleOS-App auf dem Handy auf dem neuesten Stand?')}</li>
                  {others?.map((name) => (
                    <li key={name}>{t('Auf diesem PC läuft {name}. Erlaube dort KandleOS eingehende Verbindungen im Heimnetz.', { name })}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {step.kind === 'done' && (
          <>
            <p className="mb-4 leading-relaxed text-slate-200">
              <span className="text-up">✓</span>{' '}
              {t('„{name}“ ist gekoppelt. Watchlist, Zeichnungen und Alarme gleichen sich ab jetzt von selbst ab.', { name: step.name })}
            </p>
            <div className="flex justify-end">
              <button ref={firstButton} type="button" className={primary} onClick={onClose}>
                {t('Fertig')}
              </button>
            </div>
          </>
        )}

        {step.kind === 'error' && (
          <>
            <p className="mb-4 leading-relaxed text-down">{step.message}</p>
            <div className="flex justify-end">
              <button ref={firstButton} type="button" className={secondary} onClick={onClose}>
                {t('Schließen')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
