import { Info } from 'lucide-react'
import { useState } from 'react'
import { t } from '../../../shared/i18n'
import { useStore } from '../store/useStore'
import LanguageSwitch from './LanguageSwitch'
import { AlpacaKeyFields, useSourceForm } from './StockSourcePicker'

/** A radio card: title, optional badge, description, and what opens below it while chosen. */
function Choice(props: {
  name: string
  on: boolean
  onPick: () => void
  title: string
  badge?: string
  text: string
  children?: React.ReactNode
}) {
  return (
    <div className={`rounded-lg p-2.5 ring-1 transition ${props.on ? 'bg-bg ring-accent' : 'ring-line hover:ring-muted'}`}>
      <label className="flex cursor-pointer items-start gap-2">
        <input type="radio" name={props.name} checked={props.on} onChange={props.onPick} className="mt-0.5 accent-accent" />
        <span>
          <span className="font-medium text-white">{props.title}</span>
          {props.badge && (
            <span className="ml-2 rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">{props.badge}</span>
          )}
          <span className="mt-0.5 block text-muted">{props.text}</span>
        </span>
      </label>
      {props.on && props.children && <div className="mt-2 pl-6">{props.children}</div>}
    </div>
  )
}

/**
 * First start (and once for users from before the source choice): language, which prices (crypto only, or
 * stocks too: with an own Alpaca key or without one via Yahoo) and the disclaimer, confirmed in one step.
 * It cannot be dismissed without confirming.
 */
export default function WelcomeModal({ onOpenAbout }: { onOpenAbout: () => void }) {
  const acceptDisclaimer = useStore((s) => s.acceptDisclaimer)
  const setFinnhubKey = useStore((s) => s.setFinnhubKey)
  const form = useSourceForm()
  // null until chosen; users from before see their current choice.
  const [stocks, setStocks] = useState<boolean | null>(form.source === null ? null : form.source !== 'none')
  const [finnhub, setFinnhub] = useState(useStore.getState().finnhubKey)
  const finnhubValid = finnhub.trim() === '' || /^[A-Za-z0-9]{1,64}$/.test(finnhub.trim())
  const choice = stocks === false ? 'none' : stocks && form.source !== 'none' ? form.source : null
  const ready = choice === 'none' || choice === 'yahoo' || (choice === 'alpaca' && (form.newKeys || form.saved))
  const h = 'mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted'
  const link = 'text-accent hover:underline'

  // Confirming the window also confirms the Yahoo notice shown with that choice.
  const start = async () => {
    if (!finnhubValid || !(await form.apply(choice, true))) return
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

        <h3 className={h}>2 · {t('Welche Kurse möchtest du sehen?')}</h3>
        <div className="space-y-2">
          <Choice
            name="welcome-prices"
            on={stocks === false}
            onPick={() => setStocks(false)}
            title={t('Nur Krypto')}
            text={t('Kryptokurse von Binance, ohne Registrierung. Aktien lassen sich später in den Einstellungen hinzufügen.')}
          />
          <Choice
            name="welcome-prices"
            on={stocks === true}
            onPick={() => setStocks(true)}
            title={t('Aktien + Krypto')}
            text={t('Zusätzlich Aktien, ETFs, Indizes und Rohstoffe.')}
          >
            <div className="space-y-2">
              <Choice
                name="welcome-stock-source"
                on={choice === 'alpaca'}
                onPick={() => form.setSource('alpaca')}
                title={t('Mit eigener API')}
                badge={t('empfohlen')}
                text={t('Alpaca: offizielle Schnittstelle, US-Aktien und ETFs in Echtzeit (Börse IEX). Kostenlose Registrierung bei Alpaca nötig.')}
              >
                <AlpacaKeyFields form={form} />
              </Choice>
              <Choice
                name="welcome-stock-source"
                on={choice === 'yahoo'}
                onPick={() => form.setSource('yahoo')}
                title={t('Ohne eigene API weiter')}
                text={t('Yahoo Finance: sofort ohne Registrierung, Aktien, Indizes und Rohstoffe weltweit, je nach Börse verzögert.')}
              >
                {/* Says before confirming what using Yahoo means. */}
                <div className="flex gap-2 rounded-lg p-2.5 ring-1 ring-line">
                  <Info size={14} className="mt-0.5 shrink-0 text-accent" />
                  <p>
                    {t('Mit dieser Auswahl verbindet sich KandleOS automatisch mit Yahoo Finance. Die Kurse werden alle 15 Sekunden abgefragt, je nach Börse in Echtzeit oder verzögert (meist um 15 Minuten). Die Nutzung ist nur für private Zwecke gedacht; es gelten Yahoos Nutzungsbedingungen. KandleOS steht in keiner Verbindung zu Yahoo. Die Datenquelle lässt sich jederzeit in den Einstellungen wechseln.')}{' '}
                    <a href="https://legal.yahoo.com/" target="_blank" rel="noreferrer" className={link}>
                      {t('Yahoos Nutzungsbedingungen')}
                    </a>
                  </p>
                </div>
              </Choice>
              {choice && (
                <div className="rounded-lg p-2.5 ring-1 ring-line">
                  <p className="mb-1.5">
                    <span className="font-medium text-white">Finnhub</span>
                    <span className="ml-2 text-muted">{t('optional')}</span>
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
              )}
            </div>
          </Choice>
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
            disabled={!ready || !finnhubValid || form.busy}
            title={
              ready
                ? undefined
                : choice === 'alpaca'
                  ? t('Beide Alpaca-Keys eintragen oder „Ohne eigene API weiter“ wählen.')
                  : stocks
                    ? t('„Mit eigener API“ oder „Ohne eigene API weiter“ wählen.')
                    : t('Bitte zuerst auswählen, welche Kurse du sehen möchtest.')
            }
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white shadow-glow hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
          >
            {form.busy ? t('Prüfe Keys …') : t('Verstanden, los geht’s')}
          </button>
        </div>
      </div>
    </div>
  )
}
