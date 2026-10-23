import test from 'node:test'
import assert from 'node:assert/strict'
import { checkAnalysis, checkKeys, openKeys, parseBackup, sealKeys } from './backupFormat.ts'

const keys = { finnhub: 'abc123', alpaca: { id: 'AKID1234567890', secret: 'SECRET1234567890' }, agents: { anthropic: 'sk-ant-x', fred: 'f1' } }
const analysis = {
  id: '2026-10-23_1761220000000',
  symbol: 'AAPL',
  ticker: 'AAPL',
  date: '2026-10-23',
  createdAt: 1761220000000,
  durationSec: 300,
  provider: 'anthropic',
  deepModel: 'claude-opus-5-5',
  quickModel: 'claude-sonnet-5',
  analysts: ['market'],
  rating: 'Hold',
  reports: { decision: '**Rating**: Hold' },
  stats: { calls: 1, tokensIn: 2, tokensOut: 3 }
}
const backup = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ app: 'KandleOS', format: 1, appVersion: '0.1.0', exportedAt: '2026-10-23T10:00:00.000Z', store: { state: { folders: [] }, version: 4 }, analyses: [analysis], keys: null, ...over })

test('keys survive sealing only with the right password', () => {
  const sealed = sealKeys(keys, 'richtig-langes-passwort')
  assert.ok(!JSON.stringify(sealed).includes('SECRET1234567890'))
  assert.deepEqual(openKeys(sealed, 'richtig-langes-passwort'), keys)
  assert.throws(() => openKeys(sealed, 'falsches-passwort'))
  assert.throws(() => sealKeys(keys, 'kurz'))
})

test('key checks follow the rules for entering keys by hand', () => {
  assert.deepEqual(checkKeys({}), {})
  for (const bad of [{ finnhub: 'a b' }, { finnhub: '' }, { alpaca: { id: 'short', secret: 'SECRET1234567890' } }, { agents: { constructor: 'x' } }, { agents: { evil: 'x' } }, { agents: { fred: 'has space' } }, [], null])
    assert.throws(() => checkKeys(bad), JSON.stringify(bad))
})

test('a backup is parsed only when it looks like one', () => {
  const ok = parseBackup(backup())
  assert.equal(ok.analyses.length, 1)
  assert.equal(ok.store?.version, 4)
  assert.equal(parseBackup(backup({ store: null })).store, null)
  for (const bad of ['nope', '[]', backup({ app: 'Other' }), backup({ format: 2 }), backup({ store: { state: [], version: 4 } }), backup({ analyses: {} })])
    assert.throws(() => parseBackup(bad), bad.slice(0, 60))
})

test('imported key blobs cannot choose expensive key-derivation settings', () => {
  const sealed = sealKeys(keys, 'richtig-langes-passwort')
  assert.equal(parseBackup(backup({ keys: sealed })).keys?.data, sealed.data)
  assert.throws(() => parseBackup(backup({ keys: { ...sealed, n: 2 ** 30 } })))
})

test('analyses that would write outside their folder are dropped, extra fields are not copied', () => {
  for (const bad of [{ id: '../../evil' }, { id: '2026-10-23_1/../../x' }, { symbol: '../KEYS' }, { symbol: 'A/B' }, { provider: 'evil' }, { reports: { a: 1 } }])
    assert.equal(checkAnalysis({ ...analysis, ...bad }), null, JSON.stringify(bad))
  const clean = checkAnalysis({ ...analysis, extra: 'x' })
  assert.ok(clean && !('extra' in clean))
  assert.equal(parseBackup(backup({ analyses: [analysis, { ...analysis, id: '../x' }] })).analyses.length, 1)
})
