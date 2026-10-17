import { Plus, X } from 'lucide-react'
import { isCrypto } from '../../../shared/types'
import { useQuotes, useStore } from '../store/useStore'
import SymbolSearch from './SymbolSearch'

export const formatPrice = (p: number): string =>
  p.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: p < 1 ? 6 : p < 10 ? 4 : 2 })

export default function Watchlist() {
  const watchlist = useStore((s) => s.watchlist)
  const active = useStore((s) => s.symbol)
  const setSymbol = useStore((s) => s.setSymbol)
  const add = useStore((s) => s.addToWatchlist)
  const remove = useStore((s) => s.removeFromWatchlist)
  const quotes = useQuotes((s) => s.quotes)

  const groups: [string, string[]][] = [
    ['Krypto', watchlist.filter(isCrypto)],
    ['Aktien', watchlist.filter((s) => !isCrypto(s))]
  ]

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex items-center gap-1.5 border-b border-line p-2">
        <Plus size={15} className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <SymbolSearch
            onPick={add}
            alignRight
            placeholder="Hinzufügen: Name oder Symbol"
            inputClassName="w-full rounded bg-bg px-2 py-1 text-xs uppercase outline-none ring-1 ring-line placeholder:normal-case placeholder:text-muted/60 focus:ring-accent"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.map(([title, symbols]) => (
          <section key={title}>
            <h3 className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
            {symbols.map((s) => {
              const q = quotes[s]
              return (
                <div
                  key={s}
                  onClick={() => setSymbol(s)}
                  className={`group grid cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-1.5 ${
                    s === active ? 'bg-accent/15' : 'hover:bg-bg'
                  }`}
                >
                  <span className="truncate font-medium text-white">{s}</span>
                  <span className="text-right tabular-nums">{q ? formatPrice(q.price) : '—'}</span>
                  <span
                    className={`w-16 text-right tabular-nums group-hover:hidden ${
                      !q ? 'text-muted' : q.changePct >= 0 ? 'text-up' : 'text-down'
                    }`}
                  >
                    {q ? `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%` : '—'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(s)
                    }}
                    className="hidden w-16 justify-end text-muted hover:text-down group-hover:flex"
                    aria-label={`${s} entfernen`}
                  >
                    <X size={14} />
                  </button>
                </div>
              )
            })}
          </section>
        ))}
      </div>
    </aside>
  )
}
