// Small watchlist parts shared by the PC list (Watchlist.tsx) and the phone sheet (mobile/WatchSheet.tsx).
import { Bell } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { t } from '../../../shared/i18n'
import { formatChange } from '../lib/format'
import { avgChange, sortSymbols, upDown, type WatchSort } from '../lib/watchlist'
import { useQuotes, useStore } from '../store/useStore'

/** A change worth showing: Binance can send NaN, which counts as "no quote". */
const known = (c?: number): c is number => c !== undefined && Number.isFinite(c)

/** The day change as a coloured pill; "—" without a quote. */
export function ChangePill({ change, className = '' }: { change?: number; className?: string }) {
  const color = !known(change) ? 'text-muted' : change >= 0 ? 'bg-up/15 text-up' : 'bg-down/15 text-down'
  return (
    <span className={`rounded-md text-center font-semibold tabular-nums ${color} ${className}`}>{known(change) ? formatChange(change) : '—'}</span>
  )
}

/** Bell behind the name while the symbol has an alarm that has not gone off. */
export function AlarmMark({ symbol }: { symbol: string }) {
  // A boolean, so other symbols' alarms do not re-render this row.
  const on = useStore((s) => s.alarms.some((a) => a.symbol === symbol && !a.triggeredAt))
  if (!on) return null
  return (
    <span role="img" aria-label={t('Kurs-Alarm aktiv')} title={t('Kurs-Alarm aktiv')} className="inline-flex shrink-0 rounded bg-amber-500/15 px-0.5 text-amber-500">
      <Bell size={11} />
    </span>
  )
}

/** Rounded to the two shown decimals, so a subscription only re-renders when the text changes. */
export const round2 = (x?: number): number | undefined => (x === undefined ? undefined : Math.round(x * 100) / 100)

/** "Ø +1.23%" in the direction's colour; nothing without quotes. */
export function AvgText({ avg, className = '' }: { avg?: number; className?: string }) {
  if (avg === undefined) return null
  return <span className={`whitespace-nowrap font-semibold tabular-nums ${avg >= 0 ? 'text-up' : 'text-down'} ${className}`}>Ø {formatChange(avg)}</span>
}

/** A folder's average change with its own subscription, for places that do not subscribe to the folder's quotes. */
export function FolderAvg({ symbols, className }: { symbols: string[]; className?: string }) {
  const avg = useQuotes((s) => round2(avgChange(symbols.map((x) => s.quotes[x]?.changePct))))
  return <AvgText avg={avg} className={className} />
}

/** "9 ↑ 5 ↓": rising and falling symbols today, each once; nothing without quotes. */
export function UpDownCount({ symbols, className = '' }: { symbols: string[]; className?: string }) {
  const { up, down } = useQuotes(useShallow((s) => upDown(symbols, (x) => s.quotes[x]?.changePct)))
  if (!up && !down) return null
  return (
    <span className={`flex shrink-0 items-center gap-2 font-semibold tabular-nums ${className}`}>
      <span className="text-up">{up} ↑</span>
      <span className="text-down">{down} ↓</span>
    </span>
  )
}

/**
 * A folder's symbols in the chosen display order. By change it is recomputed every 10 s (rows do not jump on each
 * tick), at once when the order, the symbols or the number of quotes change, or when `fresh` changes (the phone sheet opening).
 */
export function useSortedSymbols(symbols: string[], fresh?: unknown): string[] {
  const sort = useStore((s) => s.watchlistSort)
  const names = useStore((s) => s.names)
  // Sorts as soon as the first quotes arrive after the start.
  const quoteCount = useQuotes((s) => symbols.filter((x) => s.quotes[x]).length)
  const byChange = sort === 'up' || sort === 'down'
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!byChange) return
    const id = setInterval(() => setTick((n) => n + 1), 10_000)
    return () => clearInterval(id)
  }, [byChange])
  const key = symbols.join()
  const sorted = useMemo(
    () => sortSymbols(symbols, sort, (x) => useQuotes.getState().quotes[x]?.changePct, (x) => names[x] ?? x),
    // `key` stands for `symbols` (a new array with the same content must not re-sort); `tick` is the 10 s beat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sort, key, tick, names, quoteCount, fresh]
  )
  return sort === 'own' ? symbols : sorted
}

export const sortOptions = (): { value: WatchSort; label: string }[] => [
  { value: 'own', label: t('Eigene Reihenfolge') },
  { value: 'up', label: t('Tagesänderung – stärkste zuerst') },
  { value: 'down', label: t('Tagesänderung – schwächste zuerst') },
  { value: 'name', label: t('Name A–Z') }
]

/** Pinned symbols still in the watchlist (a sync can bring a pin whose symbol the other device just removed). */
export const usePinned = (): string[] =>
  useStore(useShallow((s) => s.pinned.filter((x) => s.folders.some((f) => f.symbols.includes(x)))))

/** The first folder holding the symbol: a pinned row's menu moves or removes it there. */
export const folderOf = (symbol: string): string => useStore.getState().folders.find((f) => f.symbols.includes(symbol))?.id ?? ''
