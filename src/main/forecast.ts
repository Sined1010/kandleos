import { app } from 'electron'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { InferenceSession } from 'onnxruntime-node'

// Chronos-2 (amazon/chronos-2, Apache-2.0) as fp32 ONNX export by sktime: 2048 bars in, 64 steps x 21 quantiles out.
const MODEL = {
  url: 'https://huggingface.co/sktime/chronos2-onnx/resolve/main/chronos2-ctx2048-h64.onnx',
  bytes: 481_610_807,
  sha256: 'f06aba77b0445061b78639008074d71f45af8c0edf16c9dbe4c9ea513c422c0e'
}
const CONTEXT = 2048
const LEVELS = 21
const P10 = 2
const MEDIAN = 10
const P90 = 18

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

/** Forecast for the next 64 bars as [p10, median, p90] per step, from up to the last 2048 closes. */
export async function forecast(closesArg: unknown, onProgress: (share: number) => void): Promise<number[][]> {
  if (!Array.isArray(closesArg) || closesArg.length < 32 || !closesArg.every((v) => Number.isFinite(v)))
    throw new Error('Zu wenige Kursdaten für eine Prognose (mindestens 32 Kerzen)')
  const closes = (closesArg as number[]).slice(-CONTEXT)
  const s = await getSession(onProgress)
  const ort = await import('onnxruntime-node')
  // Shorter histories are left-padded with NaN, which the model treats as missing.
  const context = new Float32Array(CONTEXT).fill(NaN)
  context.set(closes, CONTEXT - closes.length)
  const out = await s.run({
    context: new ort.Tensor('float32', context, [1, CONTEXT]),
    group_ids: new ort.Tensor('int64', BigInt64Array.from([0n]), [1])
  })
  const q = out.quantiles.data as Float32Array
  return Array.from({ length: q.length / LEVELS }, (_, i) => [P10, MEDIAN, P90].map((l) => q[i * LEVELS + l]))
}
