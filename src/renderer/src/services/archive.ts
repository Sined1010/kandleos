// Window side of the forecast archive: hands shown forecasts to main and settles finished ones with the same
// candle loaders the chart uses (Binance here, stocks through main).
import { givenUp, roundSig, settleEntry, type ArchiveEntry } from '../../../shared/archive'
import { TF_SECONDS, type CandleProvider, type Timeframe } from '../../../shared/types'
import type { ForecastResult } from '../components/ForecastInfo'
import { useStore } from '../store/useStore'
import { loadCandles } from './marketData'

export interface ArchiveContext {
  symbol: string
  timeframe: Timeframe
  provider: CandleProvider | undefined
  extended: boolean
  timeZone: string | undefined
  /** Made by the automatic refresh. */
  auto: boolean
}

/** Keeps a shown forecast in the archive, if archiving is on; main drops duplicates. */
export function archiveForecast(r: ForecastResult, ctx: ArchiveContext): void {
  if (!useStore.getState().forecastRun.archive || !ctx.provider) return
  const now = Date.now() / 1000
  const entry: ArchiveEntry = {
    id: `${Math.floor(now).toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    symbol: ctx.symbol,
    timeframe: ctx.timeframe,
    provider: ctx.provider,
    extended: ctx.extended,
    // Crypto has no exchange zone; Binance's daily bars start at midnight UTC.
    timeZone: ctx.timeZone ?? 'UTC',
    createdAt: Math.floor(now),
    baseTime: r.baseTime,
    base: roundSig(r.base),
    times: r.times,
    steps: r.raw.map((q) => q.map((v) => roundSig(v))),
    factor: r.bandScale,
    auto: ctx.auto,
    appVersion: __APP_VERSION__
  }
  void window.api.archive.add(entry).catch(() => {})
}

let settling = false

/**
 * Settles the archived forecasts whose last bar has closed, one after the other with a short pause, so the
 * sources are never flooded. A run already going ends a second call instead of waiting for it.
 */
export async function settleDue(symbol?: string): Promise<void> {
  if (settling) return
  settling = true
  try {
    const due = await window.api.archive.due(symbol)
    const failed = new Set<CandleProvider>()
    for (const e of due) {
      if (failed.has(e.provider)) continue
      const step = TF_SECONDS[e.timeframe]
      // The section just before this time ends with the last target bar.
      const before = e.times[e.times.length - 1] + 2 * step
      let candles
      try {
        candles = (await loadCandles(e.symbol, e.timeframe, useStore.getState().finnhubKey, e.extended, { before, provider: e.provider })).candles
      } catch {
        // A source gone for good (its key removed, say) must not keep a forecast open forever.
        if (givenUp(e, Date.now() / 1000)) {
          await window.api.archive.settle(e.id, 'unsettleable')
          continue
        }
        // Offline or the source refused: leave that source alone for the rest of this run; next time tries again.
        failed.add(e.provider)
        await new Promise((ok) => setTimeout(ok, 500))
        continue
      }
      // shortcut: a section that does not reach back to the first target bar counts as beyond the source's
      // history limit (Yahoo 1m keeps about a week); revisit if some source returns shorter sections.
      const result = !candles.length || candles[0].time > e.times[0] ? 'unsettleable' : settleEntry(e, candles, Date.now() / 1000)
      if (result !== 'pending') await window.api.archive.settle(e.id, result)
      await new Promise((ok) => setTimeout(ok, 500))
    }
  } catch {
    // The archive could not be read; nothing to settle this time.
  } finally {
    settling = false
  }
}
