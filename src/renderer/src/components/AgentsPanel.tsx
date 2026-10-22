import { BrainCircuit, Check, Circle, Loader2, Settings2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { parseDecision, providerById, RATINGS, STAGES, stageOf, type Decision, type Rating } from '../../../shared/agents'
import { locale, msg, t } from '../../../shared/i18n'
import { formatPrice } from '../lib/format'
import { renderMarkdown } from '../lib/markdown'
import { useStore } from '../store/useStore'
import { modelsFor } from './AgentsSetup'

type Saved = Awaited<ReturnType<typeof window.api.agents.run>>
type Status = Awaited<ReturnType<typeof window.api.agents.status>>

const RATING: Record<Rating, [label: string, style: string]> = {
  Buy: [msg('Kaufen'), 'bg-up text-white'],
  Overweight: [msg('Übergewichten'), 'bg-up/25 text-up ring-1 ring-up/60'],
  Hold: [msg('Halten'), 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/60'],
  Underweight: [msg('Untergewichten'), 'bg-down/25 text-down ring-1 ring-down/60'],
  Sell: [msg('Verkaufen'), 'bg-down text-white']
}
const ACTION = { Buy: msg('Kaufen'), Hold: msg('Halten'), Sell: msg('Verkaufen') } as const

const TABS = [
  ['decision', msg('Entscheidung')],
  ['market', msg('Markt')],
  ['sentiment', msg('Stimmung')],
  ['news', msg('Nachrichten')],
  ['fundamentals', msg('Fundamental')],
  ['debate', msg('Debatte')],
  ['trader', 'Trader'],
  ['risk', msg('Risiko')]
] as const

// The common failures in plain words; the technical message follows for details.
const HINTS: [RegExp, string][] = [
  [/authentication|401|invalid.*(api.?key|x-api-key)|incorrect api key/i, msg('Der API-Key wurde vom Anbieter abgelehnt. Bitte in „Einrichten“ prüfen.')],
  [/402|insufficient|credit|billing|quota/i, msg('Beim Anbieter fehlt Guthaben oder das Kontingent ist aufgebraucht.')],
  [/429|rate.?limit|overloaded/i, msg('Der Anbieter ist ausgelastet oder das Anfragelimit ist erreicht. Später erneut versuchen.')],
  [/connect(ion)? ?(error|refused)|11434|ECONNREFUSED/i, msg('Der KI-Dienst ist nicht erreichbar (bei Ollama: läuft es?).')],
  [/model.*(not.?found|does not exist)|404/i, msg('Das gewählte Modell gibt es beim Anbieter nicht. Bitte in „Einrichten“ ändern.')]
]
const errorText = (e: unknown) => {
  const message = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  const hint = HINTS.find(([re]) => re.test(message))?.[1]
  return hint ? `${t(hint)}

${message}` : message
}
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
const thousands = (n: number) => n.toLocaleString(locale())

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

/** Side panel of the comprehensive analysis with TradingAgents: start a run, follow it, read saved results. */
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
      aria-label={t('Umfassende Analyse')}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <BrainCircuit size={16} className="text-accent" />
        <span className="font-semibold text-white">{t('Umfassende Analyse')}</span>
        <span className="text-muted">{t('mit TradingAgents · {symbol}', { symbol })}</span>
        <button onClick={onSetup} className="ml-auto rounded p-1 text-muted hover:bg-line hover:text-white" title={t('Einrichten')} aria-label={t('Umfassende Analyse einrichten')}>
          <Settings2 size={15} />
        </button>
        <button onClick={onClose} className="rounded p-1 text-muted hover:bg-line hover:text-white" aria-label={t('Schließen')}>
          <X size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {running ? (
          <div className="p-3">
            <p className="mb-2 text-slate-200">
              {t('Analyse von {symbol} läuft · {time}', {
                symbol: running.symbol,
                time: clock(Math.round((Date.now() - running.started) / 1000))
              })}
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
                  {t(s.label)}
                </li>
              ))}
            </ol>
            <p className="mt-3 truncate text-muted" title={running.tool}>
              {running.node || t('Starte …')}
              {running.tool && ` · ${running.tool}`}
            </p>
            <p className="mt-1 text-muted">
              {t('{calls} Modellaufrufe · {in} Tokens rein · {out} raus', {
                calls: running.calls,
                in: thousands(running.tokensIn),
                out: thousands(running.tokensOut)
              })}
            </p>
            <button
              onClick={() => window.api.agents.cancel()}
              className="mt-3 rounded-lg px-3 py-1.5 text-muted ring-1 ring-line hover:text-down"
            >
              {t('Abbrechen')}
            </button>
          </div>
        ) : (
          <div className="p-3">
            {!status ? (
              <p className="text-muted">{t('Prüfe …')}</p>
            ) : !status.installed ? (
              <Intro symbol={symbol} supported={status.supported} onSetup={onSetup} />
            ) : !ready ? (
              <div className="rounded-lg bg-bg p-3 ring-1 ring-line">
                <p className="text-slate-200">{t('Für {provider} ist noch kein API-Key hinterlegt.', { provider: t(provider.label) })}</p>
                <button onClick={onSetup} className="mt-2 rounded-lg bg-brand px-3 py-1.5 font-medium text-white shadow-glow hover:brightness-110">
                  {t('Einrichten')}
                </button>
              </div>
            ) : (
              <div className="rounded-lg bg-bg p-3 ring-1 ring-line">
                <p className="text-muted">
                  {t(provider.label)} · {models.deep} / {models.quick} ·{' '}
                  {t('{analysts} Analysten · {rounds} Debattenrunde(n)', { analysts: config.analysts.length, rounds: config.debateRounds })}
                </p>
                <button
                  onClick={start}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow-glow hover:brightness-110"
                >
                  <BrainCircuit size={15} /> {t('{symbol} analysieren', { symbol })}
                </button>
                <p className="mt-2 text-[11px] leading-snug text-muted">
                  {provider.keyEnv
                    ? t('Dauert einige Minuten und kostet beim Anbieter Guthaben. Daten bis heute; keine Anlageberatung.')
                    : t('Dauert einige Minuten. Daten bis heute; keine Anlageberatung.')}
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
                aria-label={t('Gespeicherte Analysen')}
              >
                {saved.map((a) => (
                  <option key={a.id} value={a.id}>
                    {new Date(a.createdAt).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                    {t(providerById(a.provider).label)} · {RATING[a.rating as Rating] ? t(RATING[a.rating as Rating][0]) : a.rating}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 px-3 pt-3">
              {decision.rating ? (
                <span className={`rounded-lg px-3 py-1.5 text-sm font-bold ${RATING[decision.rating][1]}`}>
                  {t(RATING[decision.rating][0])}
                </span>
              ) : (
                <span className="rounded-lg px-3 py-1.5 text-sm text-muted ring-1 ring-line">{t('Ohne klares Urteil')}</span>
              )}
              <div className="leading-tight">
                {target !== null && target !== undefined && (
                  <p className="text-slate-200">
                    {t('Kursziel')} <span className="font-semibold text-white">{formatPrice(target)}</span>
                    {price ? (
                      <span className={target >= price ? 'text-up' : 'text-down'}>
                        {' '}
                        ({target >= price ? '+' : ''}
                        {((target / price - 1) * 100).toFixed(1)} %)
                      </span>
                    ) : null}
                  </p>
                )}
                {decision.horizon && <p className="text-muted">{t('Horizont: {horizon}', { horizon: decision.horizon })}</p>}
              </div>
            </div>
            {(decision.action || decision.entry || decision.stopLoss || decision.sizing) && (
              <dl className="mx-3 mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg bg-bg p-2 ring-1 ring-line">
                {decision.action && (
                  <>
                    <dt className="text-muted">Trader</dt>
                    <dd className="text-slate-200">{t(ACTION[decision.action])}</dd>
                  </>
                )}
                {decision.entry !== null && (
                  <>
                    <dt className="text-muted">{t('Einstieg')}</dt>
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
                    <dt className="text-muted">{t('Position')}</dt>
                    <dd className="text-slate-200">{decision.sizing}</dd>
                  </>
                )}
              </dl>
            )}
            {chronos && (
              <p className="mx-3 mt-2 text-muted" title={t('Statistische Prognose von Chronos-2 aus dem Kursverlauf, zum Vergleich')}>
                {t('Chronos-Prognose: Median nach {steps} Kerzen {value}', { steps: chronos.steps, value: formatPrice(chronos.value) })}
                {price ? ` (${chronos.value >= price ? '+' : ''}${((chronos.value / price - 1) * 100).toFixed(1)} %)` : ''}
              </p>
            )}
            <label className="mx-3 mt-2 flex w-fit cursor-pointer items-center gap-2 text-muted">
              <input type="checkbox" checked={showLevels} onChange={(e) => setShowLevels(e.target.checked)} className="accent-accent" />
              {t('Kursziel, Einstieg und Stop im Chart zeigen')}
            </label>
            <p className="mx-3 mt-1 text-[11px] text-muted/80">
              {shown.durationSec ? `${clock(shown.durationSec)} min · ` : ''}
              {t('{calls} Modellaufrufe · {tokens} Tokens', {
                calls: shown.stats.calls,
                tokens: thousands(shown.stats.tokensIn + shown.stats.tokensOut)
              })}{' '}
              ·{' '}
              {shown.deepModel}
            </p>

            <p className={head}>{t('Berichte')}</p>
            <div className="mx-3 flex flex-wrap gap-1">
              {TABS.filter(([id]) => shown.reports[id]).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`rounded-md px-2 py-0.5 ${tab === id ? 'bg-brand text-white shadow-glow' : 'text-muted ring-1 ring-line hover:text-white'}`}
                >
                  {t(label)}
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

const STEPS = [
  [msg('Vier Analysten sammeln Daten'), msg('Chart und Indikatoren, Stimmung (Reddit, StockTwits), Nachrichten und Fundamentaldaten wie Bilanzen.')],
  [msg('Bull und Bear debattieren'), msg('Ein Optimist und ein Skeptiker streiten über Chancen und Risiken.')],
  [msg('Ein Trader macht einen Plan'), msg('Kaufen, halten oder verkaufen, mit Einstieg, Stop-Loss und Positionsgröße.')],
  [msg('Drei Risiko-Prüfer hinterfragen ihn'), msg('Offensiv, neutral und vorsichtig.')],
  [msg('Der Portfolio-Manager entscheidet'), msg('Einschätzung in fünf Stufen, Kursziel und Zeithorizont.')]
] as const

const COMPARE: [string, string, string][] = [
  [msg('Methode'), msg('Statistisches Modell (Chronos-2) aus dem Kursverlauf'), msg('Sprachmodelle lesen Daten, Nachrichten und Zahlen')],
  [msg('Ergebnis'), msg('Kursverlauf mit Wahrscheinlichkeitsfächer'), msg('Einschätzung, Kursziel, Trade-Plan und Berichte')],
  [msg('Dauer'), msg('Sekunden'), msg('Einige Minuten')],
  [msg('Kosten'), msg('Kostenlos, läuft lokal'), msg('Eigener API-Key (kostet je Analyse) oder lokal mit Ollama')]
]

/** What the optional comprehensive analysis is, before anything is downloaded. */
function Intro({ symbol, supported, onSetup }: { symbol: string; supported: boolean; onSetup: () => void }) {
  const h = 'mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted'
  return (
    <div className="leading-relaxed">
      <p className="text-sm font-semibold text-white">{t('Ein Team aus KI-Agenten analysiert {symbol}', { symbol })}</p>
      <p className="mt-1 text-slate-300">
        {t('Wie in einem Analystenhaus prüfen mehrere spezialisierte KI-Agenten die Aktie oder Kryptowährung, diskutieren das Für und Wider und schreiben einen ausführlichen Bericht mit Einschätzung. Grundlage ist das Open-Source-Projekt TradingAgents.')}
      </p>

      <p className={h}>{t('So läuft eine Analyse')}</p>
      <ol className="space-y-1.5">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="flex gap-2">
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">
              {i + 1}
            </span>
            <span>
              <span className="text-slate-200">{t(title)}.</span> <span className="text-muted">{t(text)}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className={h}>{t('Das bekommst du')}</p>
      <div className="flex flex-wrap gap-1">
        {RATINGS.map((r) => (
          <span key={r} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${RATING[r][1]}`}>
            {t(RATING[r][0])}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-muted">
        {t('Dazu Kursziel und Zeithorizont, Einstieg und Stop-Loss als Linien im Chart sowie alle Einzelberichte zum Nachlesen. Jede Analyse wird gespeichert.')}
      </p>

      <p className={h}>{t('Unterschied zur KI-Prognose')}</p>
      <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-lg ring-1 ring-line">
        <thead>
          <tr className="bg-bg text-left text-[10px] uppercase tracking-wider text-muted">
            <th className="px-2 py-1 font-semibold" />
            <th className="px-2 py-1 font-semibold">{t('KI-Prognose')}</th>
            <th className="px-2 py-1 font-semibold">{t('Umfassende Analyse')}</th>
          </tr>
        </thead>
        <tbody>
          {COMPARE.map(([label, forecast, agents]) => (
            <tr key={label} className="align-top">
              <td className="border-t border-line px-2 py-1 text-muted">{t(label)}</td>
              <td className="border-t border-line px-2 py-1 text-slate-300">{t(forecast)}</td>
              <td className="border-t border-line px-2 py-1 text-slate-300">{t(agents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className={h}>{t('Was du brauchst')}</p>
      <ul className="ml-4 list-disc space-y-1 text-muted">
        <li>
          <span className="text-slate-300">{t('Einen API-Key')}</span>{' '}
          {t('von Anthropic (Claude), OpenAI, Google, DeepSeek oder Alibaba (Qwen). Jede Analyse kostet dort Guthaben, weil viele Modellaufrufe nötig sind.')}
        </li>
        <li>
          <span className="text-slate-300">{t('Oder Ollama')}</span>{' '}
          {t('für KI auf dem eigenen Rechner: kostenlos und offline, aber langsamer und mit schwächeren Ergebnissen; braucht einen leistungsstarken PC.')}
        </li>
        <li>
          <span className="text-slate-300">{t('Einmalig rund 350 MB')}</span>{' '}
          {t('Download (Python und TradingAgents). Alles bleibt im Datenordner von KandleOS und lässt sich jederzeit wieder entfernen.')}
        </li>
      </ul>
      <p className="mt-3 rounded-lg bg-bg p-2 text-[11px] text-muted ring-1 ring-line">
        {t('Bei einer Analyse gehen das Symbol und die gesammelten Daten an den gewählten KI-Anbieter. Sprachmodelle können sich irren – die Analyse ist keine Anlageberatung. TradingAgents ist ein Open-Source-Projekt von Tauric Research (Apache-2.0); KandleOS ist kein offizielles Produkt dieses Projekts.')}
      </p>

      {supported ? (
        <button
          onClick={onSetup}
          className="mt-3 rounded-lg bg-brand px-3 py-1.5 font-medium text-white shadow-glow hover:brightness-110"
        >
          {t('Einrichten')}
        </button>
      ) : (
        <p className="mt-3 text-down">{t('Die umfassende Analyse gibt es nur für Windows und Linux (x64).')}</p>
      )}
    </div>
  )
}
