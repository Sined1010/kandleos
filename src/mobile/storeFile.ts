// The store file on the phone. Written as temp file + rename, so an app killed mid-write never leaves
// a half file behind; if it died between the two, the finished temp file is still there to read.

export interface Files {
  read(p: string): Promise<string | null>
  write(p: string, s: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  remove(p: string): Promise<void>
}

const FILE = 'store.json'
const TMP = FILE + '.tmp'

const isJson = (s: string | null): s is string => {
  if (s === null) return false
  try {
    JSON.parse(s)
    return true
  } catch {
    return false
  }
}

export async function readStore(f: Files, now = Date.now()): Promise<string | null> {
  const main = await f.read(FILE)
  if (isJson(main)) return main
  const tmp = await f.read(TMP)
  if (isJson(tmp)) return tmp
  // The app starts with its defaults and saves them: keep the unreadable file for the user instead of overwriting it.
  if (main !== null) await f.rename(FILE, `store.broken-${now}.json`)
  return null
}

let queue: Promise<unknown> = Promise.resolve()

/** Writes in call order; each write finishes before the next starts. */
export function writeAtomic(f: Files, s: string): Promise<void> {
  const run = queue.then(async () => {
    await f.write(TMP, s)
    await f.rename(TMP, FILE)
  })
  queue = run.catch(() => {})
  return run
}
