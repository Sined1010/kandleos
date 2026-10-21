import { useId } from 'react'

/** The app icon (a "K" of three candlesticks on the indigo-to-cyan gradient) next to the name. */
export default function Logo() {
  const gradient = useId()
  return (
    <span className="flex items-center gap-2" aria-label="KandleOS">
      <svg viewBox="0 0 512 512" className="h-6 w-6 shrink-0 drop-shadow-[0_0_6px_rgba(99,102,241,0.45)]" aria-hidden>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6366f1" />
            <stop offset="1" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <rect width="512" height="512" rx="116" fill={`url(#${gradient})`} />
        <g strokeLinecap="round">
          <line x1="154" y1="92" x2="154" y2="420" stroke="#fff" strokeWidth="14" />
          <rect x="121" y="148" width="66" height="216" rx="16" fill="#fff" />
          <line x1="208" y1="252" x2="378" y2="84" stroke="#fff" strokeWidth="14" />
          <rect x="253" y="113" width="62" height="128" rx="14" fill="#fff" transform="rotate(45.6 284 177)" />
          <line x1="208" y1="262" x2="378" y2="428" stroke="#d9f4fb" strokeWidth="14" />
          <rect x="255" y="283" width="62" height="112" rx="14" fill="#d9f4fb" transform="rotate(-45.7 286 339)" />
        </g>
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-white">
        Kandle<span className="text-brand">OS</span>
      </span>
    </span>
  )
}
