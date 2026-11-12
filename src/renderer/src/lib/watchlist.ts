interface SymbolFolder {
  id: string
  symbols: string[]
}

/**
 * Moves `symbol` from folder `fromId` into folder `toId`, in front of `before` (a symbol of the target
 * folder) or to its end when `before` is null or not in it. Works within one folder too, which reorders it.
 * A symbol already in the target folder is not duplicated.
 */
export function moveSymbolTo<F extends SymbolFolder>(
  folders: F[],
  symbol: string,
  fromId: string,
  toId: string,
  before: string | null = null
): F[] {
  if (before === symbol) return folders
  return folders.map((f) => {
    if (f.id !== fromId && f.id !== toId) return f
    const rest = f.symbols.filter((s) => s !== symbol)
    if (f.id !== toId) return { ...f, symbols: rest }
    const at = before === null ? -1 : rest.indexOf(before)
    return { ...f, symbols: at < 0 ? [...rest, symbol] : [...rest.slice(0, at), symbol, ...rest.slice(at)] }
  })
}

/** Drop position over item `i`: in front of it, or with `after` (lower/right half) in front of the next; null = at the end. */
export const insertTarget = (symbols: string[], i: number, after: boolean): string | null =>
  after ? (symbols[i + 1] ?? null) : symbols[i]

export type WatchSort = 'own' | 'up' | 'down' | 'name'

const finite = (x: number | undefined): x is number => x !== undefined && Number.isFinite(x)

/** Display order of a folder; never changes `symbols`. Values without a (finite) quote go last; ties keep their order. */
export function sortSymbols(
  symbols: string[],
  sort: WatchSort,
  change: (s: string) => number | undefined,
  name: (s: string) => string
): string[] {
  if (sort === 'own') return symbols
  if (sort === 'name') return [...symbols].sort((a, b) => name(a).localeCompare(name(b), undefined, { sensitivity: 'base' }))
  const dir = sort === 'up' ? -1 : 1
  return [...symbols].sort((a, b) => {
    const x = change(a)
    const y = change(b)
    if (!finite(x)) return finite(y) ? 1 : 0
    if (!finite(y)) return -1
    return (x - y) * dir
  })
}

/** Mean of the finite changes; undefined when there is none. */
export function avgChange(changes: (number | undefined)[]): number | undefined {
  const ok = changes.filter(finite)
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : undefined
}

/** Rising (≥ 0) and falling values, each symbol counted once; values without a finite quote do not count. */
export function upDown(symbols: string[], change: (s: string) => number | undefined): { up: number; down: number } {
  let up = 0
  let down = 0
  for (const s of new Set(symbols)) {
    const c = change(s)
    if (!finite(c)) continue
    if (c >= 0) up++
    else down++
  }
  return { up, down }
}
