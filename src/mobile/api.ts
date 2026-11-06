import type { Api } from '../preload'
import { setHttp } from '../data/http'
import { alpacaHasKeys, setAlpacaKeys, useAlpacaKeyStore, type AlpacaKeys } from '../data/alpaca'
import {
  companyInfo,
  finnhubCheck,
  searchSymbols,
  setStockSource,
  stockCandles,
  stockQuotes,
  symbolName
} from '../data/stocks'
import { t } from '../shared/i18n'
import { FINNHUB_KEY_RE } from '../shared/types'
import { capHttp } from './capHttp'
import { appFiles } from './files'
import { KandleNative } from './native'
import { readStore, writeAtomic } from './storeFile'

// window.api on the phone: the same contract the desktop preload offers (src/preload/index.ts), so the
// store, services and components run unchanged. Stock data runs right here (src/data/*) over native HTTP;
// the forecast and the analysis need the PC (Abschnitt 3) and are refused for now.

const notHere = () => Promise.reject(new Error(t('Am Handy nicht verfügbar')))
const noop = () => () => {}

async function secret(name: string): Promise<string | null> {
  return (await KandleNative.secureGet({ name })).value
}

export async function createMobileApi(): Promise<Api> {
  setHttp(capHttp)
  // storeGet and keyGet are synchronous on the desktop (sendSync); here their values are read up front.
  let store = await readStore(appFiles)
  let storeWarned = false
  let finnhub = (await secret('finnhub')) ?? ''
  let alpaca: AlpacaKeys | null = null
  try {
    alpaca = JSON.parse((await secret('alpaca')) ?? 'null')
  } catch {
    alpaca = null
  }
  useAlpacaKeyStore(
    () => alpaca,
    async (k) => {
      alpaca = k
      if (k) await KandleNative.secureSet({ name: 'alpaca', value: JSON.stringify(k) })
      else await KandleNative.secureRemove({ name: 'alpaca' })
    }
  )

  return {
    storeGet: () => store,
    storeSet: async (data) => {
      store = data
      // Every write holds the whole store, so the next one that works repairs the file; tell the user once meanwhile.
      try {
        await writeAtomic(appFiles, data)
        storeWarned = false
      } catch (e) {
        if (storeWarned) return
        storeWarned = true
        alert(t('Änderungen konnten nicht gespeichert werden ({error}). Ist der Speicher des Handys voll?', { error: (e as Error).message }))
      }
    },
    setLanguage: () => {},
    setStockSource: (source, yahooExtra = false) => setStockSource(source, yahooExtra),
    alpacaHasKeys: async () => alpacaHasKeys(),
    alpacaSetKeys: (id, secretKey) => setAlpacaKeys(id, secretKey),
    keyGet: () => finnhub,
    keySet: async (key) => {
      if (key && !FINNHUB_KEY_RE.test(key)) return
      finnhub = key
      if (key) await KandleNative.secureSet({ name: 'finnhub', value: key })
      else await KandleNative.secureRemove({ name: 'finnhub' })
    },
    stockCandles: (symbol, tf, key, extended = false, older) => stockCandles(symbol, tf, key, extended, older),
    stockQuotes: (symbols, key) => stockQuotes(symbols, key),
    searchSymbols: (query) => searchSymbols(query),
    finnhubCheck: (key) => finnhubCheck(key),
    symbolName: (symbol) => symbolName(symbol),
    companyInfo: (symbol, key) => companyInfo(symbol, key),
    backup: { export: notHere, pick: notHere, apply: notHere },
    // The phone shows the license texts as a page of its own (MobileApp listens).
    openLicenses: async () => {
      window.dispatchEvent(new Event('kandleos:licenses'))
      return ''
    },
    latestVersion: async () => null,
    forecast: notHere,
    archive: { add: notHere, due: async () => [], settle: notHere, summary: async () => ({}), clear: notHere },
    modelReady: async () => false,
    onForecastProgress: noop,
    // The phone notifies through KandleNative (alarmWatch.ts).
    notify: () => {},
    agents: {
      status: notHere,
      install: notHere,
      remove: notHere,
      onSetup: noop,
      keys: async () => ({}),
      setKey: notHere,
      run: notHere,
      onEvent: noop,
      cancel: async () => {},
      results: async () => [],
      ollamaModels: async () => null
    },
    // Phone access is the PC's side of the link; the phone pairs through src/mobile/link.ts instead.
    link: {
      status: notHere,
      setEnabled: notHere,
      startPairing: notHere,
      remove: notHere,
      setVpnHost: notHere,
      setAutostart: notHere,
      onRequest: noop
    }
  }
}
