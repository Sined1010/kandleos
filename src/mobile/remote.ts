// The phone's side of "the PC computes" (Android Abschnitt 3), without Capacitor: trimming the forecast request,
// waiting for the model download and for an analysis that runs on the PC on its own. api.ts wires it to window.api.
import type { AgentsEnd, AgentsJob } from '../main/agents.ts'
import type { ModelState } from '../main/remoteOps.ts'
import { t } from '../shared/i18n.ts'

export type Call = (op: string, args?: unknown, timeoutMs?: number) => Promise<unknown>
export type { AgentsEnd, AgentsJob }

const sleepMs = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms))
// The PC reads at most this many values per series (main/forecast.ts CONTEXT) and computes in float32 (~7 digits).
const CONTEXT = 2048

/** What the PC's model will look at, and no more: up to 30 backtests on 10,000 bars would not fit the request. */
export function trimSeries(series: number[][]): number[][] {
  return series.map((s) => s.slice(-CONTEXT).map((v) => Number(v.toPrecision(7))))
}

/** Starts the model download on the PC and waits for it; `onPct` gets the percents, a failed download throws. */
export async function waitForModel(call: Call, onPct: (pct: number) => void, sleep = sleepMs): Promise<void> {
  await call('model.load')
  for (;;) {
    const s = (await call('model.state')) as ModelState
    if (s.pct !== null) onPct(s.pct)
    if (s.ready) return
    if (s.error) throw new Error(s.error)
    await sleep(1500)
  }
}

// The PC forgot the run (restarted while it ran) when it answers this often with neither it running nor its end.
const GONE_AFTER = 3

// As long as the background check (AnalysisWorker.java): no run takes that long.
const MAX_WAIT_MS = 3 * 60 * 60 * 1000

/**
 * Follows a run started on the PC until it ends; `onJob` gets its progress. Lost connections are waited out:
 * the run goes on on the PC regardless. `stop` ("Abbrechen", even with the PC off) and 3 hours end the wait.
 */
export async function waitForRun(
  call: Call,
  started: number,
  onJob: (j: AgentsJob) => void,
  sleep = sleepMs,
  stop: () => boolean = () => false,
  now: () => number = Date.now
): Promise<AgentsEnd> {
  let gone = 0
  const until = now() + MAX_WAIT_MS
  for (;;) {
    if (stop()) throw new Error(t('Abgebrochen'))
    if (now() > until) throw new Error(t('Die Analyse am PC wurde unterbrochen'))
    // Asks for this run's end, so a later run on the PC does not hide it. Offline for a moment: null, ask again.
    const j = (await call('agents.job', started).catch(() => null)) as { running: AgentsJob | null; last: AgentsEnd | null } | null
    if (j) {
      if (j.last?.started === started) return j.last
      if (j.running?.started === started) onJob(j.running)
      if (!j.running && ++gone >= GONE_AFTER) throw new Error(t('Die Analyse am PC wurde unterbrochen'))
      if (j.running) gone = 0
    }
    await sleep(3000)
  }
}
