import { CapacitorHttp } from '@capacitor/core'
import type { Http } from '../data/http'
import { cookiePairs } from './cookies'

/** Stock requests on the phone: native HTTP, so User-Agent/Cookie headers work and CORS does not apply. */
export const capHttp: Http = async (url, init) => {
  let res
  try {
    res = await CapacitorHttp.request({
      url,
      method: 'GET',
      headers: init.headers,
      connectTimeout: init.timeoutMs,
      readTimeout: init.timeoutMs,
      disableRedirects: init.redirect === 'manual',
      responseType: 'text'
    })
  } catch (e) {
    // data/alpaca.ts tells a timeout apart by its name, as with fetch's AbortSignal.timeout.
    const err = new Error((e as Error).message)
    if (/timeout|timed out/i.test(err.message)) err.name = 'TimeoutError'
    throw err
  }
  const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '')
  const header = Object.entries(res.headers ?? {}).find(([k]) => k.toLowerCase() === 'set-cookie')?.[1]
  return {
    status: res.status,
    ok: res.status >= 200 && res.status < 300,
    text: async () => text,
    json: async () => JSON.parse(text),
    setCookies: cookiePairs(header)
  }
}
