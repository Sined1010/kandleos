/** Open connections per sender address, so one host on the home network or VPN cannot take every slot of the link server. */
export function createSlots(perAddr: number) {
  const open = new Map<string, number>()
  return {
    /** False when this address already holds `perAddr` connections; nothing is counted then. */
    take(addr: string): boolean {
      const n = open.get(addr) ?? 0
      if (n >= perAddr) return false
      open.set(addr, n + 1)
      return true
    },
    give(addr: string): void {
      const n = (open.get(addr) ?? 1) - 1
      if (n > 0) open.set(addr, n)
      else open.delete(addr)
    }
  }
}
