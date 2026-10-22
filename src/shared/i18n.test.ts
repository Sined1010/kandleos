import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { EN } from './i18n-en.ts'
import { setLang, t } from './i18n.ts'

/** Every t('…') and msg('…') text in the sources (single-quoted literals, as written in this project). */
export function sourceTexts(dir = join(import.meta.dirname, '..')): Set<string> {
  const out = new Set<string>()
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sourceTexts(path).forEach((s) => out.add(s))
    else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) {
      for (const m of readFileSync(path, 'utf8').matchAll(/\b(?:t|msg)\(\s*'((?:[^'\\]|\\.)*)'/g)) out.add(m[1].replace(/\\'/g, "'"))
    }
  }
  return out
}

test('every text in the sources has an English translation', () => {
  const missing = [...sourceTexts()].filter((s) => !(s in EN))
  assert.deepEqual(missing, [])
})

test('the English table has no leftovers and keeps every placeholder', () => {
  const used = sourceTexts()
  assert.deepEqual(Object.keys(EN).filter((k) => !used.has(k)), [])
  for (const [de, en] of Object.entries(EN)) {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    assert.deepEqual(vars(en), vars(de), de)
  }
})

test('t switches language and fills placeholders', () => {
  setLang('de')
  assert.equal(t('Lade {symbol} …', { symbol: 'AAPL' }), 'Lade AAPL …')
  setLang('en')
  assert.equal(t('Lade {symbol} …', { symbol: 'AAPL' }), 'Loading AAPL …')
})
