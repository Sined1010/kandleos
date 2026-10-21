import { app } from 'electron'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { InferenceSession } from 'onnxruntime-node'
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
// Live close and wick series plus up to three backtests; more series in one run gain nothing.
const MAX_SERIES = 8

const modelFile = (): string => join(app.getPath('userData'), 'models', 'chronos2-ctx2048-h64.onnx')

async function download(onProgress: (share: number) => void): Promise<void> {
  await mkdir(dirname(modelFile()), { recursive: true })
  const part = modelFile() + '.part'
  const res = await fetch(MODEL.url)
  if (!res.ok || !res.body) throw new Error(`Modell-Download fehlgeschlagen (HTTP ${res.status})`)
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
    if (hash.digest('hex') !== MODEL.sha256) throw new Error('Modell-Download beschädigt (Prüfsumme falsch)')
    await rename(part, modelFile())
  } catch (e) {
    await rm(part, { force: true })
    throw e
  }
}

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
    throw new Error('Ungültige Prognose-Anfrage')
  const groups =
    groupsArg === undefined || groupsArg === null ? seriesArg.map((_, i) => i) : (groupsArg as unknown[])
  const validGroups =
    Array.isArray(groups) &&
    groups.length === seriesArg.length &&
    groups.every((g) => Number.isInteger(g) && (g as number) >= 0)
  if (!validGroups) throw new Error('Ungültige Prognose-Gruppen')
  for (const closes of seriesArg)
    if (!Array.isArray(closes) || closes.length < FORECAST_MIN_BARS || !closes.every((v) => Number.isFinite(v)))
      throw new Error(`Zu wenige Kursdaten für eine Prognose (mindestens ${FORECAST_MIN_BARS} Kerzen)`)
  const series = (seriesArg as number[][]).map((c) => c.slice(-CONTEXT))
  const s = await getSession(onProgress)
  const ort = await import('onnxruntime-node')
  // Shorter histories are left-padded with NaN, which the model treats as missing.
  const context = new Float32Array(series.length * CONTEXT).fill(NaN)
  series.forEach((closes, b) => context.set(closes, (b + 1) * CONTEXT - closes.length))
  const out = await s.run({
    context: new ort.Tensor('float32', context, [series.length, CONTEXT]),
    group_ids: new ort.Tensor('int64', BigInt64Array.from(groups as number[], (g) => BigInt(g)), [series.length])
  })
  const q = out.quantiles.data as Float32Array
  const steps = q.length / series.length / LEVELS
  return series.map((_, b) =>
    Array.from({ length: steps }, (_, i) => Array.from(q.subarray((b * steps + i) * LEVELS, (b * steps + i + 1) * LEVELS)))
  )
}
