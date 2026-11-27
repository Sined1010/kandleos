import type { PersistStorage, StorageValue } from 'zustand/middleware'

/**
 * The store file behind zustand's persist. A save that changes no stored field by reference (a click that only selects)
 * is skipped: the file is several MB. A write that reports false (disk full) is not skipped next time. After `stop()`
 * nothing is written, so a failed load never saves defaults over it.
 */
export function fileStorage<S>(
  read: () => string | null,
  write: (text: string) => Promise<boolean> | void
): PersistStorage<S> & { stop(): void; isStopped(): boolean } {
  let last: StorageValue<S> | undefined
  let stopped = false
  const same = (a: StorageValue<S>, b: StorageValue<S>): boolean => {
    const x = a.state as Record<string, unknown>
    const y = b.state as Record<string, unknown>
    const keys = Object.keys(y)
    return a.version === b.version && keys.length === Object.keys(x).length && keys.every((k) => Object.is(x[k], y[k]))
  }
  return {
    getItem: () => {
      const text = read()
      return text === null ? null : (JSON.parse(text) as StorageValue<S>)
    },
    setItem: (_name, value) => {
      if (stopped || (last && same(last, value))) return
      last = value
      void write(JSON.stringify(value))?.then((ok) => {
        if (!ok && last === value) last = undefined
      })
    },
    removeItem: () => {},
    stop: () => void (stopped = true),
    isStopped: () => stopped
  }
}
