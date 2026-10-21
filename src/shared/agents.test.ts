import test from 'node:test'
import assert from 'node:assert/strict'
import { agentsTicker, keyEnvFor, parseDecision, stageOf } from './agents.ts'

// Shapes as TradingAgents 0.7.0 renders them (agents/schemas.py), German body text, English labels.
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
})
