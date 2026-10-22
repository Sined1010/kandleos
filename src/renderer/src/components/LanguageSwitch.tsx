import { Languages } from 'lucide-react'
import type { Lang } from '../../../shared/i18n'
import { useStore } from '../store/useStore'

const LABELS: Record<Lang, string> = { en: 'English', de: 'Deutsch' }

/** English / Deutsch toggle; each option is labelled in its own language so it can be found either way. */
export default function LanguageSwitch() {
  const language = useStore((s) => s.language)
  const setLanguage = useStore((s) => s.setLanguage)
  return (
    <div className="inline-flex items-center gap-1.5">
      <Languages size={14} className="text-muted" aria-hidden />
      <div className="flex rounded-lg bg-bg p-0.5 ring-1 ring-line" role="group" aria-label="Language / Sprache">
        {(Object.keys(LABELS) as Lang[]).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setLanguage(lang)}
            aria-pressed={language === lang}
            className={`rounded-md px-2 py-0.5 text-xs ${language === lang ? 'bg-brand text-white shadow-glow' : 'text-muted hover:text-white'}`}
          >
            {LABELS[lang]}
          </button>
        ))}
      </div>
    </div>
  )
}
