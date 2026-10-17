import { useEffect, useState } from 'react'
import { SYMBOL_RE, type SearchResult } from '../../../shared/types'

interface Props {
  /** Text shown while not searching (e.g. the current symbol). */
  value?: string
  placeholder: string
  onPick: (symbol: string) => void
  inputClassName: string
  alignRight?: boolean
}

/** Ticker or company-name search with a suggestion list (Yahoo search via IPC). */
export default function SymbolSearch({ value = '', placeholder, onPick, inputClassName, alignRight }: Props) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => setQuery(value), [value])

  useEffect(() => {
    const q = query.trim()
    if (!open || !q || q === value) return setResults([])
    let stale = false
    const id = setTimeout(() => {
      window.api
        .searchSymbols(q)
        .then((r) => {
          if (stale) return
          setResults(r)
          setActive(0)
        })
        .catch(() => !stale && setResults([]))
    }, 250)
    return () => {
      stale = true
      clearTimeout(id)
    }
  }, [query, open, value])

  const close = (input?: HTMLInputElement) => {
    setOpen(false)
    setQuery(value)
    input?.blur()
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
    } else if (e.key === 'Escape') close(e.currentTarget)
    else if (e.key === 'Enter') {
      e.preventDefault()
      // Without suggestions (yet), the typed text is taken as a ticker, e.g. BTCUSDT.
      pick(results[active]?.symbol ?? query, e.currentTarget)
    }
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={(e) => {
          e.target.select()
          setOpen(true)
        }}
        onBlur={() => close()}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        role="combobox"
        aria-expanded={open && results.length > 0}
        spellCheck={false}
        className={inputClassName}
      />
      {open && results.length > 0 && (
        <ul
          role="listbox"
          className={`absolute top-full z-30 mt-2 max-h-80 w-80 overflow-y-auto rounded border border-line bg-panel py-1 shadow-xl ${
            alignRight ? 'right-0' : '-left-8'
          }`}
        >
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
              className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-xs ${i === active ? 'bg-accent/20' : ''}`}
            >
              <span className="w-20 shrink-0 font-medium text-white">{r.symbol}</span>
              <span className="flex-1 truncate text-slate-300">{r.name}</span>
              <span className="shrink-0 text-[10px] uppercase text-muted">{r.exchange}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
