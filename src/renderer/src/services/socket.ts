/**
 * WebSocket that reconnects after drops (Binance closes streams every 24h). Failing again and again it waits longer
 * each time, 3 s doubling up to 60 s: Binance bans an IP that opens too many connections. `onOpen`'s `again` is true
 * after a drop, when bars may be missing. Returns a close function.
 */
export function socket(
  url: string,
  onMessage: (msg: any) => void,
  onOpen?: (ws: WebSocket, again: boolean) => void,
  onDrop?: () => void
): () => void {
  let ws: WebSocket
  let closed = false
  let timer: ReturnType<typeof setTimeout>
  let wait = 3000
  let opened = false
  const connect = () => {
    ws = new WebSocket(url)
    ws.onopen = () => {
      wait = 3000
      onOpen?.(ws, opened)
      opened = true
    }
    ws.onmessage = (e) => onMessage(JSON.parse(e.data))
    ws.onclose = () => {
      if (closed) return
      onDrop?.()
      timer = setTimeout(connect, wait)
      wait = Math.min(wait * 2, 60_000)
    }
  }
  connect()
  return () => {
    closed = true
    clearTimeout(timer)
    ws.close()
  }
}
