// What a paired phone may ask the PC to compute (Android Abschnitt 3), without Electron: the forecast model, the
// forecast archive and TradingAgents. A fixed list; everything else (setup, LLM keys, clearing the archive) is
// refused. The callees check their inputs as they do for the window's IPC.
import { isinValid } from '../data/isin.ts'
import { modelsFor, type ProviderId } from '../shared/agents.ts'
import { t } from '../shared/i18n.ts'
import { TF_SECONDS, type Timeframe } from '../shared/types.ts'

// The longest forecast KandleOS makes: 60 months (forecastSteps), with room for long months.
const MAX_HORIZON = 61 * 31 * 86400

/** The part of the window's AgentsConfig (renderer store) a phone's run is built from. */
interface PcAgentsConfig {
  provider?: ProviderId
  models?: Partial<Record<ProviderId, { deep: string; quick: string }>>
  analysts?: unknown
  debateRounds?: unknown
  ollamaUrl?: string
}

export interface RemoteDeps {
  forecast(series: unknown, groups: unknown): Promise<number[][][]>
  modelReady(): Promise<boolean>
  loadModel(onProgress: (share: number) => void): Promise<unknown>
  archive: { add(entry: unknown): Promise<boolean>; summary(key?: string): Promise<Record<string, unknown>> }
  agents: {
    status(): unknown
    /** Names of the stored keys only, never their values. */
    keys(): Record<string, boolean>
    /** The PC window's analysis settings (provider, models, analysts), or null. */
    config(): unknown
    /** Starts a run without waiting for it; rejects at once when it cannot start. */
    start(req: unknown, device: string): Promise<{ started: number }>
    /** With `started`, `last` is the end of that run (or null). */
    job(started?: number): unknown
    cancel(): void
    results(symbol: unknown): Promise<unknown[]>
  }
  /** BaFin's insider dealings of a German ISIN, fetched for a phone whose own request BaFin's headers break. */
  bafin(isin: string): Promise<unknown>
}

export interface ModelState {
  ready: boolean
  /** Download progress in whole percent while it runs (100 once done), null when none ran or it failed. */
  pct: number | null
  error: string
}

export function createRemoteOps(deps: RemoteDeps): (op: string, args: unknown, device: string) => Promise<unknown> {
  // The download takes minutes: the phone starts it and then asks for the progress.
  let loading = false
  let pct: number | null = null
  let error = ''

  const ops: Record<string, (args: unknown, device: string) => unknown> = {
    forecast: async (args) => {
      // Without the model a forecast would start the 480 MB download inside one request.
      if (!(await deps.modelReady())) throw new Error('no-model')
      const a = args as { series?: unknown; groups?: unknown } | null
      return deps.forecast(a?.series, a?.groups)
    },
    'model.ready': () => deps.modelReady(),
    'model.load': () => {
      if (loading) return null
      loading = true
      pct = 0
      error = ''
      deps
        .loadModel((share) => (pct = Math.floor(share * 100)))
        .then(
          () => (pct = 100),
          (e: Error) => {
            pct = null
            error = e.message || 'failed'
          }
        )
        .finally(() => (loading = false))
      return null
    },
    'model.state': async (): Promise<ModelState> => ({ ready: await deps.modelReady(), pct, error }),
    'archive.add': (entry) => {
      // A phone's forecast must start in the past and end within a forecast's horizon. Then it falls due and is
      // settled or given up like the window's, and can be thinned, instead of staying open for ever.
      const e = entry as { timeframe?: unknown; baseTime?: unknown; times?: unknown } | null
      const step = TF_SECONDS[e?.timeframe as Timeframe]
      const times = Array.isArray(e?.times) ? e.times : []
      const last = times[times.length - 1]
      const base = e?.baseTime
      if (!step || typeof base !== 'number' || typeof last !== 'number') return false
      if (base > Date.now() / 1000 + step || last > base + Math.min(65 * step, MAX_HORIZON)) return false
      return deps.archive.add(entry)
    },
    'archive.summary': (key) => deps.archive.summary(typeof key === 'string' ? key : undefined),
    'agents.status': () => deps.agents.status(),
    'agents.keys': () => deps.agents.keys(),
    'agents.config': () => deps.agents.config(),
    'agents.start': (req, device) => {
      // The phone picks only the value and its forecast. Provider, models (paid calls) and the Ollama address are
      // the PC's own settings, as the window would run them; runAgents checks the result as usual.
      const c = deps.agents.config() as PcAgentsConfig | null
      if (!c?.provider) throw new Error(t('Die umfassende Analyse ist noch nicht eingerichtet'))
      const r = req as { symbol?: unknown; chronos?: unknown } | null
      const models = modelsFor(c.provider, c.models?.[c.provider])
      return deps.agents.start(
        {
          symbol: r?.symbol,
          chronos: r?.chronos,
          provider: c.provider,
          deepModel: models.deep,
          quickModel: models.quick,
          analysts: c.analysts,
          debateRounds: c.debateRounds,
          ...(c.provider === 'ollama' && { ollamaUrl: c.ollamaUrl })
        },
        device
      )
    },
    'agents.job': (started) => deps.agents.job(Number.isFinite(started) ? (started as number) : undefined),
    'agents.cancel': () => deps.agents.cancel(),
    'agents.results': (symbol) => deps.agents.results(symbol),
    'events.bafin': (isin) => {
      if (typeof isin !== 'string' || !isin.startsWith('DE') || !isinValid(isin)) throw new Error('bad-isin')
      return deps.bafin(isin)
    }
  }

  return async (op, args, device) => {
    const fn = Object.hasOwn(ops, op) ? ops[op] : undefined
    if (!fn) throw new Error('unknown-op')
    return (await fn(args, device)) ?? null
  }
}
