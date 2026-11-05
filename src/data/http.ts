// The one door stock requests go through, so the same code runs in Electron's main process (plain fetch)
// and on Android (native HTTP, src/mobile/capHttp.ts), where a WebView fetch could not send a User-Agent
// or Cookie header and would be stopped by CORS.

export interface HttpInit {
  headers?: Record<string, string>
  /** 'manual': report a redirect (status 3xx) instead of following it. */
  redirect?: 'manual'
  timeoutMs: number
}
export interface HttpRes {
  status: number
  ok: boolean
  json(): Promise<any>
  text(): Promise<string>
  /** Cookies the server set, as "name=value" without attributes. */
  setCookies: string[]
}
export type Http = (url: string, init: HttpInit) => Promise<HttpRes>

export const fetchHttp: Http = async (url, init) => {
  const res = await fetch(url, {
    headers: init.headers,
    redirect: init.redirect ?? 'follow',
    signal: AbortSignal.timeout(init.timeoutMs)
  })
  return {
    status: res.status,
    ok: res.ok,
    json: () => res.json(),
    text: () => res.text(),
    setCookies: res.headers.getSetCookie().map((c) => c.split(';')[0])
  }
}

let current: Http = fetchHttp
export function setHttp(h: Http): void {
  current = h
}
export function http(url: string, init: HttpInit): Promise<HttpRes> {
  return current(url, init)
}
