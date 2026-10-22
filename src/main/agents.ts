import { app, safeStorage } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { agentsTicker, ANALYSTS, keyEnvFor, PROVIDERS, type ProviderId } from '../shared/agents'
import { getLang, t } from '../shared/i18n'
import { SYMBOL_RE } from '../shared/types'

// TradingAgents runs in its own Python, set up on first use inside the app's data folder: uv (a single
// binary, pinned with checksums) downloads a managed Python and installs TradingAgents at a pinned commit.
// Nothing is installed system-wide and the user needs no Python of their own.
const UV_VERSION = '0.12.24'
const UV_BUILDS: Partial<Record<NodeJS.Platform, { file: string; sha256: string; exe: string }>> = {
  win32: {
    file: 'uv-x86_64-pc-windows-msvc.zip',
    sha256: '7c38608c8a18ee137d748a1773053b07ec8f3a30fab49aebaa6f4e4efeceb019',
    exe: 'uv.exe'
  },
  linux: {
    file: 'uv-x86_64-unknown-linux-gnu.tar.gz',
    sha256: 'b4dfaef47d491a7296981f8374a4595f55dbf84e8937c8ecd2983574d8bb3da6',
    exe: 'uv'
  }
}
const TRADINGAGENTS = { version: '0.7.0', commit: 'e8f5503e9b86d5c2710b0c76b1f686703968c9df' }
const PYTHON_VERSION = '3.13'

const base = (): string => join(app.getPath('userData'), 'agents')
const build = () => (process.arch === 'x64' ? UV_BUILDS[process.platform] : undefined)
const uvExe = (): string => join(base(), 'uv', build()?.exe ?? 'uv')
const venvPython = (): string =>
  process.platform === 'win32' ? join(base(), 'venv', 'Scripts', 'python.exe') : join(base(), 'venv', 'bin', 'python')
const markerFile = (): string => join(base(), 'installed.json')
const resource = (file: string): string =>
  app.isPackaged ? join(process.resourcesPath, 'agents', file) : join(app.getAppPath(), 'resources', 'agents', file)
const runner = (): string => resource('kandleos_agents.py')
// TradingAgents and all its dependencies with their hashes: what gets installed is exactly what was locked.
const lockFile = (): string => resource('requirements.lock')
let lockHashCache: string | undefined
/** Part of the install marker, so an updated lock file sets the environment up again. */
const lockHash = (): string => (lockHashCache ??= createHash('sha256').update(readFileSync(lockFile())).digest('hex'))

// uv keeps its cache and the Python it downloads next to the environment, so removing the folder removes all.
const uvEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  UV_CACHE_DIR: join(base(), 'cache'),
  UV_PYTHON_INSTALL_DIR: join(base(), 'python'),
  UV_PYTHON_PREFERENCE: 'only-managed',
  UV_NO_CONFIG: '1'
})

export interface AgentsStatus {
  supported: boolean
  installed: boolean
  version?: string
}

export function agentsStatus(): AgentsStatus {
  if (!build()) return { supported: false, installed: false }
  try {
    const marker = JSON.parse(readFileSync(markerFile(), 'utf8'))
    const installed = marker.commit === TRADINGAGENTS.commit && marker.lock === lockHash() && existsSync(venvPython())
    return { supported: true, installed, version: installed ? TRADINGAGENTS.version : undefined }
  } catch {
    return { supported: true, installed: false }
  }
}

export interface SetupProgress {
  step: 'uv' | 'python' | 'packages' | 'done'
  message: string
  /** Share of the uv download, 0-1. */
  share?: number
}

/** Runs a command; each output line goes to `onLine`. Rejects with the last lines on a non-zero exit. */
function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, onLine?: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, windowsHide: true })
    const tail: string[] = []
    const read = (chunk: Buffer) =>
      chunk
        .toString('utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => {
          tail.push(line)
          if (tail.length > 20) tail.shift()
          onLine?.(line)
        })
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(tail.slice(-6).join('\n') || `Exit ${code}`))))
  })
}

async function downloadUv(onProgress: (p: SetupProgress) => void): Promise<void> {
  const b = build()!
  const url = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${b.file}`
  const archive = join(base(), b.file)
  await mkdir(join(base(), 'uv'), { recursive: true })
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(t('uv-Download fehlgeschlagen (HTTP {status})', { status: res.status }))
  const total = Number(res.headers.get('content-length')) || 0
  const hash = createHash('sha256')
  let done = 0
  const meter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk)
      done += chunk.length
      if (total) onProgress({ step: 'uv', message: t('Lade uv …'), share: done / total })
      cb(null, chunk)
    }
  })
  await pipeline(Readable.fromWeb(res.body as never), meter, createWriteStream(archive))
  // A tampered or truncated program must never be run.
  if (hash.digest('hex') !== b.sha256) {
    await rm(archive, { force: true })
    throw new Error(t('uv-Download beschädigt (Prüfsumme falsch)'))
  }
  // Windows 10+ ships bsdtar, which also unpacks zip archives.
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  const args = process.platform === 'win32' ? ['-xf', archive, '-C', join(base(), 'uv')] : ['-xzf', archive, '-C', join(base(), 'uv'), '--strip-components=1']
  await run(tar, args, process.env)
  await rm(archive, { force: true })
  if (!existsSync(uvExe())) throw new Error(t('uv nach dem Entpacken nicht gefunden'))
}

let installing: Promise<AgentsStatus> | null = null

/** Sets up Python and TradingAgents (a few hundred MB, several minutes on first use). */
export function installAgents(onProgress: (p: SetupProgress) => void): Promise<AgentsStatus> {
  if (!build()) return Promise.reject(new Error(t('Die umfassende Analyse gibt es nur für Windows und Linux (x64).')))
  installing ??= (async () => {
    await rm(markerFile(), { force: true })
    if (!existsSync(uvExe())) await downloadUv(onProgress)
    onProgress({ step: 'python', message: t('Lade Python {version} …', { version: PYTHON_VERSION }) })
    await run(uvExe(), ['venv', join(base(), 'venv'), '--python', PYTHON_VERSION, '--clear'], uvEnv(), (line) =>
      onProgress({ step: 'python', message: line })
    )
    onProgress({ step: 'packages', message: t('Installiere TradingAgents {version} …', { version: TRADINGAGENTS.version }) })
    // A package that does not match its locked hash, or one missing from the lock, fails the whole install.
    await run(uvExe(), ['pip', 'install', '--python', venvPython(), '--require-hashes', '-r', lockFile()], uvEnv(), (line) =>
      onProgress({ step: 'packages', message: line })
    )
    await writeFile(
      markerFile(),
      JSON.stringify({ commit: TRADINGAGENTS.commit, lock: lockHash(), uv: UV_VERSION, python: PYTHON_VERSION })
    )
    onProgress({ step: 'done', message: t('Fertig') })
    return agentsStatus()
  })().finally(() => (installing = null))
  return installing
}

/** Removes Python, packages and caches; stored keys and saved analyses stay. */
export async function removeAgents(): Promise<AgentsStatus> {
  for (const d of ['venv', 'python', 'cache', 'uv', 'work']) await rm(join(base(), d), { recursive: true, force: true })
  await rm(markerFile(), { force: true })
  return agentsStatus()
}

// API keys: one encrypted file (like the Finnhub key), never handed to the window, only to the Python process.
const keysFile = (): string => join(base(), 'keys.bin')
const plainKeysFile = (): string => join(base(), 'keys.json')

function readKeys(): Record<string, string> {
  try {
    return JSON.parse(safeStorage.decryptString(readFileSync(keysFile())))
  } catch {
    try {
      return JSON.parse(readFileSync(plainKeysFile(), 'utf8'))
    } catch {
      return {}
    }
  }
}

/** Which keys are stored (names only). */
export function keyStatus(): Record<string, boolean> {
  return Object.fromEntries(Object.entries(readKeys()).map(([k, v]) => [k, !!v]))
}

export async function setKey(name: unknown, value: unknown): Promise<Record<string, boolean>> {
  if (typeof name !== 'string' || !keyEnvFor(name)) throw new Error(t('Unbekannter Schlüssel'))
  if (typeof value !== 'string' || !/^[\x21-\x7e]{0,300}$/.test(value)) throw new Error(t('Ungültiger Schlüssel'))
  const keys = readKeys()
  if (value) keys[name] = value
  else delete keys[name]
  await mkdir(base(), { recursive: true })
  await rm(keysFile(), { force: true })
  await rm(plainKeysFile(), { force: true })
  if (Object.keys(keys).length) {
    if (safeStorage.isEncryptionAvailable()) await writeFile(keysFile(), safeStorage.encryptString(JSON.stringify(keys)))
    // shortcut: without an OS keyring (some Linux setups) the keys are plain text readable only by this user.
    else await writeFile(plainKeysFile(), JSON.stringify(keys), { mode: 0o600 })
  }
  return keyStatus()
}

export interface AgentsRequest {
  symbol: string
  provider: ProviderId
  deepModel: string
  quickModel: string
  analysts: string[]
  debateRounds: number
  ollamaUrl?: string
}

export interface AgentsEvent {
  event: 'step' | 'tool'
  node: string
  name?: string
  calls?: number
  tokensIn?: number
  tokensOut?: number
}

export interface SavedAnalysis {
  id: string
  symbol: string
  ticker: string
  date: string
  createdAt: number
  durationSec: number
  provider: ProviderId
  deepModel: string
  quickModel: string
  analysts: string[]
  rating: string
  reports: Record<string, string>
  stats: { calls: number; tokensIn: number; tokensOut: number }
}

function checkRequest(req: unknown): AgentsRequest {
  const r = req as AgentsRequest
  const model = /^[\w.:/-]{1,80}$/
  const ok =
    r &&
    typeof r.symbol === 'string' &&
    SYMBOL_RE.test(r.symbol) &&
    PROVIDERS.some((p) => p.id === r.provider) &&
    model.test(r.deepModel) &&
    model.test(r.quickModel) &&
    Array.isArray(r.analysts) &&
    r.analysts.length > 0 &&
    r.analysts.every((a) => ANALYSTS.some(([id]) => id === a)) &&
    Number.isInteger(r.debateRounds) &&
    r.debateRounds >= 1 &&
    r.debateRounds <= 3 &&
    (r.ollamaUrl === undefined || /^https?:\/\/[\w.-]+(:\d+)?\/?$/.test(r.ollamaUrl))
  if (!ok) throw new Error(t('Ungültige Anfrage für die Analyse'))
  return r
}

const resultsDir = (symbol: string): string => join(base(), 'results', symbol.replace(/[^A-Z0-9.=^-]/gi, '_'))
let current: ChildProcess | null = null

/** Runs TradingAgents for a symbol as of today; progress goes to `onEvent`, the saved result is returned. */
export async function runAgents(reqArg: unknown, onEvent: (e: AgentsEvent) => void): Promise<SavedAnalysis> {
  const req = checkRequest(reqArg)
  if (!agentsStatus().installed) throw new Error(t('Die umfassende Analyse ist noch nicht eingerichtet'))
  if (current) throw new Error(t('Es läuft bereits eine Analyse'))
  const keys = readKeys()
  const keyEnv = keyEnvFor(req.provider)
  if (keyEnv && !keys[req.provider]) {
    const provider = t(PROVIDERS.find((p) => p.id === req.provider)?.label ?? req.provider)
    throw new Error(t('Kein API-Key für {provider} hinterlegt', { provider }))
  }
  const { ticker, assetType } = agentsTicker(req.symbol)
  // The analysis date is today in local time; TradingAgents fetches data up to it.
  const date = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const workDir = join(base(), 'work')
  await mkdir(workDir, { recursive: true })
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
  if (keyEnv) env[keyEnv] = keys[req.provider]
  if (keys.fred) env.FRED_API_KEY = keys.fred
  if (req.provider === 'ollama' && req.ollamaUrl) env.OLLAMA_BASE_URL = req.ollamaUrl.replace(/\/?$/, '').replace(/(\/v1)?$/, '/v1')
  const started = Date.now()

  const result = await new Promise<{ rating: string; reports: Record<string, string>; stats: SavedAnalysis['stats'] }>(
    (resolve, reject) => {
      const child = spawn(venvPython(), [runner()], { env, cwd: workDir, windowsHide: true })
      current = child
      const stderr: string[] = []
      let error = ''
      let done: { rating: string; reports: Record<string, string>; stats: SavedAnalysis['stats'] } | null = null
      let buffer = ''
      child.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        let nl: number
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl)
          buffer = buffer.slice(nl + 1)
          try {
            const msg = JSON.parse(line)
            if (msg.event === 'done') done = msg
            else if (msg.event === 'error') error = msg.message
            else if (msg.event === 'step' || msg.event === 'tool') onEvent(msg)
          } catch {
            // Not one of ours: a library printing to stdout.
          }
        }
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr.push(...chunk.toString('utf8').split(/\r?\n/).filter(Boolean))
        if (stderr.length > 40) stderr.splice(0, stderr.length - 40)
      })
      child.on('error', reject)
      child.on('close', (code, signal) => {
        current = null
        if (done) resolve(done)
        else if (signal || child.killed) reject(new Error(t('Abgebrochen')))
        else reject(new Error(error || stderr.slice(-8).join('\n') || t('Analyse beendet mit Code {code}', { code: String(code) })))
      })
      child.stdin.end(
        JSON.stringify({
          ticker,
          assetType,
          date,
          provider: req.provider,
          deepModel: req.deepModel,
          quickModel: req.quickModel,
          analysts: req.analysts,
          debateRounds: req.debateRounds,
          // TradingAgents writes its reports in the interface language.
          language: getLang() === 'de' ? 'German' : 'English',
          workDir: workDir.replace(/\\/g, '/')
        })
      )
    }
  )

  const saved: SavedAnalysis = {
    id: `${date}_${started}`,
    symbol: req.symbol,
    ticker,
    date,
    createdAt: started,
    durationSec: Math.round((Date.now() - started) / 1000),
    provider: req.provider,
    deepModel: req.deepModel,
    quickModel: req.quickModel,
    analysts: req.analysts,
    ...result
  }
  await mkdir(resultsDir(req.symbol), { recursive: true })
  await writeFile(join(resultsDir(req.symbol), `${saved.id}.json`), JSON.stringify(saved))
  return saved
}

export function cancelAgents(): void {
  current?.kill()
}

/** Saved analyses of a symbol, newest first. */
export async function listAnalyses(symbol: unknown): Promise<SavedAnalysis[]> {
  if (typeof symbol !== 'string' || !SYMBOL_RE.test(symbol)) return []
  try {
    const files = (await readdir(resultsDir(symbol))).filter((f) => f.endsWith('.json')).sort().reverse().slice(0, 20)
    return Promise.all(files.map(async (f) => JSON.parse(await readFile(join(resultsDir(symbol), f), 'utf8'))))
  } catch {
    return []
  }
}

/** Models a local Ollama has pulled, or null when it does not answer. */
export async function ollamaModels(url: unknown): Promise<string[] | null> {
  if (typeof url !== 'string' || !/^https?:\/\/[\w.-]+(:\d+)?\/?$/.test(url)) return null
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(3000) })
    const d = await res.json()
    return (d.models ?? []).map((m: { name: string }) => m.name)
  } catch {
    return null
  }
}
