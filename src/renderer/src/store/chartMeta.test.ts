import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metaFor } from './chartMeta.ts'

test('the loaded symbol gets its currency and time zone', () => {
  assert.deepEqual(metaFor({ symbol: 'SAP.DE', currency: 'EUR', timeZone: 'Europe/Berlin' }, 'SAP.DE'), { currency: 'EUR', timeZone: 'Europe/Berlin' })
})

test('another symbol does not get the previous one\'s currency', () => {
  assert.deepEqual(metaFor({ symbol: 'SAP.DE', currency: 'EUR', timeZone: 'Europe/Berlin' }, 'AAPL'), { currency: '', timeZone: undefined })
})
