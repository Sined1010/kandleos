import { app } from 'electron'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { InferenceSession } from 'onnxruntime-node'
import { t } from '../shared/i18n'
import { groupBatches } from '../shared/forecast'
import { FORECAST_MIN_BARS } from '../shared/types'

// Chronos-2 (amazon/chronos-2, Apache-2.0) as fp32 ONNX export by sktime: 2048 bars in, 64 steps x 21 quantiles out.
const MODEL = {
  url: 'https://huggingface.co/sktime/chronos2-onnx/resolve/main/chronos2-ctx2048-h64.onnx',
  bytes: 481_610_807,
  sha256: 'f06aba77b0445061b78639008074d71f45af8c0edf16c9dbe4c9ea513c422c0e'
}
const CONTEXT = 2048
// The quantile levels behind each step's 21 values are listed in shared/forecast.ts (QUANTILES).
const LEVELS = 21
// Up to 30 backtests plus the live close and wick series, with room; the model runs them 16 at a time.
const MAX_SERIES = 64

const modelFile = (): string => join(app.getPath('userData'), 'models', 'chronos2-ctx2048-h64.onnx')

async function download(onProgress: (share: number) => void): Promise<void> {
  await mkdir(dirname(modelFile()), { recursive: true })
  const part = modelFile() + '.part'
  const res = await fetch(MODEL.url)
  if (!res.ok || !res.body) throw new Error(t('Modell-Download fehlgeschlagen (HTTP {status})', { status: res.status }))
  const hash = createHash('sha256')
  let done = 0
  const meter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk)
      done += chunk.length
      onProgress(done / MODEL.bytes)
      cb(null, chunk)
    }
  })
  try {
    await pipeline(Readable.fromWeb(res.body as never), meter, createWriteStream(part))
    // A truncated or tampered file must never be loaded.
    if (hash.digest('hex') !== MODEL.sha256) throw new Error(t('Modell-Download beschädigt (Prüfsumme falsch)'))
    await rename(part, modelFile())
  } catch (e) {
    await rm(part, { force: true })
    throw e
  }
}

/** The model file is there in full, so a forecast needs no download first. */
export const modelReady = (): Promise<boolean> => stat(modelFile()).then((s) => s.size === MODEL.bytes, () => false)

let session: Promise<InferenceSession> | null = null

function getSession(onProgress: (share: number) => void): Promise<InferenceSession> {
  session ??= (async () => {
    const complete = await stat(modelFile()).then((s) => s.size === MODEL.bytes, () => false)
    if (!complete) await download(onProgress)
    // Loaded lazily: the native runtime is only needed once someone asks for a forecast.
    const ort = await import('onnxruntime-node')
    return ort.InferenceSession.create(modelFile())
  })().catch((e) => {
    session = null
    throw e
  })
  return session
}

/**
 * Forecasts the next 64 bars of each price series (up to the last 2048 values each) in one model run.
 * Returns per series and step the 21 quantile values. Series with the same group id are forecast together
 * (Chronos-2 lets them inform each other, e.g. close, high and low of one chart); without groups every
 * series stands alone.
 */
export async function forecast(
  seriesArg: unknown,
  groupsArg: unknown,
  onProgress: (share: number) => void
): Promise<number[][][]> {
  if (!Array.isArray(seriesArg) || !seriesArg.length || seriesArg.length > MAX_SERIES)
    throw new Error(t('Ungültige Prognose-Anfrage'))
  const groups =
    groupsArg === undefined || groupsArg === null ? seriesArg.map((_, i) => i) : (groupsArg as unknown[])
  const validGroups =
    Array.isArray(groups) &&
    groups.length === seriesArg.length &&
    groups.every((g) => Number.isInteger(g) && (g as number) >= 0)
  if (!validGroups) throw new Error(t('Ungültige Prognose-Gruppen'))
  for (const closes of seriesArg)
    if (!Array.isArray(closes) || closes.length < FORECAST_MIN_BARS || !closes.every((v) => Number.isFinite(v)))
      throw new Error(t('Zu wenige Kursdaten für eine Prognose (mindestens {min} Kerzen)', { min: FORECAST_MIN_BARS }))
  let batches: number[][]
  try {
    batches = groupBatches(groups as number[])
  } catch {
    throw new Error(t('Ungültige Prognose-Gruppen'))
  }
  const all = (seriesArg as number[][]).map((c) => c.slice(-CONTEXT))
  const s = await getSession(onProgress)
  const ort = await import('onnxruntime-node')
  const out: number[][][] = new Array(all.length)
  for (const idx of batches) {
    const series = idx.map((i) => all[i])
    // Group ids only need to match within one call.
    const ids = new Map<number, number>()
    const local = idx.map((i) => {
      const g = (groups as number[])[i]
      if (!ids.has(g)) ids.set(g, ids.size)
      return ids.get(g)!
    })
    // Shorter histories are left-padded with NaN, which the model treats as missing.
    const context = new Float32Array(series.length * CONTEXT).fill(NaN)
    series.forEach((closes, b) => context.set(closes, (b + 1) * CONTEXT - closes.length))
    const res = await s.run({
      context: new ort.Tensor('float32', context, [series.length, CONTEXT]),
      group_ids: new ort.Tensor('int64', BigInt64Array.from(local, (g) => BigInt(g)), [series.length])
    })
    const q = res.quantiles.data as Float32Array
    const steps = q.length / series.length / LEVELS
    // The model can output slightly crossing quantiles; sorted once here, bands, median and backtests all see a valid order.
    idx.forEach((orig, b) => {
      out[orig] = Array.from({ length: steps }, (_, i) =>
        Array.from(q.subarray((b * steps + i) * LEVELS, (b * steps + i + 1) * LEVELS)).sort((x, y) => x - y)
      )
    })
  }
  return out
}
