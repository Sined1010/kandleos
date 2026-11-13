import { Star } from 'lucide-react'
import { t } from '../../../shared/i18n'
import { ask } from '../../../mobile/MessageBox'
import { useStore } from '../store/useStore'

/**
 * PC and phone: "☆ Watchlist" while the symbol is in no folder; once added, the button shrinks to a filled star.
 * The text's max-width animates to 0 (5em is a little more than the word, so it is never cut), and the name
 * beside it follows.
 */
export default function WatchStar(p: { on: boolean; onClick(): void; title: string; small?: boolean }) {
  return (
    <button
      onClick={p.onClick}
      title={p.title}
      aria-label={p.title}
      aria-pressed={p.on}
      className={`flex shrink-0 items-center rounded-lg font-medium text-accent ring-1 transition-[padding,box-shadow,background-color] duration-200 ease-out motion-reduce:transition-none ${
        p.small ? 'h-8 text-xs' : 'h-6 text-xs'
      } ${
        // Phone: no frame (the header is crowded); the invisible 32 px height keeps the tap area.
        p.on || p.small ? 'px-1 ring-transparent active:bg-accent/15' : 'px-2 ring-accent/50 hover:bg-accent/15 hover:shadow-glow active:bg-accent/15'
      }`}
    >
      <Star size={15} fill={p.on ? 'currentColor' : 'none'} className="shrink-0" />
      <span
        className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity,padding] duration-200 ease-out motion-reduce:transition-none ${
          p.on ? 'max-w-0 pl-0 opacity-0' : 'max-w-[5em] pl-1'
        }`}
      >
        Watchlist
      </span>
    </button>
  )
}

/** The star of a symbol already in the watchlist: asks, then takes it out of every folder. */
export async function removeFromWatchlist(symbol: string): Promise<void> {
  const s = useStore.getState()
  if (!(await ask(t('„{name}“ aus der Watchlist löschen?', { name: s.names[symbol] ?? symbol }), t('Löschen'), { danger: true }))) return
  for (const f of s.folders) if (f.symbols.includes(symbol)) s.removeFromFolder(f.id, symbol)
}
