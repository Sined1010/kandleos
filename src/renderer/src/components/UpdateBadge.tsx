import { Download } from 'lucide-react'
import { t } from '../../../shared/i18n'
import { isNewer } from '../../../shared/version'
import { useStore } from '../store/useStore'

export const RELEASES_URL = 'https://github.com/Sined1010/kandleos/releases/latest'
const DAY = 86_400_000

/**
 * Asks GitHub for the newest release, the automatic check at most once a day (`force` for the button in About).
 * Resolves to that version, or null when GitHub could not be reached; nothing is downloaded or installed.
 */
export async function checkForUpdate(force = false): Promise<string | null> {
  const { updateCheckedAt, updateLatest } = useStore.getState()
  if (!force && Date.now() - updateCheckedAt < DAY) return updateLatest
  const latest = await window.api.latestVersion()
  if (latest) useStore.setState(force ? { updateLatest: latest } : { updateLatest: latest, updateCheckedAt: Date.now() })
  return latest
}

/** Shown in the top bar while a newer release is known; opens the release page in the browser. */
export default function UpdateBadge() {
  const latest = useStore((s) => s.updateLatest)
  if (!latest || !isNewer(latest, __APP_VERSION__)) return null
  return (
    <a
      href={RELEASES_URL}
      target="_blank"
      rel="noreferrer"
      title={t('Neue Version auf GitHub herunterladen')}
      className="flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-white shadow-glow hover:brightness-110"
    >
      <Download size={13} /> {t('Update')} {latest}
    </a>
  )
}
