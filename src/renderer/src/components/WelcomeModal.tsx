import { t } from '../../../shared/i18n'
import { useStore } from '../store/useStore'
import LanguageSwitch from './LanguageSwitch'
import StockSourcePicker, { useSourceForm } from './StockSourcePicker'

/**
 * First start (and once for users from before the source choice): language, where prices come from (the same
 * choice as in the settings) and the disclaimer, confirmed in one step. It cannot be dismissed without confirming.
 * Finnhub stays in the settings, so the first start asks only what is needed to begin.
 */
export default function WelcomeModal({ onOpenAbout }: { onOpenAbout: () => void }) {
  const acceptDisclaimer = useStore((s) => s.acceptDisclaimer)
  const form = useSourceForm()
  const h = 'mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted'
  const link = 'text-accent hover:underline'
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

        <h3 className={h}>2 · {t('Welche Kurse möchtest du sehen?')}</h3>
        <StockSourcePicker form={form} />

        <h3 className={h}>3 · {t('Keine Anlageberatung')}</h3>
        <p>
          {t('KandleOS ist ein Werkzeug zur Chartanalyse. Prognosen und Analysen sind keine Anlageberatung und keine Kauf- oder Verkaufsempfehlung. Alle Kurse ohne Gewähr; die Nutzung erfolgt auf eigenes Risiko.')}{' '}
          <button onClick={onOpenAbout} className={link}>
            {t('Mehr zu Haftung, Datenschutz und Lizenzen')}
          </button>
        </p>

        <div className="mt-5 flex items-center justify-end gap-3">
          {form.missing && (
            <p className="text-muted" role="status">
              {form.missing}
            </p>
          )}
          <button
            onClick={start}
            disabled={!form.ready || form.busy}
            className="shrink-0 rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white shadow-glow hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
          >
            {form.busy ? t('Prüfe Keys …') : t('Verstanden, los geht’s')}
          </button>
        </div>
      </div>
    </div>
  )
}
