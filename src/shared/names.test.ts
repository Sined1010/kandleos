import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanName } from './names.ts'

test('cleanName shortens legal forms and whitespace', () => {
  assert.equal(cleanName('Siemens Aktiengesellschaft', false), 'Siemens AG')
  assert.equal(cleanName('Vodafone Group Public Limited Company', false), 'Vodafone Group PLC')
  assert.equal(cleanName('  Apple   Inc. ', false), 'Apple Inc.')
})

test('cleanName drops the USD quote from crypto names', () => {
  assert.equal(cleanName('Bitcoin USD', true), 'Bitcoin')
  assert.equal(cleanName('Bitcoin USD', false), 'Bitcoin USD')
})
