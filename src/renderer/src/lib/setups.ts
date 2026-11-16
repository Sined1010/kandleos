import { msg } from '../../../shared/i18n.ts'
import type { Indicators } from '../store/useStore'

/** Indicators that only make sense together; one check box switches them all, each stays adjustable on its own. */
export interface Setup {
  id: string
  label: string
  /** Shown after each member in the indicator list. */
  short: string
  info: string
  members: (keyof Indicators)[]
}

export const SETUPS: Setup[] = [
  {
    id: 'breakout',
    label: msg('Volatilitäts-Ausbruch'),
    short: msg('Ausbruch'),
    info: msg(
      'Werden die Bollinger-Bänder ungewöhnlich eng (grau hinterlegt), folgt oft eine starke Bewegung. Die Richtung zeigt der Supertrend, die Stärke ein ADX über 25. Die ATR hilft, den Abstand für einen Stop zu wählen.'
    ),
    members: ['bb', 'squeeze', 'supertrend', 'adx', 'atr']
  }
]

export const setupOn = (ind: Indicators, s: Setup) => s.members.every((m) => ind[m].on)

/** Switches the members on or off; their settings stay as they are. */
export const setupPatch = (ind: Indicators, s: Setup, on: boolean): Partial<Indicators> =>
  Object.fromEntries(s.members.map((m) => [m, { ...ind[m], on }]))

export const setupsOf = (name: keyof Indicators) => SETUPS.filter((s) => s.members.includes(name))
