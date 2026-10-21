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
