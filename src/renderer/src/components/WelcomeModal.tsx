import { Info } from 'lucide-react'
import { useState } from 'react'
import { t } from '../../../shared/i18n'
import { useStore } from '../store/useStore'
import LanguageSwitch from './LanguageSwitch'

/**
 * First start (and when reopened from the settings): language, prices and the disclaimer, confirmed in one step.
 * It cannot be dismissed without confirming. Prices come from Yahoo Finance once the user confirms private use;
 * Alpaca and Finnhub are added in the settings, so the first start asks only what is needed to begin.
 */
export default function WelcomeModal({ onOpenAbout }: { onOpenAbout: () => void }) {
  const acceptDisclaimer = useStore((s) => s.acceptDisclaimer)
  const setStockSource = useStore((s) => s.setStockSource)
  // Reopened by someone who chose Alpaca in the settings: keep it, do not switch them to Yahoo.
  const [current] = useState(() => useStore.getState().stockSource)
  const alpaca = current === 'alpaca'
  const [ack, setAck] = useState(current === 'yahoo')
  const h = 'mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted'
  const link = 'text-accent hover:underline'
  const start = () => {
    if (!alpaca) setStockSource('yahoo')
    acceptDisclaimer()
  }
  const cryptoOnly = () => {
    setStockSource('none')
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

        <h3 className={h}>2 · {t('Kurse')}</h3>
        {alpaca ? (
          <p>{t('Deine Aktienquelle ist Alpaca. Ändern kannst du sie jederzeit in den Einstellungen.')}</p>
        ) : (
          <>
            <p>
              {t('Aktien, Indizes und Rohstoffe weltweit kommen von Yahoo Finance (je nach Börse meist 15 Minuten verzögert), Kryptokurse live von Binance – ohne Anmeldung.')}
            </p>
            <label className="mt-2 flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-0.5 accent-accent"
              />
              <span className="text-slate-200">
                {t('Ich nutze Yahoo Finance nur für private Zwecke. Es gelten Yahoos Nutzungsbedingungen; KandleOS steht in keiner Verbindung zu Yahoo.')}{' '}
                <a href="https://legal.yahoo.com/" target="_blank" rel="noreferrer" className={link}>
                  {t('Yahoos Nutzungsbedingungen')}
                </a>
              </span>
            </label>
            <p className="mt-2 flex items-start gap-2 text-muted">
              <Info size={14} className="mt-0.5 shrink-0" />
              {t('Echtzeit-Kurse für US-Aktien: Alpaca (offizielle Schnittstelle) oder Finnhub kannst du jederzeit in den Einstellungen eintragen.')}
            </p>
            <button onClick={cryptoOnly} className={`mt-2 ${link}`}>
              {t('Ohne Aktien starten (nur Krypto)')}
            </button>
          </>
        )}

        <h3 className={h}>3 · {t('Keine Anlageberatung')}</h3>
        <p>
          {t('KandleOS ist ein Werkzeug zur Chartanalyse. Prognosen und Analysen sind keine Anlageberatung und keine Kauf- oder Verkaufsempfehlung. Alle Kurse ohne Gewähr; die Nutzung erfolgt auf eigenes Risiko.')}{' '}
          <button onClick={onOpenAbout} className={link}>
            {t('Mehr zu Haftung, Datenschutz und Lizenzen')}
          </button>
        </p>

        <div className="mt-5 flex items-center justify-end gap-3">
          {!alpaca && !ack && (
            <p className="text-muted" role="status">
              {t('Bitte bestätigen, dass du Yahoo Finance nur privat nutzt.')}
            </p>
          )}
          <button
            onClick={start}
            disabled={!alpaca && !ack}
            className="shrink-0 rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white shadow-glow hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
          >
            {t('Verstanden, los geht’s')}
          </button>
        </div>
      </div>
    </div>
  )
}
