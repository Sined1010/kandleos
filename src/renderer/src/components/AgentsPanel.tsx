import { BrainCircuit, Check, Circle, Loader2, Settings2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { decisionOf, providerById, RATINGS, STAGES, stageOf, type Decision, type Rating } from '../../../shared/agents'
import { compareWithChronos, readWeighting, type ChronosSkip, type ChronosSnapshot } from '../../../shared/chronosLink'
import { dailyForecast } from '../services/dailyForecast'
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

const SKIP = {
  history: msg('zu wenig Tageshistorie für eine Prognose'),
  load: msg('Tageskurse ließen sich nicht laden'),
  model: msg('das Prognosemodell lief nicht'),
  declined: msg('ohne Prognosemodell gestartet')
} as const
const LEVEL = { low: msg('gering'), medium: msg('mittel'), high: msg('hoch') } as const
const TREND = { up: msg('eher steigend'), down: msg('eher fallend'), flat: msg('keine klare Richtung') } as const
const ZONE = {
  below: msg('unter dem 90 %-Bereich'),
  in90: msg('im 90 %-Bereich'),
  in80: msg('im 80 %-Bereich'),
  in50: msg('im 50 %-Bereich'),
  above: msg('über dem 90 %-Bereich')
} as const
const pct = (v: number) => `${(v * 100).toLocaleString(locale(), { maximumFractionDigits: 0 })} %`

/** Fixed comparison of a saved analysis with the daily Chronos-2 forecast it was given; no language model involved. */
function ChronosBox({ chronos, decision, analysis }: { chronos: ChronosSnapshot | ChronosSkip; decision: Decision; analysis: Saved }) {
  if ('skipped' in chronos)
    return <p className="mx-3 mt-2 text-muted">{t('Ohne Chronos-Abgleich: {reason}.', { reason: t(SKIP[chronos.skipped]) })}</p>
  const c = compareWithChronos(chronos, decision)
  const w = readWeighting(analysis.reports.market ?? '')
  const check = chronos.check
  return (
    <div
      className="mx-3 mt-2 space-y-0.5 rounded-lg bg-bg p-2 ring-1 ring-line"
      title={t('Fester Vergleich ohne Sprachmodell: die Einschätzung der Agenten gegen die tägliche Chronos-2-Prognose, die nur der Markt-Analyst samt Rückblick gesehen hat.')}
    >
      <p className="font-semibold text-slate-200">{t('Abgleich mit Chronos-2')}</p>
      <p>
        {!analysis.analysts.includes('market')
          ? t('Markt-Analyst nicht gewählt: Chronos ging nicht in die Analyse ein.')
          : w
            ? t('Markt-Analyst: Chronos {level} gewichtet – {reason}', { level: t(LEVEL[w.level]), reason: w.reason })
            : t('Markt-Analyst: Gewichtung nicht angegeben')}
      </p>
      <p className={c.direction === 'contradict' ? 'text-orange-400' : ''}>
        {t('Richtung: Chronos {trend}', { trend: t(TREND[c.chronos]) })} ·{' '}
        {c.direction === 'agree' ? t('passt zur Einschätzung') : c.direction === 'contradict' ? t('widerspricht der Einschätzung') : t('kein klarer Vergleich')}
      </p>
      {c.target && (
        <p>
          {t('Kursziel {zone} · {p} Chance, dass der Kurs nach {n} Handelstagen darüber liegt', {
            zone: t(ZONE[c.target.zone]),
            p: pct(c.target.above),
            n: chronos.steps
          })}
        </p>
      )}
      {c.stop && (
        <p>
          {t('Stop-Loss: {p} Chance, dass der Kurs am Ende des Zeitraums darunter liegt (ob er zwischendurch berührt wird, sagt Chronos nicht; der Stop stützt sich teils auf den Marktbericht)', { p: pct(c.stop.below) })}
        </p>
      )}
      <p className={check && check.skill < 0 ? 'text-orange-400' : 'text-muted'}>
        {check
          ? t('Tages-Prognose: {runs} Rückblicke, im 80 %-Bereich {in80}', { runs: check.runs, in80: pct(check.inside80) }) +
            ' · ' +
            (check.skill >= 0 ? t('{p} genauer als „unverändert“', { p: pct(check.skill) }) : t('{p} ungenauer als „unverändert“', { p: pct(-check.skill) }))
          : t('Tages-Prognose ohne Rückblick (zu wenig Historie)')}
      </p>
      <p className="text-[11px] text-muted/80">
        {t('Stand {date} · {pair} · Tageskerzen', { date: new Date(chronos.asOf * 1000).toLocaleDateString(locale()), pair: chronos.pair })}
        {chronos.factor ? ' · ' + t('Bänder ×{f} kalibriert', { f: chronos.factor.toLocaleString(locale(), { maximumFractionDigits: 2 }) }) : ''}
      </p>
    </div>
  )
}

interface Running {
  symbol: string
  started: number
  /** Before the agents start: the daily forecast for the comparison is being prepared. */
  prep?: 'candles' | 'model'
  /** Model download in percent, during the first forecast. */
  pct?: number
  stage: number
  node: string
  tool: string
  calls: number
  tokensIn: number
  tokensOut: number
}

// A run outlives the panel: a tab or language switch rebuilds the chart and this panel while the paid run goes on.
// `cancelled` is set by "Abbrechen" and checked before the agents start (main has nothing to stop while the forecast runs).
const useRun = create<{ running: Running | null; cancelled: boolean; error: string }>(() => ({ running: null, cancelled: false, error: '' }))
const setRunning = (next: Running | null | ((r: Running | null) => Running | null)) =>
  useRun.setState((s) => ({ running: typeof next === 'function' ? next(s.running) : next }))
const setError = (error: string) => useRun.setState({ error })

/** Side panel of the comprehensive analysis with TradingAgents: start a run, follow it, read saved results. */
export default function AgentsPanel({ open, setupOpen, symbol, price, onClose, onSetup, onLevels }: {
  /** Hidden panels stay mounted, so a running analysis keeps its progress while the panel is closed. */
  open: boolean
  /** The setup dialog is open; when it closes, setup state and keys are read again. */
  setupOpen: boolean
  symbol: string
  /** Current price, for the distance to the price target. */
  price?: number
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
  const running = useRun((s) => s.running)
  const error = useRun((s) => s.error)
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('decision')
  const [showLevels, setShowLevels] = useState(true)
  const [, tick] = useState(0)
  // The forecast model is not downloaded yet: ask before a 480 MB download starts with the analysis.
  const [askModel, setAskModel] = useState(false)
  // The symbol shown now, for a run that ends after the user moved on.
  const symbolRef = useRef(symbol)
  symbolRef.current = symbol
  const finnhubKey = useStore((s) => s.finnhubKey)
  const calibrate = useStore((s) => s.forecastRun.calibrate)
  const provider = providerById(config.provider)
  const models = modelsFor(config.provider, config.models[config.provider])

  // Setup and keys may have changed in the setup dialog; reread them whenever the panel shows up again.
  useEffect(() => {
    if (!open || setupOpen) return
    window.api.agents.status().then(setStatus)
    window.api.agents.keys().then(setKeys)
  }, [config, open, setupOpen])
  // Read again when a run ends, so its result shows up even if this panel was rebuilt meanwhile.
  const idle = !running
  useEffect(() => setShownId(null), [symbol])
  useEffect(() => {
    let live = true
    window.api.agents.results(symbol).then((list) => live && setSaved(list))
    return () => {
      live = false
    }
  }, [symbol, idle])
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  const shown = saved.find((a) => a.id === shownId) ?? saved[0]
  const decision = useMemo(
    () => (shown ? decisionOf(shown.reports, shown.rating, shown.structured) : null),
    [shown]
  )
  useEffect(() => {
    onLevels(open && showLevels && decision && shown?.symbol === symbol ? decision : null)
    return () => onLevels(null)
  }, [open, decision, showLevels, shown, symbol, onLevels])

  const ready = status?.installed && (!provider.keyEnv || keys[provider.id])

  /** `load`: download the model if needed; `skip`: analyse without Chronos; `ask`: ask first when it is missing. */
  const start = async (mode: 'ask' | 'load' | 'skip' = 'ask') => {
    if (mode === 'ask' && !(await window.api.modelReady())) return setAskModel(true)
    setAskModel(false)
    setError('')
    const runSymbol = symbol
    useRun.setState({ cancelled: false })
    setRunning({ symbol: runSymbol, started: Date.now(), stage: 0, node: '', tool: '', calls: 0, tokensIn: 0, tokensOut: 0, prep: 'candles' })
    // The first forecast downloads the model; its percent shows while the daily forecast is prepared.
    const stopProgress = window.api.onForecastProgress((pct) => setRunning((r) => (r?.prep ? { ...r, pct } : r)))
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
      const chronos: ChronosSnapshot | ChronosSkip =
        mode === 'skip'
          ? { skipped: 'declined' }
          : await dailyForecast(runSymbol, { finnhubKey, calibrate, onStage: (prep) => setRunning((r) => r && { ...r, prep }) })
      // Cancelled while the forecast was prepared: the paid run must not start.
      if (useRun.getState().cancelled) throw new Error(t('Abgebrochen'))
      setRunning((r) => r && { ...r, prep: undefined, pct: undefined })
      const result = await window.api.agents.run({
        symbol: runSymbol,
        provider: config.provider,
        deepModel: models.deep,
        quickModel: models.quick,
        analysts: config.analysts,
        debateRounds: config.debateRounds,
        chronos,
        ...(config.provider === 'ollama' && { ollamaUrl: config.ollamaUrl })
      })
      // The list itself is read again once the run has ended (above).
      if (result.symbol === symbolRef.current) {
        setShownId(result.id)
        setTab('decision')
      }
    } catch (e) {
      setError(errorText(e))
    } finally {
      stopProgress()
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
      onPointerDown={(e) => e.stopPropagation()}
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
            {running.prep && (
              <p className="mb-2 flex items-center gap-2 text-slate-200">
                <Loader2 size={14} className="animate-spin text-accent" />
                {running.prep === 'candles'
                  ? t('Lade Tageskurse für den Abgleich mit Chronos-2 …')
                  : running.pct !== undefined && running.pct < 100
                    ? t('Lade Modell {pct} %', { pct: running.pct })
                    : t('Tages-Prognose wird berechnet …')}
              </p>
            )}
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
              onClick={() => {
                useRun.setState({ cancelled: true })
                void window.api.agents.cancel()
              }}
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
                {askModel ? (
                  <div className="mt-2">
                    <p className="text-slate-200">
                      {t('Für den Abgleich mit Chronos-2 wird einmalig das Prognosemodell geladen (ca. 480 MB).')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => start('load')}
                        className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white shadow-glow hover:brightness-110"
                      >
                        {t('Modell jetzt laden')}
                      </button>
                      <button onClick={() => start('skip')} className="rounded-lg px-3 py-1.5 text-slate-200 ring-1 ring-line hover:bg-line">
                        {t('Ohne Chronos analysieren')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => start()}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow-glow hover:brightness-110"
                  >
                    <BrainCircuit size={15} /> {t('{symbol} analysieren', { symbol })}
                  </button>
                )}
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
            {shown.chronos && <ChronosBox chronos={shown.chronos} decision={decision} analysis={shown} />}
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
