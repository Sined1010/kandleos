// The store file on the phone. Written as temp file + rename, so an app killed mid-write never leaves
// a half file behind; if it died between the two, the finished temp file is still there to read.

export interface Files {
  read(p: string): Promise<string | null>
  write(p: string, s: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  remove(p: string): Promise<void>
}

import { STORE_VERSION, storeShapeOk } from '../shared/storeShape.ts'
import { isObj } from '../shared/types.ts'

const FILE = 'store.json'
const TMP = FILE + '.tmp'

/** Readable for this app: JSON in the right shape, or one from a newer version (kept; the app asks to update). */
const isJson = (s: string | null): s is string => {
  if (s === null) return false
  try {
    const v = JSON.parse(s)
    return isObj(v) && ((typeof v.version === 'number' && v.version > STORE_VERSION) || storeShapeOk(v.state, v.version))
  } catch {
    return false
  }
}

/** A file's text, or null only when it is not there: one that is there but cannot be read (out of memory, I/O error)
 * must not look like a first start, or the app would save its defaults over it. */
export async function readOrMissing(read: () => Promise<string>, exists: () => Promise<boolean>): Promise<string | null> {
  try {
    return await read()
  } catch (e) {
    if (await exists()) throw e
    return null
  }
}

export async function readStore(f: Files, now = Date.now(), setAside = () => {}): Promise<string | null> {
  const main = await f.read(FILE)
  if (isJson(main)) return main
  const tmp = await f.read(TMP)
  if (isJson(tmp)) return tmp
  // The app starts with its defaults and saves them: keep the unreadable file for the user instead of overwriting it.
  if (main !== null) {
    await f.rename(FILE, `store.broken-${now}.json`)
    setAside()
  }
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
