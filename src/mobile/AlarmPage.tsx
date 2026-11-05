import { BellRing, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { newAlarm } from '../shared/alarms'
import { locale, t } from '../shared/i18n'
import { formatPrice } from '../renderer/src/lib/format'
import { useQuotes, useStore } from '../renderer/src/store/useStore'
import { planAlarm } from './alarmPlan'
import { notificationId } from './alarmWatch'
import { KandleNative } from './native'

/** Price alarms: set one for `symbol`, and see, re-arm or delete all of them. */
export default function AlarmPage({ symbol }: { symbol: string }) {
  const alarms = useStore((s) => s.alarms)
  const names = useStore((s) => s.names)
  const stockSource = useStore((s) => s.stockSource)
  const yahooExtra = useStore((s) => s.yahooExtra)
  const current = useQuotes((s) => s.quotes[symbol]?.price)
  const [price, setPrice] = useState(current !== undefined ? String(current) : '')
  const [error, setError] = useState('')
  const [alpacaKeys, setAlpacaKeys] = useState(false)
  useEffect(() => void window.api.alpacaHasKeys().then(setAlpacaKeys), [])

  const add = async () => {
    const p = Number(price.replace(',', '.'))
    if (!(p > 0) || current === undefined) return setError(t('Bitte einen Kurs eingeben (aktueller Kurs nötig).'))
    const a = newAlarm(symbol, p, current)
    if (a === 'at-price') return setError(t('Der Kurs liegt schon dort.'))
    setError('')
    useStore.getState().addAlarm(a)
    await KandleNative.requestNotify().catch(() => {})
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-panel p-3">
        <p className="mb-2 text-white">
          {names[symbol] ?? symbol} · {t('aktuell {price}', { price: current !== undefined ? formatPrice(current) : '—' })}
        </p>
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-label={t('Kurs für den Alarm')}
            className="min-w-0 flex-1 rounded-lg bg-bg px-3 py-2.5 text-base text-white outline-none ring-1 ring-line focus:ring-accent"
          />
          <button onClick={() => void add()} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 text-white shadow-glow">
            <BellRing size={16} /> {t('Alarm setzen')}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-down">{error}</p>}
        <p className="mt-2 text-xs text-muted">{t('Geprüft wird etwa alle 15 Minuten, auch bei geschlossener App; schneller mit „Sofort-Alarme“ in den Einstellungen.')}</p>
      </div>

      {!alarms.length && <p className="text-muted">{t('Noch keine Kurs-Alarme.')}</p>}
      {alarms.map((a) => {
        const skip = 'skip' in planAlarm(a, { stockSource, yahooExtra, alpacaKeys })
        return (
          <div key={a.id} className="flex items-center gap-2 border-b border-line/60 pb-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-white">
                {names[a.symbol] ?? a.symbol} {a.op === 'above' ? '≥' : '≤'} {formatPrice(a.price)}
              </p>
              <p className={`text-xs ${a.triggeredAt ? 'text-up' : skip ? 'text-amber-500' : 'text-muted'}`}>
                {a.triggeredAt
                  ? t('erreicht {time}', { time: new Date(a.triggeredAt * 1000).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) })
                  : skip
                    ? t('nicht prüfbar: keine Kursquelle für diesen Wert')
                    : t('aktiv')}
              </p>
            </div>
            {a.triggeredAt && (
              <button
                onClick={async () => {
                  // The old "reached" notification goes first, or the next hit would update it without a sound.
                  await KandleNative.cancelNotification({ id: notificationId(a.id) }).catch(() => {})
                  useStore.getState().rearmAlarm(a.id)
                }}
                aria-label={t('Wieder scharf schalten')} className="mobile-icon">
                <RotateCcw size={18} />
              </button>
            )}
            <button
              onClick={() => {
                void KandleNative.cancelNotification({ id: notificationId(a.id) }).catch(() => {})
                useStore.getState().removeAlarm(a.id)
              }}
              aria-label={t('Alarm löschen')} className="mobile-icon text-down">
              <Trash2 size={18} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
