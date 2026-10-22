import { Info } from 'lucide-react'
import { useState } from 'react'
import { t } from '../../../shared/i18n'
import { useStore } from '../store/useStore'
import LanguageSwitch from './LanguageSwitch'
import { AlpacaKeyFields, useSourceForm } from './StockSourcePicker'

/**
 * First start (and once for users from before the source choice): language, optional API keys and the
 * disclaimer, confirmed in one step. Without an Alpaca key, stocks come from Yahoo Finance; the notice says
 * so before the user confirms. It cannot be dismissed without confirming.
 */
export default function WelcomeModal({ onOpenAbout }: { onOpenAbout: () => void }) {
  const acceptDisclaimer = useStore((s) => s.acceptDisclaimer)
  const setFinnhubKey = useStore((s) => s.setFinnhubKey)
  const form = useSourceForm()
  const [finnhub, setFinnhub] = useState(useStore.getState().finnhubKey)
  const finnhubValid = finnhub.trim() === '' || /^[A-Za-z0-9]{1,64}$/.test(finnhub.trim())
  const alpaca = form.newKeys || form.saved
  const h = 'mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted'
  const card = 'rounded-lg p-2.5 ring-1 ring-line'
  const link = 'text-accent hover:underline'

  // Confirming the window also confirms the Yahoo notice shown above the button.
  const start = async () => {
    if (!finnhubValid || !(await form.apply(alpaca ? 'alpaca' : 'yahoo', true))) return
    setFinnhubKey(finnhub.trim())
    acceptDisclaimer()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="max-h-[90vh] w-[560px] overflow-y-auto rounded-xl border border-line bg-panel/95 p-5 text-xs leading-relaxed text-slate-300 shadow-2xl backdrop-blur"
      >
        <h2 id="welcome-title" className="text-base font-semibold text-white">
          {t('Willkommen bei KandleOS')}{' '}
          <span className="text-xs font-normal text-muted">Version {__APP_VERSION__}</span>
        </h2>

        <h3 className={h}>1 · Language / Sprache</h3>
        <LanguageSwitch />

        <h3 className={h}>2 · {t('Aktienkurse (optional)')}</h3>
        <p className="mb-2 text-muted">
          {t('Kryptokurse kommen immer von Binance. Für Aktien kannst du eigene kostenlose API-Keys eintragen, auch später in den Einstellungen.')}
        </p>
        <div className="space-y-2">
          <div className={card}>
            <p className="mb-1.5">
              <span className="font-medium text-white">Alpaca</span>
              <span className="ml-2 rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">{t('empfohlen')}</span>
              <span className="mt-0.5 block text-muted">
                {t('US-Aktien und ETFs, Echtzeit von der Börse IEX. Offizielle Schnittstelle, kostenloser eigener API-Key nötig.')}
              </span>
            </p>
            <AlpacaKeyFields form={form} />
          </div>
          <div className={card}>
            <p className="mb-1.5">
              <span className="font-medium text-white">Finnhub</span>
              <span className="mt-0.5 block text-muted">
                {t('Zusätzlich Echtzeit-Trades für US-Aktien über den Finnhub-WebSocket. Verlauf und Suche kommen weiter von Alpaca oder Yahoo.')}
              </span>
            </p>
            <input
              type="password"
              value={finnhub}
              onChange={(e) => setFinnhub(e.target.value)}
              placeholder={t('Finnhub API-Key (optional)')}
              aria-label={t('Finnhub API-Key (optional)')}
              spellCheck={false}
              className={`w-full rounded-lg bg-bg px-2 py-1.5 outline-none ring-1 ${finnhubValid ? 'ring-line focus:ring-accent' : 'ring-down'}`}
            />
            <p className="mt-1.5 text-muted">
              {t('Kostenloser Key:')}{' '}
              <a href="https://finnhub.io/register" target="_blank" rel="noreferrer" className={link}>
                finnhub.io/register
              </a>
              . {t('Der Key wird verschlüsselt auf diesem Rechner gespeichert.')}
            </p>
          </div>
          {/* Says before confirming where stock prices will come from. */}
          <div className="flex gap-2 rounded-lg bg-amber-400/10 p-2.5 ring-1 ring-amber-400/40">
            <Info size={14} className="mt-0.5 shrink-0 text-amber-300" />
            {alpaca ? (
              <p>{t('Aktienkurse kommen von Alpaca.')}</p>
            ) : (
              <p>
                {t('Ohne Alpaca-Key verbindet sich KandleOS für Aktienkurse automatisch mit Yahoo Finance: ohne Registrierung, etwa 15 Sekunden verzögert. Yahoo bietet dafür keine offizielle Schnittstelle; die Nutzung ist nur privat gedacht, kann gegen Yahoos Nutzungsbedingungen verstoßen und jederzeit aufhören zu funktionieren. KandleOS ist nicht mit Yahoo verbunden. In den Einstellungen lässt sich Yahoo jederzeit abschalten („Nur Krypto“).')}{' '}
                <a href="https://legal.yahoo.com/" target="_blank" rel="noreferrer" className={link}>
                  {t('Yahoos Nutzungsbedingungen')}
                </a>
              </p>
            )}
          </div>
          {form.error && <p className="text-down">{form.error}</p>}
        </div>

        <h3 className={h}>3 · {t('Keine Anlageberatung')}</h3>
        <p>
          {t('KandleOS ist ein Werkzeug zur Chartanalyse. Prognosen und Analysen sind keine Anlageberatung und keine Kauf- oder Verkaufsempfehlung. Alle Kurse ohne Gewähr; die Nutzung erfolgt auf eigenes Risiko.')}{' '}
          <button onClick={onOpenAbout} className={link}>
            {t('Mehr zu Haftung, Datenschutz und Lizenzen')}
          </button>
        </p>

        <div className="mt-5 flex justify-end">
          <button
            onClick={start}
            disabled={form.halfKeys || !finnhubValid || form.busy}
            title={form.halfKeys ? t('Für Alpaca beide Felder ausfüllen oder beide leer lassen.') : undefined}
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white shadow-glow hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
          >
            {form.busy ? t('Prüfe Keys …') : t('Verstanden, los geht’s')}
          </button>
        </div>
      </div>
    </div>
  )
}
