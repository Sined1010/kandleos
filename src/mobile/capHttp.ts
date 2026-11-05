import { CapacitorHttp } from '@capacitor/core'
import type { Http } from '../data/http'
import { t } from '../shared/i18n'
import { cookiePairs } from './cookies'

const NO_NET = /unable to resolve host|no address associated|failed to connect|network is unreachable|connection abort/i

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
    const msg = (e as Error).message
    // Android's own wording ("Unable to resolve host …") means nothing to the user.
    const err = new Error(NO_NET.test(msg) ? t('Keine Internetverbindung') : msg)
    // data/alpaca.ts tells a timeout apart by its name, as with fetch's AbortSignal.timeout.
    if (/timeout|timed out/i.test(msg)) err.name = 'TimeoutError'
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
