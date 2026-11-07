/**
 * Staggered windows with the current tab's number in the front one; the windows behind show how many tabs are open.
 * With one tab a plus stands where the second window would be (tapping opens one).
 */
export default function TabIcon({ n, count, size = 20 }: { n: number; count: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {count >= 3 && <path d="M10 4V3.5A1.5 1.5 0 0 1 11.5 2H19a3 3 0 0 1 3 3v7.5a1.5 1.5 0 0 1-1.5 1.5H19" opacity={0.4} />}
      {count >= 2 ? <path d="M6 8V7a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3" opacity={0.7} /> : <path d="M18.5 2.5v7M15 6h7" />}
      <rect x="2" y="8" width="14" height="14" rx="3" />
      <text x="9" y="18.6" fill="currentColor" stroke="none" fontSize="9.5" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif">
        {n}
      </text>
    </svg>
  )
}
