import { useEffect, useState } from 'react'
import { t } from '../shared/i18n'

/** KandleOS's own license and the third-party notices, shipped inside the app (vite.mobile.config.ts). */
export default function Licenses() {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    Promise.all(['./LICENSE.txt', './THIRD_PARTY_LICENSES.txt'].map((u) => fetch(u).then((r) => (r.ok ? r.text() : ''))))
      .then((parts) => setText(parts.filter(Boolean).join('\n\n\n')))
      .catch(() => setText(''))
  }, [])
  if (text === null) return null
  if (!text) return <p className="text-muted">{t('Lizenzdatei nicht gefunden')}</p>
  return <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-300 select-text">{text}</pre>
}
