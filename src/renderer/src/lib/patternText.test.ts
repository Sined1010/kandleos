import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setLang } from '../../../shared/i18n.ts'
import { lookBackLines } from './patternText.ts'

test('look-back lines: both shares, then cases and verdict', () => {
  setLang('de')
  assert.deepEqual(lookBackLines({ n: 38, hit: 0.55, base: 0.51, verdict: 'none' }, 86400), [
    'Im Rückblick richtig: 55 % · ohne Muster 51 %',
    '38 Fälle · kein klarer Vorteil'
  ])
})

test('look-back lines: rare cases show no shares', () => {
  setLang('de')
  assert.deepEqual(lookBackLines({ n: 5, hit: 0.8, base: 0.5, verdict: 'rare' }, 86400), ['5 Fälle · zu selten für eine Aussage'])
})

test('look-back lines: small bars add the chance note', () => {
  setLang('de')
  const lines = lookBackLines({ n: 40, hit: 0.7, base: 0.5, verdict: 'better' }, 900)
  assert.equal(lines.at(-1), '40 Fälle · bisher besser als ohne Muster · auf kleinen Kerzen meist Zufall')
})
