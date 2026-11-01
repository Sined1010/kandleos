/** A release version as KandleOS tags it ("0.4.0"); anything else from GitHub is ignored. */
export const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/

/** True when `latest` is a higher x.y.z version than `current`. */
export function isNewer(latest: string, current: string): boolean {
  const a = latest.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}
