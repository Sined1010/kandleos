import { BrainCircuit, Check, Circle, Loader2, Settings2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { parseDecision, providerById, STAGES, stageOf, type Decision, type Rating } from '../../../shared/agents'
import { formatPrice } from '../lib/format'
import { renderMarkdown } from '../lib/markdown'
import { useStore } from '../store/useStore'
import { modelsFor } from './AgentsSetup'

type Saved = Awaited<ReturnType<typeof window.api.agents.run>>
type Status = Awaited<ReturnType<typeof window.api.agents.status>>

const RATING: Record<Rating, [label: string, style: string]> = {
  Buy: ['Kaufen', 'bg-up text-white'],
  Overweight: ['Übergewichten', 'bg-up/25 text-up ring-1 ring-up/60'],
  Hold: ['Halten', 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/60'],
  Underweight: ['Untergewichten', 'bg-down/25 text-down ring-1 ring-down/60'],
  Sell: ['Verkaufen', 'bg-down text-white']
}
const ACTION = { Buy: 'Kaufen', Hold: 'Halten', Sell: 'Verkaufen' } as const

const TABS = [
  ['decision', 'Entscheidung'],
  ['market', 'Markt'],
  ['sentiment', 'Stimmung'],
  ['news', 'Nachrichten'],
  ['fundamentals', 'Fundamental'],
  ['debate', 'Debatte'],
  ['trader', 'Trader'],
  ['risk', 'Risiko']
] as const

// The common failures in plain words; the technical message follows for details.
const HINTS: [RegExp, string][] = [
  [/authentication|401|invalid.*(api.?key|x-api-key)|incorrect api key/i, 'Der API-Key wurde vom Anbieter abgelehnt. Bitte in „Einrichten“ prüfen.'],
  [/402|insufficient|credit|billing|quota/i, 'Beim Anbieter fehlt Guthaben oder das Kontingent ist aufgebraucht.'],
  [/429|rate.?limit|overloaded/i, 'Der Anbieter ist ausgelastet oder das Anfragelimit ist erreicht. Später erneut versuchen.'],
  [/connect(ion)? ?(error|refused)|11434|ECONNREFUSED/i, 'Der KI-Dienst ist nicht erreichbar (bei Ollama: läuft es?).'],
  [/model.*(not.?found|does not exist)|404/i, 'Das gewählte Modell gibt es beim Anbieter nicht. Bitte in „Einrichten“ ändern.']
]
const errorText = (e: unknown) => {
  const message = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  const hint = HINTS.find(([re]) => re.test(message))?.[1]
  return hint ? `${hint}

${message}` : message
}
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
const thousands = (n: number) => n.toLocaleString('de-DE')

interface Running {
  symbol: string
  started: number
  stage: number
  node: string
  tool: string
  calls: number
  tokensIn: number
  tokensOut: number
}

/** Side panel of the KI-Analyse (TradingAgents): start a run, follow it, read saved results. */
export default function AgentsPanel({ open, setupOpen, symbol, price, chronos, onClose, onSetup, onLevels }: {
  /** Hidden panels stay mounted, so a running analysis keeps its progress while the panel is closed. */
  open: boolean
  /** The setup dialog is open; when it closes, setup state and keys are read again. */
  setupOpen: boolean
  symbol: string
  /** Current price, for the distance to the price target. */
  price?: number
  /** Median of a shown Chronos forecast at its last step, for comparison. */
  chronos?: { value: number; steps: number } | null
  onClose: () => void
  onSetup: () => void
  /** Entry, stop and target of the shown analysis for the chart, or null. */
  onLevels: (d: Decision | null) => void
}) {
  const config = useStore((s) => s.agentsConfig)
  const [status, setStatus] = useState<Status | null>(null)
  const [keys, setKeys] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Saved[]>([])
  const [shownId, setShownId] = useState<string | null>(null)
  const [running, setRunning] = useState<Running | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('decision')
  const [showLevels, setShowLevels] = useState(true)
  const [, tick] = useState(0)
  const provider = providerById(config.provider)
  const models = modelsFor(config.provider, config.models[config.provider])

  // Setup and keys may have changed in the setup dialog; reread them whenever the panel shows up again.
  useEffect(() => {
    if (!open || setupOpen) return
    window.api.agents.status().then(setStatus)
    window.api.agents.keys().then(setKeys)
  }, [config, open, setupOpen])
  useEffect(() => {
    setShownId(null)
    window.api.agents.results(symbol).then(setSaved)
  }, [symbol])
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  const shown = saved.find((a) => a.id === shownId) ?? saved[0]
  const decision = useMemo(
    () => (shown ? parseDecision(shown.reports.decision ?? '', shown.reports.trader ?? '', shown.rating) : null),
    [shown]
  )
  useEffect(() => {
    onLevels(open && showLevels && decision && shown?.symbol === symbol ? decision : null)
    return () => onLevels(null)
  }, [open, decision, showLevels, shown, symbol, onLevels])

  const ready = status?.installed && (!provider.keyEnv || keys[provider.id])

  const start = async () => {
    setError('')
    const runSymbol = symbol
    setRunning({ symbol: runSymbol, started: Date.now(), stage: 0, node: '', tool: '', calls: 0, tokensIn: 0, tokensOut: 0 })
    const stop = window.api.agents.onEvent((e) =>
      setRunning((r) => {
        if (!r) return r
        const stage = stageOf(e.node)
        return {
          ...r,
          stage: Math.max(r.stage, stage),
          node: e.node || r.node,
          tool: e.event === 'tool' ? e.name ?? '' : r.tool,
          calls: e.calls ?? r.calls,
          tokensIn: e.tokensIn ?? r.tokensIn,
          tokensOut: e.tokensOut ?? r.tokensOut
        }
      })
    )
    try {
      const result = await window.api.agents.run({
        symbol: runSymbol,
        provider: config.provider,
        deepModel: models.deep,
        quickModel: models.quick,
        analysts: config.analysts,
        debateRounds: config.debateRounds,
        ...(config.provider === 'ollama' && { ollamaUrl: config.ollamaUrl })
      })
      if (result.symbol === symbol) {
        setSaved((list) => [result, ...list])
        setShownId(result.id)
        setTab('decision')
      }
    } catch (e) {
      setError(errorText(e))
    } finally {
      stop()
      setRunning(null)
    }
  }

  const head = 'px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted'
  const target = decision?.priceTarget
  return (
    <aside
      className={`absolute inset-y-0 right-0 z-20 w-[400px] flex-col border-l border-line bg-panel/95 text-xs shadow-2xl shadow-black/50 backdrop-blur ${
        open ? 'flex' : 'hidden'
      }`}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label="KI-Analyse"
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <BrainCircuit size={16} className="text-accent" />
        <span className="font-semibold text-white">KI-Analyse</span>
        <span className="text-muted">· {symbol}</span>
        <button onClick={onSetup} className="ml-auto rounded p-1 text-muted hover:bg-line hover:text-white" title="Einrichten" aria-label="KI-Analyse einrichten">
          <Settings2 size={15} />
        </button>
        <button onClick={onClose} className="rounded p-1 text-muted hover:bg-line hover:text-white" aria-label="Schließen">
          <X size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {running ? (
          <div className="p-3">
            <p className="mb-2 text-slate-200">
              Analyse von <span className="font-semibold text-white">{running.symbol}</span> läuft ·{' '}
              {clock(Math.round((Date.now() - running.started) / 1000))}
            </p>
            <ol className="space-y-1.5">
              {STAGES.map((s, i) => (
                <li key={s.id} className={`flex items-center gap-2 ${i > running.stage ? 'text-muted' : 'text-slate-200'}`}>
                  {i < running.stage ? (
                    <Check size={14} className="text-up" />
                  ) : i === running.stage ? (
                    <Loader2 size={14} className="animate-spin text-accent" />
                  ) : (
                    <Circle size={10} className="mx-0.5" />
                  )}
                  {s.label}
                </li>
              ))}
            </ol>
            <p className="mt-3 truncate text-muted" title={running.tool}>
              {running.node || 'Starte …'}
              {running.tool && ` · ${running.tool}`}
            </p>
            <p className="mt-1 text-muted">
              {running.calls} Modellaufrufe · {thousands(running.tokensIn)} Tokens rein · {thousands(running.tokensOut)} raus
            </p>
            <button
              onClick={() => window.api.agents.cancel()}
              className="mt-3 rounded-lg px-3 py-1.5 text-muted ring-1 ring-line hover:text-down"
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <div className="p-3">
            {!status ? (
              <p className="text-muted">Prüfe …</p>
            ) : !ready ? (
              <div className="rounded-lg bg-bg p-3 ring-1 ring-line">
                <p className="text-slate-200">
                  {!status.supported
                    ? 'Die KI-Analyse gibt es nur für Windows und Linux (x64).'
                    : !status.installed
                      ? 'Die KI-Analyse ist noch nicht eingerichtet.'
                      : `Für ${provider.label} ist noch kein API-Key hinterlegt.`}
                </p>
                {status.supported && (
                  <button onClick={onSetup} className="mt-2 rounded-lg bg-brand px-3 py-1.5 font-medium text-white shadow-glow hover:brightness-110">
                    Einrichten
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-lg bg-bg p-3 ring-1 ring-line">
                <p className="text-muted">
                  {provider.label} · {models.deep} / {models.quick} · {config.analysts.length} Analysten ·{' '}
                  {config.debateRounds} Debattenrunde{config.debateRounds > 1 ? 'n' : ''}
                </p>
                <button
                  onClick={start}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow-glow hover:brightness-110"
                >
                  <BrainCircuit size={15} /> {symbol} analysieren
                </button>
                <p className="mt-2 text-[11px] leading-snug text-muted">
                  Dauert einige Minuten{provider.keyEnv ? ' und kostet beim Anbieter Guthaben' : ''}. Daten bis heute; keine
                  Anlageberatung.
                </p>
              </div>
            )}
            {error && <p className="mt-2 whitespace-pre-wrap text-down">{error}</p>}
          </div>
        )}

        {shown && decision && (
          <div className="border-t border-line">
            <div className="flex items-center gap-2 px-3 pt-3">
              <select
                value={shown.id}
                onChange={(e) => setShownId(e.target.value)}
                className="min-w-0 flex-1 rounded-md bg-bg px-1.5 py-1 text-slate-200 outline-none ring-1 ring-line"
                aria-label="Gespeicherte Analysen"
              >
                {saved.map((a) => (
                  <option key={a.id} value={a.id}>
                    {new Date(a.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                    {providerById(a.provider).label} · {RATING[a.rating as Rating]?.[0] ?? a.rating}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 px-3 pt-3">
              {decision.rating ? (
                <span className={`rounded-lg px-3 py-1.5 text-sm font-bold ${RATING[decision.rating][1]}`}>
                  {RATING[decision.rating][0]}
                </span>
              ) : (
                <span className="rounded-lg px-3 py-1.5 text-sm text-muted ring-1 ring-line">Ohne klares Urteil</span>
              )}
              <div className="leading-tight">
                {target !== null && target !== undefined && (
                  <p className="text-slate-200">
                    Kursziel <span className="font-semibold text-white">{formatPrice(target)}</span>
                    {price ? (
                      <span className={target >= price ? 'text-up' : 'text-down'}>
                        {' '}
                        ({target >= price ? '+' : ''}
                        {((target / price - 1) * 100).toFixed(1)} %)
                      </span>
                    ) : null}
                  </p>
                )}
                {decision.horizon && <p className="text-muted">Horizont: {decision.horizon}</p>}
              </div>
            </div>
            {(decision.action || decision.entry || decision.stopLoss || decision.sizing) && (
              <dl className="mx-3 mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg bg-bg p-2 ring-1 ring-line">
                {decision.action && (
                  <>
                    <dt className="text-muted">Trader</dt>
                    <dd className="text-slate-200">{ACTION[decision.action]}</dd>
                  </>
                )}
                {decision.entry !== null && (
                  <>
                    <dt className="text-muted">Einstieg</dt>
                    <dd className="text-slate-200">{formatPrice(decision.entry)}</dd>
                  </>
                )}
                {decision.stopLoss !== null && (
                  <>
                    <dt className="text-muted">Stop-Loss</dt>
                    <dd className="text-slate-200">{formatPrice(decision.stopLoss)}</dd>
                  </>
                )}
                {decision.sizing && (
                  <>
                    <dt className="text-muted">Position</dt>
                    <dd className="text-slate-200">{decision.sizing}</dd>
                  </>
                )}
              </dl>
            )}
            {chronos && (
              <p className="mx-3 mt-2 text-muted" title="Statistische Prognose von Chronos-2 aus dem Kursverlauf, zum Vergleich">
                Chronos-Prognose: Median nach {chronos.steps} Kerzen {formatPrice(chronos.value)}
                {price ? ` (${chronos.value >= price ? '+' : ''}${((chronos.value / price - 1) * 100).toFixed(1)} %)` : ''}
              </p>
            )}
            <label className="mx-3 mt-2 flex w-fit cursor-pointer items-center gap-2 text-muted">
              <input type="checkbox" checked={showLevels} onChange={(e) => setShowLevels(e.target.checked)} className="accent-accent" />
              Kursziel, Einstieg und Stop im Chart zeigen
            </label>
            <p className="mx-3 mt-1 text-[11px] text-muted/80">
              {shown.durationSec ? `${clock(shown.durationSec)} min · ` : ''}
              {shown.stats.calls} Modellaufrufe · {thousands(shown.stats.tokensIn + shown.stats.tokensOut)} Tokens ·{' '}
              {shown.deepModel}
            </p>

            <p className={head}>Berichte</p>
            <div className="mx-3 flex flex-wrap gap-1">
              {TABS.filter(([id]) => shown.reports[id]).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`rounded-md px-2 py-0.5 ${tab === id ? 'bg-brand text-white shadow-glow' : 'text-muted ring-1 ring-line hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              className="md mx-3 mb-4 mt-2 select-text"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(shown.reports[tab] || shown.reports.decision || '') }}
            />
          </div>
        )}
      </div>
    </aside>
  )
}
