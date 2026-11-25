import { msg, t } from '../../../shared/i18n.ts'
import type { LookBack, PatternId } from '../../../shared/patterns.ts'

/** What a pattern can mean, in everyday words; never a buy or sell sign. */
export const PATTERN_INFO: Record<PatternId, string> = {
  hammer: msg('Kleiner Körper oben, langer Docht nach unten. Nach einem Rückgang kann das bedeuten, dass Käufer den Kurs wieder hochgezogen haben.'),
  shootingStar: msg('Kleiner Körper unten, langer Docht nach oben. Nach einem Anstieg kann das bedeuten, dass Verkäufer den Kurs wieder gedrückt haben.'),
  bullEngulfing: msg('Eine große grüne Kerze umschließt den Körper der roten Kerze davor. Nach einem Rückgang kann das bedeuten, dass Käufer wieder stärker werden.'),
  bearEngulfing: msg('Eine große rote Kerze umschließt den Körper der grünen Kerze davor. Nach einem Anstieg kann das bedeuten, dass Verkäufer wieder stärker werden.'),
  morningStar: msg('Eine große rote Kerze, eine kleine Kerze, dann eine grüne bis über die Mitte der ersten. Nach einem Rückgang kann das eine Wende nach oben andeuten.'),
  eveningStar: msg('Eine große grüne Kerze, eine kleine Kerze, dann eine rote bis unter die Mitte der ersten. Nach einem Anstieg kann das eine Wende nach unten andeuten.'),
  bullHarami: msg('Eine kleine grüne Kerze liegt ganz im Körper der großen roten davor. Nach einem Rückgang kann das bedeuten, dass der Druck nachlässt.'),
  bearHarami: msg('Eine kleine rote Kerze liegt ganz im Körper der großen grünen davor. Nach einem Anstieg kann das bedeuten, dass der Schwung nachlässt.'),
  doji: msg('Eröffnung und Schluss fast gleich, und die Kerze ist mindestens so lang wie die letzten: Käufer und Verkäufer haben gekämpft, keiner hat gewonnen. Nach einer klaren Bewegung kann das eine Pause oder Wende andeuten.'),
  threeSoldiers: msg('Drei kräftige grüne Kerzen, jede schließt höher. Nach einem Rückgang kann das bedeuten, dass Käufer übernehmen.'),
  threeCrows: msg('Drei kräftige rote Kerzen, jede schließt tiefer. Nach einem Anstieg kann das bedeuten, dass Verkäufer übernehmen.')
}

const VERDICT = {
  rare: msg('zu selten für eine Aussage'),
  none: msg('kein klarer Vorteil'),
  better: msg('bisher besser als ohne Muster'),
  worse: msg('bisher schlechter als ohne Muster')
} as const

/** The look-back as shown in the card: both shares (unless rare), then cases and verdict; bars under 1h get a note. */
export function lookBackLines(lb: LookBack, stepSeconds: number): string[] {
  const cases = lb.n === 1 ? t('1 Fall') : t('{n} Fälle', { n: lb.n })
  const small = stepSeconds < 3600 ? ' · ' + t('auf kleinen Kerzen meist Zufall') : ''
  const last = `${cases} · ${t(VERDICT[lb.verdict])}${small}`
  if (lb.verdict === 'rare') return [last]
  const pct = (v: number) => Math.round(v * 100)
  return [t('Im Rückblick richtig: {x} % · ohne Muster {y} %', { x: pct(lb.hit), y: pct(lb.base) }), last]
}
