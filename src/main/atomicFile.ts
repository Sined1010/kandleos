import { rename, writeFile } from 'node:fs/promises'

// Writes of the same file run one after another: two renames onto one target at once fail on Windows (EPERM).
const queues = new Map<string, Promise<unknown>>()

/** Write to a temp file, then rename over the target: a crash leaves the old or the new file, never none or half. */
export function writeFileAtomic(path: string, data: string | Uint8Array, mode = 0o600): Promise<void> {
  const run = (queues.get(path) ?? Promise.resolve()).then(async () => {
    await writeFile(path + '.tmp', data, { mode })
    await rename(path + '.tmp', path)
  })
  const done = run.catch(() => {})
  queues.set(path, done)
  void done.then(() => queues.get(path) === done && queues.delete(path))
  return run
}
