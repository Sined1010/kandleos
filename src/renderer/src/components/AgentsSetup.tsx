import { Check, Download, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ANALYSTS, PROVIDERS, providerById, type ProviderId } from '../../../shared/agents'
import { useStore } from '../store/useStore'

type Status = Awaited<ReturnType<typeof window.api.agents.status>>
type Setup = Parameters<Parameters<typeof window.api.agents.onSetup>[0]>[0]

/** Models in use for a provider: the user's choice, else the catalog's first suggestion. */
export function modelsFor(provider: ProviderId, chosen?: { deep: string; quick: string }) {
  const p = providerById(provider)
  return { deep: chosen?.deep || p.deep[0], quick: chosen?.quick || p.quick[0] }
}

const field = 'w-full rounded-lg bg-bg px-2 py-1.5 text-sm outline-none ring-1 ring-line focus:ring-accent'
const heading = 'mb-1.5 mt-5 text-[10px] font-semibold uppercase tracking-wider text-muted'

/** A key field: shows whether a key is stored (never the key itself) and saves or removes it. */
function KeyField({ name, label, hint, stored, onSaved }: {
  name: string
  label: string
  hint?: React.ReactNode
  stored: boolean
  onSaved: (keys: Record<string, boolean>) => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const save = async (v: string) => {
    try {
      onSaved(await window.api.agents.setKey(name, v.trim()))
      setValue('')
      setError('')
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }
  return (
    <div className="mb-2">
      <label className="mb-1 flex items-center gap-2 text-xs text-muted" htmlFor={`key-${name}`}>
        {label}
        {stored && (
          <span className="inline-flex items-center gap-0.5 text-up">
            <Check size={12} /> gespeichert
          </span>
        )}
      </label>
      <div className="flex gap-2">
        <input
          id={`key-${name}`}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={stored ? '•••••••• (neu eingeben zum Ersetzen)' : 'API-Key einfügen'}
          spellCheck={false}
          autoComplete="off"
          className={field}
        />
        <button
          type="button"
          disabled={!value.trim()}
          onClick={() => save(value)}
          className="rounded-lg bg-brand px-3 text-xs font-medium text-white shadow-glow hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
        >
          Speichern
        </button>
        {stored && (
          <button
            type="button"
            onClick={() => save('')}
            title="Key entfernen"
            aria-label={`${label} entfernen`}
            className="rounded-lg px-2 text-muted ring-1 ring-line hover:text-down"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-down">{error}</p>}
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>}
    </div>
  )
}

/** Setup for the KI-Analyse: Python environment, AI provider with key and models, FRED key, analysts. */
export default function AgentsSetup({ onClose }: { onClose: () => void }) {
  const config = useStore((s) => s.agentsConfig)
  const setConfig = useStore((s) => s.setAgentsConfig)
  const [status, setStatus] = useState<Status | null>(null)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [setupError, setSetupError] = useState('')
  const [keys, setKeys] = useState<Record<string, boolean>>({})
  const [ollama, setOllama] = useState<string[] | null | undefined>(undefined)
  const provider = providerById(config.provider)
  const models = modelsFor(config.provider, config.models[config.provider])

  useEffect(() => {
    window.api.agents.status().then(setStatus)
    window.api.agents.keys().then(setKeys)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Which models the local Ollama has pulled, to offer them by name.
  useEffect(() => {
    if (config.provider !== 'ollama') return
    setOllama(undefined)
    const t = setTimeout(() => window.api.agents.ollamaModels(config.ollamaUrl).then(setOllama), 400)
    return () => clearTimeout(t)
  }, [config.provider, config.ollamaUrl])

  const install = async () => {
    setSetupError('')
    const stop = window.api.agents.onSetup(setSetup)
    try {
      setStatus(await window.api.agents.install())
    } catch (e) {
      setSetupError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      stop()
      setSetup(null)
    }
  }
  const remove = async () => {
    if (confirm('Python-Umgebung der KI-Analyse entfernen? Gespeicherte Keys und Analysen bleiben erhalten.'))
      setStatus(await window.api.agents.remove())
  }
  const setModel = (tier: 'deep' | 'quick', value: string) =>
    setConfig({ models: { ...config.models, [config.provider]: { ...models, [tier]: value.trim() } } })
  const suggestions = (tier: 'deep' | 'quick') => [...new Set([...(ollama ?? []), ...provider[tier]])]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agents-title"
        className="max-h-[90vh] w-[560px] overflow-y-auto rounded-xl border border-line bg-panel/95 p-5 text-sm shadow-2xl backdrop-blur"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 id="agents-title" className="text-base font-semibold text-white">
            KI-Analyse einrichten
          </h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-white" aria-label="Schließen">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Ein Team aus KI-Agenten (TradingAgents, Open Source) analysiert Technik, Stimmung, Nachrichten und
          Fundamentaldaten, diskutiert Chancen und Risiken und gibt eine Einschätzung mit Kursziel. Keine Anlageberatung.
        </p>

        <p className={heading}>1 · Programm</p>
        {!status ? (
          <p className="text-xs text-muted">Prüfe …</p>
        ) : !status.supported ? (
          <p className="text-xs text-down">Die KI-Analyse gibt es nur für Windows und Linux (x64).</p>
        ) : status.installed ? (
          <div className="flex items-center justify-between rounded-lg bg-bg px-3 py-2 ring-1 ring-line">
            <span className="flex items-center gap-1.5 text-xs text-slate-200">
              <Check size={14} className="text-up" /> TradingAgents {status.version} ist eingerichtet
            </span>
            <button type="button" onClick={remove} className="text-xs text-muted hover:text-down">
              Entfernen
            </button>
          </div>
        ) : setup ? (
          <div className="rounded-lg bg-bg px-3 py-2 ring-1 ring-line">
            <p className="text-xs text-slate-200">
              {setup.step === 'uv' ? 'Lade Installationsprogramm (uv) …' : setup.step === 'python' ? 'Lade Python …' : 'Installiere TradingAgents …'}
            </p>
            <div className="mt-1.5 h-1 overflow-hidden rounded bg-line">
              <div
                className={`h-full bg-brand ${setup.share === undefined ? 'w-1/3 animate-pulse' : ''}`}
                style={setup.share !== undefined ? { width: `${Math.round(setup.share * 100)}%` } : undefined}
              />
            </div>
            <p className="mt-1 truncate text-[11px] text-muted" title={setup.message}>
              {setup.message}
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-bg px-3 py-2 ring-1 ring-line">
            <p className="text-xs text-muted">
              Einmalig wird eine eigene Python-Umgebung mit TradingAgents im Datenordner von KandleOS angelegt (einige
              hundert MB, je nach Verbindung ein paar Minuten). Am System wird nichts installiert.
            </p>
            <button
              type="button"
              onClick={install}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white shadow-glow hover:brightness-110"
            >
              <Download size={14} /> Jetzt einrichten
            </button>
            {setupError && <p className="mt-2 whitespace-pre-wrap text-xs text-down">{setupError}</p>}
          </div>
        )}

        <p className={heading}>2 · KI-Anbieter</p>
        <div className="grid grid-cols-3 gap-1.5">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setConfig({ provider: p.id })}
              aria-pressed={config.provider === p.id}
              className={`relative rounded-lg px-2 py-1.5 text-xs ${
                config.provider === p.id ? 'bg-brand text-white shadow-glow' : 'bg-bg text-slate-300 ring-1 ring-line hover:text-white'
              }`}
            >
              {p.label}
              {p.keyEnv && keys[p.id] && <Check size={11} className="absolute right-1 top-1 opacity-80" aria-label="Key gespeichert" />}
            </button>
          ))}
        </div>

        <div className="mt-3">
          {provider.keyEnv ? (
            <KeyField
              name={provider.id}
              label={`API-Key für ${provider.label}`}
              stored={!!keys[provider.id]}
              onSaved={setKeys}
              hint={
                <>
                  Wird verschlüsselt gespeichert und nur an das lokale Analyseprogramm übergeben. Key erstellen:{' '}
                  <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    {provider.keyUrl?.replace(/^https:\/\//, '').split('/')[0]}
                  </a>
                  . Jede Analyse kostet beim Anbieter Guthaben (viele Modellaufrufe).
                </>
              }
            />
          ) : (
            <div className="mb-2">
              <label className="mb-1 block text-xs text-muted" htmlFor="ollama-url">
                Ollama-Adresse
              </label>
              <input
                id="ollama-url"
                value={config.ollamaUrl}
                onChange={(e) => setConfig({ ollamaUrl: e.target.value.trim() })}
                spellCheck={false}
                className={field}
              />
              <p className="mt-1 text-[11px] leading-snug text-muted">
                {ollama === undefined
                  ? 'Prüfe Ollama …'
                  : ollama === null
                    ? 'Ollama antwortet nicht. Installieren von ollama.com, starten und ein Modell laden (z. B. „ollama pull qwen3“).'
                    : ollama.length
                      ? `Ollama läuft, ${ollama.length} Modell(e) geladen. Kostenlos und offline, aber deutlich langsamer und schwächer als Cloud-Modelle.`
                      : 'Ollama läuft, aber es ist noch kein Modell geladen („ollama pull qwen3“).'}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {(['deep', 'quick'] as const).map((tier) => (
              <div key={tier}>
                <label className="mb-1 block text-xs text-muted" htmlFor={`model-${tier}`}>
                  {tier === 'deep' ? 'Modell für Entscheidungen' : 'Modell für Datensammlung'}
                </label>
                <input
                  id={`model-${tier}`}
                  list={`models-${tier}`}
                  value={models[tier]}
                  onChange={(e) => setModel(tier, e.target.value)}
                  spellCheck={false}
                  className={field}
                />
                <datalist id={`models-${tier}`}>
                  {suggestions(tier).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            ))}
          </div>
        </div>

        <p className={heading}>3 · Zusätzliche Daten</p>
        <KeyField
          name="fred"
          label="FRED API-Key (optional, kostenlos)"
          stored={!!keys.fred}
          onSaved={setKeys}
          hint={
            <>
              Makrodaten der US-Notenbank (Zinsen, Inflation, Arbeitsmarkt). Ohne Key fehlen sie nur. Key:{' '}
              <a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noreferrer" className="text-accent hover:underline">
                fred.stlouisfed.org
              </a>
            </>
          }
        />

        <p className={heading}>4 · Analyse</p>
        <div className="grid grid-cols-2 gap-1">
          {ANALYSTS.map(([id, label]) => (
            <label key={id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-bg">
              <input
                type="checkbox"
                checked={config.analysts.includes(id)}
                disabled={config.analysts.length === 1 && config.analysts.includes(id)}
                onChange={(e) =>
                  setConfig({ analysts: e.target.checked ? [...config.analysts, id] : config.analysts.filter((a) => a !== id) })
                }
                className="accent-accent"
              />
              <span className="text-slate-200">{label}</span>
            </label>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-muted">
          Debattenrunden
          <select
            value={config.debateRounds}
            onChange={(e) => setConfig({ debateRounds: Number(e.target.value) })}
            className="rounded-md bg-bg px-1.5 py-0.5 text-slate-200 outline-none ring-1 ring-line"
          >
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="text-[11px]">mehr Runden = gründlicher, aber länger und teurer</span>
        </label>

        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white shadow-glow hover:brightness-110">
            Fertig
          </button>
        </div>
      </div>
    </div>
  )
}
