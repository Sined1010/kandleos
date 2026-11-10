// The forecast archive on disk (userData/forecasts): archive.jsonl gets one line per forecast and per settlement,
// only ever appended to; summary.json holds the small running totals the window shows. No electron import, so the
// tests can point it at a temporary folder.
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { addToSummary, closesAt, parseEntry, shouldArchive, summaryKey, type ArchiveEntry, type Bands, type Settlement, type SummaryRow } from '../shared/archive.ts'

/** Raw lines above this are thinned out, oldest settled forecasts first; their results stay in the summary. */
export const ARCHIVE_RAW_LIMIT = 20 * 1024 * 1024

type Line = { entry: ArchiveEntry } | { settled: string; s: Settlement } | { dropped: string }

const share = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
const bands = (b: unknown): b is Bands => {
  const x = b as Bands | null
  return !!x && share(x.in50) && share(x.in80) && share(x.in90)
}

/** Checks a settlement from the window or a backup before it counts. */
function parseSettlement(v: unknown, id: string): Settlement | null {
  const s = v as Settlement | null
  const ok =
    !!s &&
    bands(s.hits?.raw) &&
    bands(s.hits?.shown) &&
    num(s.err) &&
    num(s.naive) &&
    share(s.up) &&
    typeof s.rose === 'boolean' &&
    typeof s.dir === 'boolean' &&
    Number.isInteger(s.steps) &&
    s.steps > 0 &&
    num(s.end)
  return ok ? { id, hits: { raw: { ...s.hits.raw }, shown: { ...s.hits.shown } }, err: s.err, naive: s.naive, up: s.up, rose: s.rose, dir: s.dir, steps: s.steps, end: s.end } : null
}

function parseLine(text: string): Line | null {
  let v: Record<string, unknown>
  try {
    v = JSON.parse(text)
  } catch {
    return null
  }
  if (!v || typeof v !== 'object') return null
  if ('entry' in v) {
    const entry = parseEntry(v.entry)
    return entry && { entry }
  }
  if (typeof v.settled === 'string') {
    const s = parseSettlement(v.s, v.settled)
    return s && { settled: v.settled, s }
  }
  return typeof v.dropped === 'string' ? { dropped: v.dropped } : null
}

const parseSummary = (v: unknown): Record<string, SummaryRow> | null => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const rows = Object.values(v as Record<string, SummaryRow>)
  const ok = rows.every(
    (r) =>
      r &&
      typeof r.key === 'string' &&
      num(r.settled) &&
      num(r.independent) &&
      num(r.lastIndependentEnd) &&
      num(r.sum?.err) &&
      num(r.sum?.naive) &&
      num(r.sum?.dir) &&
      ['raw', 'shown'].every((k) => ['in50', 'in80', 'in90'].every((b) => num((r.sum as never)[k]?.[b]))) &&
      Array.isArray(r.chance) &&
      r.chance.length === 3 &&
      r.chance.every((g) => num(g?.cases) && num(g?.said) && num(g?.rose))
  )
  return ok ? (v as Record<string, SummaryRow>) : null
}

export function createArchive(dir: string, rawLimit = ARCHIVE_RAW_LIMIT) {
  const file = join(dir, 'archive.jsonl')
  const summaryFile = join(dir, 'summary.json')
  const entries = new Map<string, ArchiveEntry>()
  const closed = new Set<string>()
  const settlements = new Map<string, Settlement>()
  let rows: Record<string, SummaryRow> = {}
  let size = 0
  let endsWithNewline = true
  let loaded: Promise<void> | null = null
  // One operation at a time, so appends and rewrites never interleave.
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    // A failed load is tried again on the next call instead of sticking.
    const run = queue.then(() => (loaded ??= load().catch((e) => ((loaded = null), Promise.reject(e)))).then(fn))
    queue = run.catch(() => {})
    return run
  }

  function apply(line: Line): void {
    if ('entry' in line) entries.set(line.entry.id, line.entry)
    else if ('settled' in line) {
      closed.add(line.settled)
      settlements.set(line.settled, line.s)
    } else closed.add(line.dropped)
  }

  async function load(): Promise<void> {
    const text = await readFile(file, 'utf8').catch(() => '')
    size = Buffer.byteLength(text)
    endsWithNewline = !text || text.endsWith('\n')
    for (const l of text.split('\n')) if (l.trim()) {
      const line = parseLine(l)
      if (line) apply(line)
    }
    // Recomputed only when the file is missing or broken: after thinning, its totals hold more than the lines do,
    // so a merely unreadable file (locked by a virus scanner, say) must fail instead of being replaced.
    const text2 = await readFile(summaryFile, 'utf8').catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return null
      throw e
    })
    let parsed: unknown = null
    try {
      parsed = text2 === null ? null : JSON.parse(text2)
    } catch {
      parsed = null
    }
    rows = parseSummary(parsed) ?? recompute()
  }

  function recompute(): Record<string, SummaryRow> {
    const out: Record<string, SummaryRow> = {}
    const done = [...settlements.keys()].map((id) => entries.get(id)).filter((e): e is ArchiveEntry => !!e)
    done.sort((a, b) => a.baseTime - b.baseTime)
    for (const e of done) addToSummary(out, e, settlements.get(e.id)!)
    return out
  }

  async function append(line: Line): Promise<void> {
    await mkdir(dir, { recursive: true })
    const text = (endsWithNewline ? '' : '\n') + JSON.stringify(line) + '\n'
    await appendFile(file, text, 'utf8')
    size += Buffer.byteLength(text)
    endsWithNewline = true
    apply(line)
  }

  async function writeAtomic(path: string, text: string): Promise<void> {
    await mkdir(dir, { recursive: true })
    await writeFile(path + '.tmp', text, 'utf8')
    await rename(path + '.tmp', path)
  }

  /** Rewrites the lines without the oldest settled forecasts until well under the limit. */
  async function thin(): Promise<void> {
    if (size <= rawLimit) return
    const textOf = (e: ArchiveEntry) => {
      const s = settlements.get(e.id)
      const lines: Line[] = [{ entry: e }, ...(s ? [{ settled: e.id, s }] : closed.has(e.id) ? [{ dropped: e.id }] : [])]
      return lines.map((l) => JSON.stringify(l) + '\n').join('')
    }
    const texts = new Map([...entries.values()].map((e) => [e.id, textOf(e)]))
    let total = [...texts.values()].reduce((n, t) => n + Buffer.byteLength(t), 0)
    const old = [...entries.values()].filter((e) => closed.has(e.id)).sort((a, b) => a.baseTime - b.baseTime)
    for (const e of old) {
      if (total <= rawLimit * 0.8) break
      total -= Buffer.byteLength(texts.get(e.id)!)
      texts.delete(e.id)
      entries.delete(e.id)
      settlements.delete(e.id)
      closed.delete(e.id)
    }
    const text = [...texts.values()].join('')
    await writeAtomic(file, text)
    size = Buffer.byteLength(text)
    endsWithNewline = true
  }

  return {
    /** Stores a forecast unless one for the same candle (or, for automatic ones, the same span) is there. */
    add: (v: unknown) =>
      serial(async () => {
        const e = parseEntry(v)
        if (!e || entries.has(e.id)) return false
        // Open forecasts are never thinned; past twice the limit no new one is taken, so the file cannot grow without end.
        if (size > rawLimit * 2) return false
        const key = summaryKey(e)
        if (!shouldArchive(e, [...entries.values()].filter((p) => summaryKey(p) === key))) return false
        await append({ entry: e })
        return true
      }),
    /** Unsettled forecasts whose last bar has closed, oldest first. */
    due: (symbol?: string, now = Date.now() / 1000) =>
      serial(async () =>
        [...entries.values()]
          .filter((e) => !closed.has(e.id) && (!symbol || e.symbol === symbol))
          .filter((e) => closesAt(e) <= now)
          .sort((a, b) => a.baseTime - b.baseTime)
      ),
    /** Records the result of a forecast, or that it cannot be settled. */
    settle: (id: unknown, v: unknown) =>
      serial(async () => {
        const e = typeof id === 'string' ? entries.get(id) : undefined
        if (!e || closed.has(e.id)) return
        if (v === 'unsettleable') return append({ dropped: e.id }).then(thin)
        const s = parseSettlement(v, e.id)
        if (!s) return
        await append({ settled: e.id, s })
        addToSummary(rows, e, s)
        await writeAtomic(summaryFile, JSON.stringify(rows))
        await thin()
      }),
    summary: (key?: unknown) =>
      serial(async (): Promise<Record<string, SummaryRow>> => {
        if (typeof key !== 'string') return { ...rows }
        return rows[key] ? { [key]: rows[key] } : {}
      }),
    clear: () =>
      serial(async () => {
        await rm(file, { force: true })
        await rm(summaryFile, { force: true })
        entries.clear()
        closed.clear()
        settlements.clear()
        rows = {}
        size = 0
        endsWithNewline = true
      }),
    exportData: () =>
      serial(async () => ({ archive: await readFile(file, 'utf8').catch(() => ''), summary: { ...rows } })),
    /** Replaces the archive with one from a backup; invalid lines are dropped, an invalid summary recomputed. */
    importData: (d: { archive?: unknown; summary?: unknown }) =>
      serial(async () => {
        if (typeof d.archive !== 'string') return
        entries.clear()
        closed.clear()
        settlements.clear()
        const good: string[] = []
        for (const l of d.archive.split('\n')) {
          const line = l.trim() && parseLine(l)
          if (line) {
            apply(line)
            good.push(JSON.stringify(line))
          }
        }
        const text = good.map((l) => l + '\n').join('')
        await writeAtomic(file, text)
        size = Buffer.byteLength(text)
        endsWithNewline = true
        rows = parseSummary(d.summary) ?? recompute()
        await writeAtomic(summaryFile, JSON.stringify(rows))
      })
  }
}

export type ForecastArchive = ReturnType<typeof createArchive>
