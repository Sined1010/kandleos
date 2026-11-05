import test from 'node:test'
import assert from 'node:assert/strict'
import { agentsTicker, decisionOf, doneFromBridge, keyEnvFor, parseDecision, parseStructured, stageOf, structuredFromBridge } from './agents.ts'

// Shapes as TradingAgents 0.7.1 renders them (agents/schemas.py), German body text, English labels.
const DECISION = `**Rating**: Overweight

**Executive Summary**: Solide Zahlen, Rückenwind durch KI-Nachfrage.
Zweite Zeile der Zusammenfassung.

**Investment Thesis**: Margen steigen weiter.

**Price Target**: $360.50

**Time Horizon**: 3-6 Monate`

const TRADER = `**Action**: Buy

**Reasoning**: Momentum und Bewertung passen.

**Entry Price**: 338.2

**Stop Loss**: not provided

**Position Sizing**: 4 % des Portfolios

FINAL TRANSACTION PROPOSAL: **BUY**`

test('parseDecision reads rating, texts, target and the trade proposal', () => {
  const d = parseDecision(DECISION, TRADER, 'Overweight')
  assert.equal(d.rating, 'Overweight')
  assert.equal(d.summary, 'Solide Zahlen, Rückenwind durch KI-Nachfrage.\nZweite Zeile der Zusammenfassung.')
  assert.equal(d.thesis, 'Margen steigen weiter.')
  assert.equal(d.priceTarget, 360.5)
  assert.equal(d.horizon, '3-6 Monate')
  assert.equal(d.action, 'Buy')
  assert.equal(d.entry, 338.2)
  assert.equal(d.stopLoss, null) // "not provided"
  assert.equal(d.sizing, '4 % des Portfolios')
})

test('parseDecision falls back to the rating line and tolerates missing fields', () => {
  const d = parseDecision('**Rating**: sell\n\nKurz.', '', 'REVIEW')
  assert.equal(d.rating, 'Sell')
  assert.equal(d.priceTarget, null)
  assert.equal(d.action, null)
  assert.equal(parseDecision('', '').rating, null)
})

test('parseDecision reads prices with decimal comma as well as thousands separators', () => {
  const target = (v: string) => parseDecision(`**Price Target**: ${v}`, '').priceTarget
  assert.equal(target('$360'), 360)
  assert.equal(target('360.50 USD'), 360.5)
  assert.equal(target('1,234.5'), 1234.5)
  assert.equal(target('1,234 USD'), 1234)
  assert.equal(target('123,45 EUR'), 123.45)
  assert.equal(target('0,5 €'), 0.5)
  assert.equal(target('1.234,56 €'), 1234.56)
  assert.equal(target('1.234.567'), 1234567)
  assert.equal(target('ca. 95,40 € (3 Monate)'), 95.4)
})

test('decisionOf prefers the structured numbers and falls back to the text', () => {
  const reports = { decision: DECISION.replace('$360.50', '123,45 EUR'), trader: TRADER }
  assert.deepEqual(decisionOf(reports, 'Overweight'), parseDecision(reports.decision, reports.trader, 'Overweight'))
  const d = decisionOf(reports, 'Overweight', {
    decision: { rating: 'Buy', priceTarget: 360.5, timeHorizon: null },
    trader: { action: null, entryPrice: null, stopLoss: 320 }
  })
  assert.equal(d.rating, 'Buy')
  assert.equal(d.priceTarget, 360.5)
  assert.equal(d.horizon, '3-6 Monate') // null keeps the text
  assert.equal(d.action, 'Buy')
  assert.equal(d.entry, 338.2)
  assert.equal(d.stopLoss, 320)
})

test('structuredFromBridge keeps only valid numbers and ratings', () => {
  assert.deepEqual(
    structuredFromBridge({ decision: { rating: 'Buy', price_target: 123.4, time_horizon: '3 months' }, trader: { action: 'Sell', entry_price: -1, stop_loss: NaN } }),
    { decision: { rating: 'Buy', priceTarget: 123.4, timeHorizon: '3 months' }, trader: { action: 'Sell', entryPrice: null, stopLoss: null } }
  )
  assert.deepEqual(structuredFromBridge({ decision: { rating: 'Moon', price_target: '5' } }), {
    decision: { rating: null, priceTarget: null, timeHorizon: null }
  })
  assert.equal(structuredFromBridge(null), undefined)
  assert.equal(structuredFromBridge({}), undefined)
  assert.deepEqual(parseStructured({ trader: { action: 'Hold', entryPrice: 5, stopLoss: null } }), { trader: { action: 'Hold', entryPrice: 5, stopLoss: null } })
})

test('agentsTicker turns Binance pairs into Yahoo pairs and leaves stocks alone', () => {
  assert.deepEqual(agentsTicker('BTCUSDT'), { ticker: 'BTC-USD', assetType: 'crypto' })
  assert.deepEqual(agentsTicker('ETHBTC'), { ticker: 'ETH-BTC', assetType: 'crypto' })
  assert.deepEqual(agentsTicker('SAP.DE'), { ticker: 'SAP.DE', assetType: 'stock' })
})

test('stageOf and keyEnvFor map graph nodes and stored keys', () => {
  assert.equal(stageOf('Market Analyst'), 0)
  assert.equal(stageOf('Bear Researcher'), 1)
  assert.equal(stageOf('Portfolio Manager'), 5)
  assert.equal(stageOf('Memory Log'), -1)
  assert.equal(keyEnvFor('anthropic'), 'ANTHROPIC_API_KEY')
  assert.equal(keyEnvFor('qwen'), 'DASHSCOPE_API_KEY')
  assert.equal(keyEnvFor('fred'), 'FRED_API_KEY')
  assert.equal(keyEnvFor('ollama'), null)
  assert.equal(keyEnvFor('evil'), null)
  assert.equal(keyEnvFor('constructor'), null)
  assert.equal(keyEnvFor('toString'), null)
})

test('doneFromBridge keeps only string reports with short keys and finite counts', () => {
  assert.deepEqual(
    doneFromBridge({
      event: 'done',
      id: '../../evil',
      rating: 'Buy',
      reports: { decision: 'ok', market: 42, 'a/b': 'x' },
      stats: { calls: 3, tokensIn: -1, tokensOut: 'many' },
      structured: { decision: { rating: 'Buy' } }
    }),
    { rating: 'Buy', reports: { decision: 'ok' }, stats: { calls: 3, tokensIn: 0, tokensOut: 0 }, structured: { decision: { rating: 'Buy' } } }
  )
  assert.deepEqual(doneFromBridge('nope'), { rating: '', reports: {}, stats: { calls: 0, tokensIn: 0, tokensOut: 0 }, structured: undefined })
})
