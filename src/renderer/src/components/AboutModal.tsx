import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { t } from '../../../shared/i18n'

/** About KandleOS: disclaimer, privacy notes, data sources and third-party licenses (first start: WelcomeModal). */
export default function AboutModal({ onClose }: { onClose: () => void }) {
  const [licenseError, setLicenseError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const h = 'mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-muted'
  const link = 'text-accent hover:underline'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        className="max-h-[85vh] w-[560px] overflow-y-auto rounded-xl border border-line bg-panel/95 backdrop-blur p-5 text-xs leading-relaxed text-slate-300 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="about-title" className="text-base font-semibold text-white">
            {t('Über KandleOS')} <span className="text-xs font-normal text-muted">Version {__APP_VERSION__}</span>
          </h2>
          <button onClick={onClose} className="text-muted hover:text-white" aria-label={t('Schließen')}>
            <X size={18} />
          </button>
        </div>

        <h3 className={h}>{t('Keine Anlageberatung')}</h3>
        <p>
          {t(
            'KandleOS ist ein Werkzeug zur technischen Chartanalyse. Indikatoren, Zeichnungen, die Kursprognose (Chronos-2) und die umfassende Analyse mit TradingAgents (Texte von Sprachmodellen, die irren können) sind Hilfsmittel und'
          )}{' '}
          <strong className="text-white">{t('keine Anlageberatung')}</strong>{' '}
          {t(
            'und keine Kauf- oder Verkaufsempfehlung. Alle Kurse ohne Gewähr: Daten können verzögert, unvollständig oder fehlerhaft sein. Die Nutzung erfolgt auf eigenes Risiko; Anlageentscheidungen triffst du selbst.'
          )}
        </p>

        <h3 className={h}>{t('Datenschutz')}</h3>
        <p>
          {t(
            'KandleOS erhebt keine Nutzungsdaten und sendet nichts an den Hersteller (keine Telemetrie). Watchlist, Zeichnungen und Einstellungen bleiben auf diesem Rechner, API-Keys werden verschlüsselt gespeichert. Zum Laden der Kurse verbindet sich die App direkt mit diesen Anbietern, die dabei technisch bedingt deine IP-Adresse erhalten; es gelten deren Datenschutzbestimmungen, die Server stehen teils in den USA:'
          )}
        </p>
        <ul className="ml-4 mt-1 list-disc">
          <li>{t('Binance – Kryptokurse')}</li>
          <li>{t('Alpaca – Aktienkurse, Symbolsuche und Namen, nur mit eigenem API-Key')}</li>
          <li>{t('Yahoo Finance – Aktienkurse, Symbolsuche und Namen, nur wenn als Datenquelle gewählt (inoffizielle Schnittstelle)')}</li>
          <li>{t('Finnhub – Echtzeit-Aktienkurse, nur wenn ein eigener API-Key eingetragen ist')}</li>
          <li>{t('Hugging Face – einmaliger Download des Prognosemodells beim ersten Klick auf „Prognose“')}</li>
        </ul>
        <p className="mt-2">
          {t('Nur wenn du die')} <strong className="text-white">{t('umfassende Analyse mit TradingAgents')}</strong>{' '}
          {t(
            'einrichtest und startest: Beim Einrichten lädt KandleOS Python und TradingAgents von GitHub und dem Python-Paketindex (PyPI). Bei jeder Analyse gehen das Symbol und die gesammelten Markt-, Nachrichten- und Unternehmensdaten an den von dir gewählten KI-Anbieter (Anthropic, OpenAI, Google, DeepSeek oder Alibaba; mit Ollama bleibt die KI auf deinem Rechner). Die Daten holt TradingAgents u. a. von Yahoo Finance, SEC EDGAR, Reddit, StockTwits, Polymarket und – mit eigenem Key – FRED. Deine API-Keys werden verschlüsselt gespeichert und nur an das lokale Analyseprogramm übergeben.'
          )}
        </p>

        <h3 className={h}>{t('Datenquellen und Marken')}</h3>
        <p>
          {t('Kursdaten stammen von den genannten Anbietern und unterliegen deren Nutzungsbedingungen. Charts: TradingView Lightweight Charts™ (Apache-2.0),')}{' '}
          <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className={link}>
            tradingview.com
          </a>
          .{' '}
          {t(
            'Prognosemodell: Amazon Chronos-2 (Apache-2.0) als ONNX-Export von sktime. Umfassende Analyse: TradingAgents von Tauric Research (Apache-2.0), bei Bedarf installiert mit uv von Astral (MIT/Apache-2.0). Alle Marken gehören ihren jeweiligen Inhabern; KandleOS steht in keiner Verbindung zu diesen Unternehmen.'
          )}
        </p>

        <h3 className={h}>{t('Lizenzen')}</h3>
        <p>
          {t('KandleOS nutzt Open-Source-Software, u. a. Electron, React und Lightweight Charts.')}{' '}
          <button onClick={async () => setLicenseError(await window.api.openLicenses())} className={link}>
            {t('Lizenzen von Drittanbietern anzeigen')}
          </button>
          {licenseError && <span className="ml-2 text-down">({licenseError})</span>}
        </p>

      </div>
    </div>
  )
}
