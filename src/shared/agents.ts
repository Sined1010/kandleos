// TradingAgents (multi-agent LLM analysis) as seen from KandleOS: the providers a user can choose, how a run's
// progress maps to stages, and how its final texts are read. The Python side is resources/agents/kandleos_agents.py.
import { cryptoQuoteAsset, isCrypto } from './types.ts'

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'deepseek' | 'qwen' | 'ollama'

export interface Provider {
  id: ProviderId
  label: string
  /** Environment variable TradingAgents reads the key from; null for local models. */
  keyEnv: string | null
  /** Where to get a key. */
  keyUrl?: string
  /** Model choices of TradingAgents 0.7.0 (llm_clients/model_catalog.py); any other ID can be typed in. */
  quick: string[]
  deep: string[]
}

export const PROVIDERS: Provider[] = [
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    keyEnv: 'ANTHROPIC_API_KEY',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    quick: ['claude-sonnet-5', 'claude-haiku-4-5'],
    deep: ['claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-5']
  },
  {
    id: 'openai',
    label: 'OpenAI',
    keyEnv: 'OPENAI_API_KEY',
    keyUrl: 'https://platform.openai.com/api-keys',
    quick: ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-5.6-terra'],
    deep: ['gpt-6-sol', 'gpt-6-astra', 'gpt-5.6', 'gpt-5.5']
  },
  {
    id: 'google',
    label: 'Google Gemini',
    keyEnv: 'GOOGLE_API_KEY',
    keyUrl: 'https://aistudio.google.com/apikey',
    quick: ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
    deep: ['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.5-flash']
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    keyEnv: 'DEEPSEEK_API_KEY',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    quick: ['deepseek-flash'],
    deep: ['deepseek-v4-pro', 'deepseek-flash']
  },
  {
    id: 'qwen',
    label: 'Qwen (Alibaba)',
    keyEnv: 'DASHSCOPE_API_KEY',
    keyUrl: 'https://modelstudio.console.alibabacloud.com/',
    quick: ['qwen3.8-flash'],
    deep: ['qwen3.8-max', 'qwen3.8-flash']
  },
  {
    id: 'ollama',
    label: 'Lokal (Ollama)',
    keyEnv: null,
    quick: ['qwen3:latest', 'gpt-oss:latest', 'glm-4.7-flash:latest'],
    deep: ['glm-4.7-flash:latest', 'gpt-oss:latest', 'qwen3:latest']
  }
]

export const providerById = (id: ProviderId): Provider => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]

/** Keys KandleOS can store besides the providers' own: FRED (free macro data). */
export const EXTRA_KEYS = { fred: 'FRED_API_KEY' } as const
export type KeyName = ProviderId | keyof typeof EXTRA_KEYS

/** Environment variable for a stored key name, or null when there is none (e.g. local models). */
export function keyEnvFor(name: string): string | null {
  if (name in EXTRA_KEYS) return EXTRA_KEYS[name as keyof typeof EXTRA_KEYS]
  return PROVIDERS.find((p) => p.id === name)?.keyEnv ?? null
}

export const ANALYSTS = [
  ['market', 'Markt & Technik'],
  ['social', 'Stimmung'],
  ['news', 'Nachrichten'],
  ['fundamentals', 'Fundamentaldaten']
] as const
export type AnalystId = (typeof ANALYSTS)[number][0]

/** A run's stages in order; `nodes` are the TradingAgents graph nodes that belong to it. */
export const STAGES = [
  { id: 'analysts', label: 'Analysten sammeln Daten', nodes: ['Market Analyst', 'Social Media Analyst', 'Sentiment Analyst', 'News Analyst', 'Fundamentals Analyst'] },
  { id: 'debate', label: 'Bull- und Bear-Debatte', nodes: ['Bull Researcher', 'Bear Researcher'] },
  { id: 'plan', label: 'Research-Manager entscheidet', nodes: ['Research Manager'] },
  { id: 'trader', label: 'Trader plant den Trade', nodes: ['Trader'] },
  { id: 'risk', label: 'Risiko-Debatte', nodes: ['Aggressive Analyst', 'Neutral Analyst', 'Conservative Analyst'] },
  { id: 'portfolio', label: 'Portfolio-Manager urteilt', nodes: ['Portfolio Manager'] }
] as const

/** Stage index of a graph node; analyst names vary a little, so any "... Analyst" before the debate counts. */
export function stageOf(node: string): number {
  const i = STAGES.findIndex((s) => (s.nodes as readonly string[]).includes(node))
  if (i >= 0) return i
  return /Analyst$/.test(node) ? 0 : -1
}

/** Ticker and asset type for TradingAgents: Binance pairs become Yahoo pairs (BTCUSDT → BTC-USD). */
export function agentsTicker(symbol: string): { ticker: string; assetType: 'stock' | 'crypto' } {
  if (!isCrypto(symbol)) return { ticker: symbol, assetType: 'stock' }
  const quote = cryptoQuoteAsset(symbol)
  const base = symbol.slice(0, -quote.length)
  return { ticker: `${base}-${/^(USDT|USDC|FDUSD)$/.test(quote) ? 'USD' : quote}`, assetType: 'crypto' }
}

export const RATINGS = ['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell'] as const
export type Rating = (typeof RATINGS)[number]

export interface Decision {
  rating: Rating | null
  summary: string
  thesis: string
  priceTarget: number | null
  horizon: string
  action: 'Buy' | 'Hold' | 'Sell' | null
  entry: number | null
  stopLoss: number | null
  sizing: string
}

/** Value of a "**Label**: value" line; the labels stay English whatever language the texts are in. */
function field(text: string, label: string): string {
  const m = new RegExp(`\\*\\*${label}\\*\\*\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*\\n\\*\\*[A-Z][A-Za-z ]+\\*\\*\\s*:|\\n\\s*\\nFINAL TRANSACTION PROPOSAL|$)`).exec(text)
  const value = m?.[1].trim() ?? ''
  return /^(not provided|none|n\/a)$/i.test(value) ? '' : value
}

/** First number in a value like "$360", "360.50 USD" or "1,234.5". */
function price(value: string): number | null {
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(value)
  if (!m) return null
  const n = Number(m[0].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Reads the Portfolio Manager's decision and the Trader's proposal (TradingAgents' rendered markdown). */
export function parseDecision(decision: string, trader: string, rating?: string): Decision {
  // Rating and action are one word; whatever follows on later lines is not part of them.
  const word = (v: string) => v.split('\n')[0].replace(/\*/g, '').trim().toLowerCase()
  const asRating = (v: string): Rating | null => RATINGS.find((r) => r.toLowerCase() === word(v)) ?? null
  const action = word(field(trader, 'Action'))
  return {
    rating: asRating(rating ?? '') ?? asRating(field(decision, 'Rating')),
    summary: field(decision, 'Executive Summary'),
    thesis: field(decision, 'Investment Thesis'),
    priceTarget: price(field(decision, 'Price Target')),
    horizon: field(decision, 'Time Horizon'),
    action: (['Buy', 'Hold', 'Sell'] as const).find((a) => a.toLowerCase() === action) ?? null,
    entry: price(field(trader, 'Entry Price')),
    stopLoss: price(field(trader, 'Stop Loss')),
    sizing: field(trader, 'Position Sizing')
  }
}
