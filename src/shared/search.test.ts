import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchCoins, mergeHits, withPrices } from './search.ts'

const names = { BTC: 'Bitcoin', SOL: 'Solana', PEPE: 'Pepe' }
const pairs = new Set(['BTCUSDT', 'SOLUSDT', 'PEPEUSDT', 'PEOPLEUSDT', 'SOLVUSDT'])
const syms = (r: { symbol: string }[]) => r.map((x) => x.symbol)

test('coins: exact symbol first, then known coins, then other Binance symbols', () => {
  assert.deepEqual(syms(matchCoins('pe', pairs, names)), ['PEPEUSDT', 'PEOPLEUSDT'])
  assert.deepEqual(syms(matchCoins('SOL', pairs, names)), ['SOLUSDT', 'SOLVUSDT'])
  assert.deepEqual(syms(matchCoins('bitcoin', pairs, names)), ['BTCUSDT'])
  assert.deepEqual(syms(matchCoins('solusdt', pairs, names)), ['SOLUSDT', 'SOLVUSDT'])
})

test('coins: a known coin not traded on Binance is left out; without the list only known coins count', () => {
  assert.deepEqual(syms(matchCoins('pe', new Set(['PEOPLEUSDT']), names)), ['PEOPLEUSDT'])
  assert.deepEqual(syms(matchCoins('pe', null, names)), ['PEPEUSDT'])
})

test('coins: nothing for an empty base, at most five hits', () => {
  assert.deepEqual(matchCoins('usdt', pairs, names), [])
  const many = new Set(['A1USDT', 'A2USDT', 'A3USDT', 'A4USDT', 'A5USDT', 'A6USDT'])
  assert.equal(matchCoins('a', many, {}).length, 5)
})

test('merge: exact names first, every symbol once', () => {
  const coin = (s: string, name: string) => ({ symbol: s, name, exchange: 'Binance' })
  const stock = (s: string) => ({ symbol: s, name: s, exchange: 'NYSE' })
  assert.deepEqual(syms(mergeHits('sol', [stock('FSLR'), coin('SOLUSDT', 'Solana')], [coin('SOLUSDT', 'Solana'), coin('SOLVUSDT', 'SOLV')])), [
    'SOLUSDT',
    'FSLR',
    'SOLVUSDT'
  ])
  assert.deepEqual(syms(mergeHits('bitcoin', [stock('BTC=F')], [coin('BTCUSDT', 'Bitcoin')])), ['BTCUSDT', 'BTC=F'])
  // A stock with exactly that ticker comes before a coin of the same symbol.
  assert.deepEqual(syms(mergeHits('meta', [stock('META')], [coin('METAUSDT', 'META')])), ['META', 'METAUSDT'])
})

test('with Alpaca as the stock source, OTC hits (no prices there) are left out and the home listing leads', () => {
  const hit = (symbol: string, exchange: string) => ({ symbol, name: 'Infineon', exchange, kind: 'stock' as const })
  const alpaca = [hit('IFNNY', 'OTC'), hit('IFNNF', 'OTC')]
  const yahoo = [hit('IFX.DE', 'XETRA'), hit('IFNNY', 'OQX'), hit('IFXA.HA', 'Hanover'), hit('IFNNF', 'Other OTC')]
  assert.deepEqual(syms(mergeHits('Infineon', withPrices([...alpaca, ...yahoo], 'alpaca'), [])), ['IFX.DE', 'IFXA.HA'])
  // Yahoo has OTC prices itself
  assert.deepEqual(syms(withPrices(yahoo, 'yahoo')), ['IFX.DE', 'IFNNY', 'IFXA.HA', 'IFNNF'])
})
