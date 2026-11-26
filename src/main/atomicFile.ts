import { readFileSync, renameSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'

// Writes of the same file run one after another: two renames onto one target at once fail on Windows (EPERM).
const queues = new Map<string, Promise<unknown>>()

// A virus scanner or the search indexer holds a just-written file for a moment on Windows; the rename then fails.
const BUSY = new Set(['EPERM', 'EACCES', 'EBUSY'])

async function renameRetry(from: string, to: string): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      return await rename(from, to)
    } catch (e) {
      if (i >= 9 || !BUSY.has((e as NodeJS.ErrnoException).code ?? '')) throw e
      await new Promise((r) => setTimeout(r, 50 + i * 25))
    }
  }
}

/** Write to a temp file, then rename over the target: a crash leaves the old or the new file, never none or half. */
export function writeFileAtomic(path: string, data: string | Uint8Array, mode = 0o600): Promise<void> {
  const run = (queues.get(path) ?? Promise.resolve()).then(async () => {
    await writeFile(path + '.tmp', data, { mode })
    await renameRetry(path + '.tmp', path)
  })
  const done = run.catch(() => {})
  queues.set(path, done)
  void done.then(() => queues.get(path) === done && queues.delete(path))
  return run
}

/**
 * A JSON file's text, or null when there is none. An empty or cut-off file is renamed to `<name>.broken-<now>.json`
 * first: the app then starts with its defaults, and its first save must not overwrite the only copy of the user's data.
 * A file that is there but cannot be read (held by another program) or set aside throws: the caller must not save.
 */
export function readOrSetAside(path: string, now = Date.now()): string | null {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
  try {
    JSON.parse(text)
    return text
  } catch {
    renameSync(path, path.replace(/(\.json)?$/, `.broken-${now}.json`))
    return null
  }
}
