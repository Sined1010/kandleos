import { t } from '../../../shared/i18n'
import { useStore } from '../store/useStore'
import LanguageSwitch from './LanguageSwitch'
import StockSourcePicker, { useSourceForm } from './StockSourcePicker'

/**
 * First start (and once for users from before the source choice): language, stock data source and the
 * disclaimer, confirmed in one step. It cannot be dismissed without a choice.
 */
export default function WelcomeModal({ onOpenAbout }: { onOpenAbout: () => void }) {
  const acceptDisclaimer = useStore((s) => s.acceptDisclaimer)
  const form = useSourceForm()
  const h = 'mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted'

  const start = async () => {
    if (await form.apply()) acceptDisclaimer()
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

        <h3 className={h}>2 · {t('Datenquelle für Aktien')}</h3>
        <p className="mb-2 text-muted">
          {t('Kryptokurse kommen immer von Binance. Für Aktien eine Quelle wählen; das lässt sich später in den Einstellungen ändern.')}
        </p>
        <StockSourcePicker form={form} />

        <h3 className={h}>3 · {t('Keine Anlageberatung')}</h3>
        <p>
          {t('KandleOS ist ein Werkzeug zur Chartanalyse. Prognosen und Analysen sind keine Anlageberatung und keine Kauf- oder Verkaufsempfehlung. Alle Kurse ohne Gewähr; die Nutzung erfolgt auf eigenes Risiko.')}{' '}
          <button onClick={onOpenAbout} className="text-accent hover:underline">
            {t('Mehr zu Haftung, Datenschutz und Lizenzen')}
          </button>
        </p>

        <div className="mt-5 flex justify-end">
          <button
            onClick={start}
            disabled={!form.ready || form.busy}
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white shadow-glow hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
          >
            {form.busy ? t('Prüfe Keys …') : t('Verstanden, los geht’s')}
          </button>
        </div>
      </div>
    </div>
  )
}
