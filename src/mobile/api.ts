import type { Api } from '../preload'
import type { AgentsEvent, AgentsStatus, SavedAnalysis } from '../main/agents'
import type { SummaryRow } from '../shared/archive'
import { setHttp } from '../data/http'
import { trimSeries, waitForModel, waitForRun, type AgentsEnd, type AgentsJob, type Call } from './remote'
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
import { checkAgentsConfig } from '../shared/agents'
import { t } from '../shared/i18n'
import { checkAnalyses } from '../shared/savedAnalysis'
import { FINNHUB_KEY_RE, SYMBOL_RE } from '../shared/types'
import { capHttp } from './capHttp'
import { tell } from './MessageBox'
import { appFiles } from './files'
import { KandleNative } from './native'
import { readStore, writeAtomic } from './storeFile'

// window.api on the phone: the same contract the desktop preload offers (src/preload/index.ts), so the
// store, services and components run unchanged. Stock data runs right here (src/data/*) over native HTTP;
// the forecast model and the analysis run on the paired PC (Abschnitt 3, remote.ts).

const notHere = () => Promise.reject(new Error(t('Am Handy nicht verfügbar')))
const noop = () => () => {}

async function secret(name: string): Promise<string | null> {
  return (await KandleNative.secureGet({ name })).value
}

// Loaded on first use: link.ts pulls in the store, which must not load before window.api exists (main.tsx).
const pc: Call = async (op, args, timeoutMs) => (await import('./link')).call(op, args, timeoutMs)
const progress = new Set<(pct: number) => void>()
const agentEvents = new Set<(e: AgentsEvent) => void>()
// "Abbrechen" ends the wait at once, also while the PC cannot be told.
let cancelRun = false

/** Saved analyses from the PC; each fetch is kept, so they can be read without the PC too. */
async function results(symbol: string): Promise<SavedAnalysis[]> {
  if (!SYMBOL_RE.test(symbol)) return []
  const file = `analyses/${symbol}.json`
  try {
    // Checked before it is kept: a broken entry from the PC must not break the app on every later start either.
    const list = checkAnalyses(await pc('agents.results', symbol, 15_000), 500)
    await appFiles.write(file, JSON.stringify(list)).catch(() => {})
    return list
  } catch {
    try {
      return checkAnalyses(JSON.parse((await appFiles.read(file)) ?? '[]'), 500)
    } catch {
      return []
    }
  }
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
        tell(t('Änderungen konnten nicht gespeichert werden ({error}). Ist der Speicher des Handys voll?', { error: (e as Error).message }))
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
    // The forecast model and TradingAgents run on the paired PC (Abschnitt 3); the window here computes the rest.
    forecast: async (series, groups) => {
      if (!(await pc('model.ready'))) await waitForModel(pc, (pct) => progress.forEach((cb) => cb(pct)))
      return (await pc('forecast', { series: trimSeries(series), groups }, 120_000)) as number[][][]
    },
    // The archive stays on the PC, which also settles it (it has every source the phone has).
    archive: {
      add: (entry) => pc('archive.add', entry) as Promise<boolean>,
      due: async () => [],
      settle: async () => {},
      summary: (key) => (pc('archive.summary', key) as Promise<Record<string, SummaryRow>>).catch(() => ({})),
      clear: notHere
    },
    modelReady: () => (pc('model.ready') as Promise<boolean>).catch(() => false),
    onForecastProgress: (cb) => {
      progress.add(cb)
      return () => void progress.delete(cb)
    },
    // The phone notifies through KandleNative (alarmWatch.ts).
    notify: () => {},
    agents: {
      status: async () => {
        try {
          const status = (await pc('agents.status')) as AgentsStatus
          // The analysis runs with the PC's settings; the phone's own (unsynced) copy takes them over.
          const config = checkAgentsConfig(await pc('agents.config'))
          if (Object.keys(config).length) {
            const { useStore } = await import('../renderer/src/store/useStore')
            useStore.setState((s) => ({ agentsConfig: { ...s.agentsConfig, ...config } }))
          }
          return status
        } catch {
          return { supported: true, installed: false }
        }
      },
      install: notHere,
      remove: notHere,
      onSetup: noop,
      keys: () => (pc('agents.keys') as Promise<Record<string, boolean>>).catch(() => ({})),
      setKey: notHere,
      run: async (req) => {
        cancelRun = false
        await KandleNative.requestNotify().catch(() => {})
        const { started } = (await pc('agents.start', req, 15_000)) as { started: number }
        // Should the app be closed meanwhile, the background check reports the end (AnalysisWorker.java).
        await KandleNative.watchAnalysis({ symbol: req.symbol, started }).catch(() => {})
        try {
          const end = await waitForRun(
            pc,
            started,
            (j) => agentEvents.forEach((cb) => cb({ event: 'tool', node: j.node, name: j.tool, calls: j.calls, tokensIn: j.tokensIn, tokensOut: j.tokensOut })),
            undefined,
            () => cancelRun
          )
          if (end.error) throw new Error(end.error)
          const done = (await results(req.symbol)).find((a) => a.id === end.id)
          if (!done) throw new Error(t('Die Analyse ist fertig, ließ sich aber nicht laden'))
          return done
        } finally {
          await KandleNative.unwatchAnalysis().catch(() => {})
        }
      },
      onEvent: (cb) => {
        agentEvents.add(cb)
        return () => void agentEvents.delete(cb)
      },
      cancel: async () => {
        cancelRun = true
        await pc('agents.cancel').catch(() => {})
      },
      job: () => (pc('agents.job') as Promise<{ running: AgentsJob | null; last: AgentsEnd | null; now: number }>).catch(() => ({ running: null, last: null, now: Date.now() })),
      results: (symbol) => results(symbol),
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
      firewall: notHere,
      addFirewall: notHere,
      otherFirewalls: notHere,
      onRequest: noop
    }
  }
}
