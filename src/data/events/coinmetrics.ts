// Coins moving onto and off exchanges (BTC, ETH), one number per day, from Coin Metrics' free community API.
//
// LICENCE: the community data is published under CC BY-NC 4.0 – non-commercial use only, and the source must be
// named (the Events list does). Before KandleOS is sold or used commercially in any way, replace this source, license
// the data or remove the feature (see docs: "Geld verdienen"). Swapping the source means writing another function with
// the shape of `coinMetricsFlows`; nothing else depends on Coin Metrics.
//
// Checked on 2026-11-15: no key, CORS `*`, BTC and ETH for 366 days in one call (about 65 KB packed); every value
// carries the status "flash" (an estimate); a day's values appear around 01:30 (BTC) and 03:30 UTC (ETH) the next day.
import { parseCoinMetrics, type FlowAsset, type FlowSeries } from '../../shared/chain.ts'
import { http } from '../http.ts'

const API = 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics'
const DAYS = 366

/** The flows of one coin for the last year. */
export async function coinMetricsFlows(asset: FlowAsset, now = Date.now()): Promise<FlowSeries> {
  const start = new Date(now - DAYS * 864e5).toISOString().slice(0, 10)
  const url = `${API}?assets=${asset.toLowerCase()}&metrics=FlowInExNtv,FlowOutExNtv,SplyExNtv&frequency=1d&start_time=${start}&page_size=1000`
  const res = await http(url, { timeoutMs: 15_000 })
  if (!res.ok) throw new Error(`Coin Metrics HTTP ${res.status}`)
  const days = parseCoinMetrics(await res.json(), asset)
  if (!days.length) throw new Error('Coin Metrics: no data')
  return { asset, days, source: 'Coin Metrics' }
}

/**
 * Keeps each coin's series until the next day's values are out (04:00 UTC). An answer still missing yesterday is asked
 * again after an hour; a failure after a minute, and meanwhile the last good series stays (yesterday's bars beat none).
 * `fetch` is the source (coinMetricsFlows in the app, a stand-in in tests).
 */
export function dailyFlows(fetch: (asset: FlowAsset) => Promise<FlowSeries>, now = () => Date.now()): (asset: FlowAsset) => Promise<FlowSeries> {
  const kept = new Map<FlowAsset, { until: number; series: Promise<FlowSeries>; good?: FlowSeries }>()
  const nextRelease = (t: number) => {
    const d = new Date(t)
    const release = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 4)
    return release > t ? release : release + 864e5
  }
  return (asset) => {
    const t = now()
    const hit = kept.get(asset)
    if (hit && t < hit.until) return hit.series
    const entry: { until: number; series: Promise<FlowSeries>; good?: FlowSeries } = { until: nextRelease(t), series: Promise.resolve(null!), good: hit?.good }
    entry.series = fetch(asset).then(
      (series) => {
        entry.good = series
        const yesterday = new Date(t - 864e5).toISOString().slice(0, 10)
        if ((series.days.at(-1)?.date ?? '') < yesterday) entry.until = Math.min(entry.until, t + 3_600_000)
        return series
      },
      (e) => {
        entry.until = t + 60_000
        if (entry.good) return entry.good
        throw e
      }
    )
    kept.set(asset, entry)
    return entry.series
  }
}
