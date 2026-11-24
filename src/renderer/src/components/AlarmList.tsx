import { BellRing, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { alarmClock, newAlarm } from '../../../shared/alarms'
import { locale, t } from '../../../shared/i18n'
import { planAlarm } from '../../../mobile/alarmPlan'
import { formatPrice } from '../lib/format'
import { drawingOf, lineLabel, lineNow } from '../lib/lineAlarms'
import { IS_MOBILE } from '../lib/platform'
import { useQuotes, useStore } from '../store/useStore'

const icon = IS_MOBILE ? 'mobile-icon' : 'rounded p-1.5 hover:bg-line'

/**
 * Price alarms (PC and phone): set one for `symbol`, and see, re-arm or delete all of them. `onAdded` lets the phone
 * ask for the notification permission; `hint` says how often it checks.
 */
export default function AlarmList({
  symbol,
  hint,
  onAdded,
  onOpen
}: {
  symbol: string
  hint: string
  onAdded?: () => Promise<void>
  /** A line alarm was clicked and its chart opened: close the list. */
  onOpen?: () => void
}) {
  const alarms = useStore((s) => s.alarms)
  const drawings = useStore((s) => s.drawings)
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
    const a = newAlarm(symbol, p, current, alarmClock(useQuotes.getState().quotes[symbol]?.time))
    if (a === 'at-price') return setError(t('Der Kurs liegt schon dort.'))
    setError('')
    useStore.getState().addAlarm(a)
    await onAdded?.()
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
        <p className="mt-2 text-xs text-muted">{hint}</p>
      </div>

      {!alarms.length && <p className="text-muted">{t('Noch keine Kurs-Alarme.')}</p>}
      {alarms.map((a) => {
        const skip = 'skip' in planAlarm(a, { stockSource, yahooExtra, alpacaKeys })
        const now = alarmClock(useQuotes.getState().quotes[a.symbol]?.time)
        const when = (time: number, timeStyle?: 'short') => new Date(time * 1000).toLocaleString(locale(), { dateStyle: 'short', timeStyle })
        const d = a.line ? drawingOf(a, drawings) : undefined
        const missing = !!a.line && !d
        const status = missing
          ? t('Zeichnung fehlt')
          : a.triggeredAt
            ? a.line
              ? t('berührt {time} bei {price}', { time: when(a.triggeredAt, 'short'), price: formatPrice(a.triggeredPrice ?? a.price) })
              : t('erreicht {time}', { time: when(a.triggeredAt, 'short') })
            : a.expiredAt
              ? t('abgelaufen {date} · nicht berührt', { date: when(a.expiredAt) })
              : skip
                ? t('nicht prüfbar: keine Kursquelle für diesen Wert')
                : a.line
                  ? `${t('Linie jetzt {price}', { price: formatPrice(lineNow(a, drawings, now) ?? a.price) })} · ${d?.alarmUntil !== undefined ? t('bis {date}', { date: when(d.alarmUntil, 'short') }) : t('ohne Ende')}`
                  : t('aktiv')
        // A line alarm opens its chart tab (or at least its symbol), so the line can be seen and moved.
        const open = () => {
          if (!a.line) return
          const s = useStore.getState()
          const tab = a.line.key.slice(0, a.line.key.length - a.symbol.length - 1)
          if (s.tabs.some((x) => x.id === tab)) s.selectTab(tab)
          // Read again: the tab just selected may show another symbol by now.
          if (useStore.getState().symbol !== a.symbol) useStore.getState().setSymbol(a.symbol)
          if (d) useStore.getState().select(d.id)
          onOpen?.()
        }
        return (
          <div key={a.id} className="flex items-center gap-2 border-b border-line/60 pb-2">
            <div className={`min-w-0 flex-1 ${a.line && !missing ? 'cursor-pointer' : ''}`} onClick={a.line && !missing ? open : undefined}>
              <p className="truncate text-white">
                {a.line ? (
                  <>
                    {names[a.symbol] ?? a.symbol} · <span className="text-violet-300">{lineLabel(a, drawings)}</span>
                  </>
                ) : (
                  <>
                    {names[a.symbol] ?? a.symbol} {a.op === 'above' ? '≥' : '≤'} {formatPrice(a.price)}
                  </>
                )}
              </p>
              <p className={`text-xs ${a.triggeredAt ? 'text-up' : skip || missing ? 'text-amber-500' : 'text-muted'}`}>
                {status}
              </p>
            </div>
            {(a.triggeredAt || a.expiredAt) && !missing && (
              <button
                // The time of the click, not of the last render: bars in between must not count.
                onClick={() => useStore.getState().rearmAlarm(a.id, alarmClock(useQuotes.getState().quotes[a.symbol]?.time))}
                aria-label={t('Wieder scharf schalten')} className={icon}>
                <RotateCcw size={18} />
              </button>
            )}
            <button
              onClick={() => useStore.getState().removeAlarm(a.id)}
              aria-label={t('Alarm löschen')} className={`${icon} text-down`}>
              <Trash2 size={18} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
