import test from 'node:test'
import assert from 'node:assert/strict'
import { aliasName, cleanName, findAliases } from './names.ts'

test('cleanName drops the share-class letter and the futures contract month', () => {
  assert.equal(cleanName('SIEMENS AG                    N', false), 'SIEMENS AG')
  assert.equal(cleanName('Silver Dec 26', false), 'Silver')
  assert.equal(cleanName('Micro Gold Futures,Dec-2026', false), 'Micro Gold Futures')
  assert.equal(cleanName('DAX                           P', false), 'DAX')
})

test('findAliases matches German terms, umlauts and symbols', () => {
  const symbols = (q: string) => findAliases(q).map((a) => a.symbol)
  assert.equal(symbols('Silber')[0], 'SI=F')
  assert.ok(symbols('Öl').includes('CL=F') && symbols('rohoel').includes('BZ=F'))
  assert.ok(symbols('S&P 500').includes('^GSPC'))
  assert.ok(symbols('nasdaq').includes('NQ=F'))
  assert.ok(symbols('gc=f').includes('GC=F'))
  assert.deepEqual(symbols('x'), [])
  assert.equal(aliasName('GC=F'), 'Gold')
})

test('cleanName shortens legal forms and whitespace', () => {
  assert.equal(cleanName('Siemens Aktiengesellschaft', false), 'Siemens AG')
  assert.equal(cleanName('Vodafone Group Public Limited Company', false), 'Vodafone Group PLC')
  assert.equal(cleanName('  Apple   Inc. ', false), 'Apple Inc.')
})

test('cleanName drops the USD quote from crypto names', () => {
  assert.equal(cleanName('Bitcoin USD', true), 'Bitcoin')
  assert.equal(cleanName('Bitcoin USD', false), 'Bitcoin USD')
})
