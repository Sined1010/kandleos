/**
 * The stock source's error over several poll groups (Yahoo for other exchanges every 5 s, Alpaca every 60 s): each
 * answer replaces only its own group's, so a group that keeps working cannot hide one that fails. Group 0 is the first
 * poll of all stocks; it counts until every started group has answered once (a fast group alone may not hold the
 * failing stocks).
 */
export function pollErrors(): { start(group: number): void; report(group: number, error: string | null): string | null } {
  const started = new Set<number>()
  const errors = new Map<number, string | null>()
  return {
    start: (group) => void started.add(group),
    report: (group, error) => {
      errors.set(group, error)
      if (started.size && [...started].every((g) => errors.has(g))) errors.delete(0)
      return [...errors.values()].find((e) => e) ?? null
    }
  }
}
