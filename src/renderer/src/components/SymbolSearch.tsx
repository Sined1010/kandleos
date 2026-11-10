import { useEffect, useState } from 'react'
import { msg, t } from '../../../shared/i18n'
import { IS_MOBILE } from '../lib/platform'
import { SYMBOL_RE, type SearchKind, type SearchResult } from '../../../shared/types'

// The filter above the hits; indices, futures, funds and currencies show under "All" only.
const FILTERS = [
  ['all', msg('Alle')],
  ['stock', msg('Aktien')],
  ['etf', msg('ETFs')],
  ['crypto', msg('Krypto')]
] as const
type Filter = (typeof FILTERS)[number][0]

const KIND: Record<SearchKind, [label: string, color: string]> = {
  stock: [msg('Aktie'), 'text-slate-300 bg-white/5'],
  etf: [msg('ETF'), 'text-cyan-300 bg-cyan-400/10'],
  fund: [msg('Fonds'), 'text-cyan-300 bg-cyan-400/10'],
  crypto: [msg('Krypto'), 'text-amber-300 bg-amber-400/10'],
  index: [msg('Index'), 'text-violet-300 bg-violet-400/10'],
  future: [msg('Future'), 'text-violet-300 bg-violet-400/10'],
  currency: [msg('Währung'), 'text-violet-300 bg-violet-400/10']
}

interface Props {
  /** Text shown while not searching (e.g. the current symbol). */
  value?: string
  placeholder: string
  onPick: (symbol: string) => void
  inputClassName: string
  /** Narrow layout: suggestion list as wide as the input, name under the symbol. */
  compact?: boolean
  autoFocus?: boolean
  onClose?: () => void
}

/** Ticker or company-name search with a suggestion list (Yahoo search via IPC). */
export default function SymbolSearch({
  value = '',
  placeholder,
  onPick,
  inputClassName,
  compact,
  autoFocus,
  onClose
}: Props) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  // The hits with the query they answer: the previous ones stay in view while the next search runs.
  const [found, setFound] = useState<{ q: string; hits: SearchResult[] }>({ q: '', hits: [] })
  const all = found.hits
  const [active, setActive] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')
  const results = filter === 'all' ? all : all.filter((r) => r.kind === filter || (filter === 'etf' && r.kind === 'fund'))

  useEffect(() => setQuery(value), [value])

  useEffect(() => {
    const q = query.trim()
    if (!open || !q || q === value) return setFound({ q: '', hits: [] })
    let stale = false
    const id = setTimeout(() => {
      window.api
        .searchSymbols(q)
        .then((hits) => {
          if (stale) return
          setFound({ q, hits })
          setActive(0)
        })
        .catch(() => !stale && setFound({ q, hits: [] }))
    }, 250)
    return () => {
      stale = true
      clearTimeout(id)
    }
  }, [query, open, value])

  const close = (input?: HTMLInputElement) => {
    setOpen(false)
    setQuery(value)
    setFilter('all')
    input?.blur()
    onClose?.()
  }

  const chooseFilter = (id: Filter) => {
    setFilter(id)
    setActive(0)
  }

  const pick = (symbol: string, input?: HTMLInputElement) => {
    const s = symbol.trim().toUpperCase()
    if (!SYMBOL_RE.test(s)) return
    onPick(s)
    close(input)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const d = e.key === 'ArrowDown' ? 1 : -1
      setActive((a) => Math.max(0, Math.min(results.length - 1, a + d)))
    } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      // Alt+←/→ switches the filter; a Tab to its buttons would close the list (the input loses the focus).
      e.preventDefault()
      const i = FILTERS.findIndex(([id]) => id === filter) + (e.key === 'ArrowRight' ? 1 : -1)
      chooseFilter(FILTERS[(i + FILTERS.length) % FILTERS.length][0])
    } else if (e.key === 'Escape') close(e.currentTarget)
    else if (e.key === 'Enter') {
      e.preventDefault()
      // Hits of an older query do not count. Without current suggestions, the typed text is taken as a ticker, e.g. BTCUSDT.
      const current = found.q === query.trim() ? results[active]?.symbol : undefined
      pick(current ?? query, e.currentTarget)
    }
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          if (/\d/.test(e.target.value)) window.api.warmSearch()
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={(e) => {
          e.target.select()
          setOpen(true)
        }}
        onBlur={() => close()}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        role="combobox"
        aria-expanded={open && all.length > 0}
        spellCheck={false}
        className={inputClassName}
      />
      {open && all.length > 0 && (
        <div
          className={`absolute top-full z-30 mt-2 overflow-hidden rounded-lg border border-line bg-panel/95 backdrop-blur shadow-2xl shadow-black/50 ${
            compact ? 'inset-x-0' : '-left-8 w-96'
          }`}
        >
          <div role="group" aria-label={t('Art der Werte')} title="Alt + ← / →" className="flex gap-1 border-b border-line p-1.5">
            {FILTERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                // mousedown + preventDefault: the input keeps the focus, so the list stays open.
                onMouseDown={(e) => {
                  e.preventDefault()
                  chooseFilter(id)
                }}
                className={`rounded-md px-2.5 ${IS_MOBILE ? 'min-h-11 px-3 text-sm' : 'py-1 text-xs'} ${
                  filter === id ? 'bg-accent/25 text-white' : 'text-muted hover:text-white'
                }`}
              >
                {t(label)}
              </button>
            ))}
          </div>
          {results.length === 0 && <p className="px-3 py-2 text-xs text-muted">{t('Keine Treffer')}</p>}
          <ul role="listbox" className="max-h-80 overflow-y-auto py-1">
            {results.map((r, i) => (
              <li
                key={r.symbol}
                role="option"
                aria-selected={i === active}
                // mousedown + preventDefault: pick before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(r.symbol, document.activeElement as HTMLInputElement)
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer flex-wrap items-baseline gap-x-2 px-3 py-1.5 text-xs ${i === active ? 'bg-accent/20' : ''}`}
              >
                <span className={`shrink-0 font-medium text-white ${compact ? 'flex-1' : 'w-20'}`}>{r.symbol}</span>
                <span className={`truncate text-slate-300 ${compact ? 'order-last w-full' : 'flex-1'}`}>{r.name}</span>
                {/* Long names ("Chicago Mercantile Exchange") are cut so the instrument's name keeps its room. */}
                <span className="max-w-24 shrink-0 truncate text-[10px] uppercase text-muted" title={r.exchange}>
                  {r.exchange}
                </span>
                {r.kind && (
                  <span className={`shrink-0 rounded px-1.5 text-[10px] font-medium ${KIND[r.kind][1]}`}>{t(KIND[r.kind][0])}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
