import jsQR from 'jsqr'
import { useEffect, useRef, useState } from 'react'
import { t } from '../shared/i18n'
import { decodePairing } from '../shared/link'
import Layer from './Layer'
import { pairWith, unpair, usePcStatus } from './link'

const button = 'rounded-lg px-4 py-3 text-sm text-white ring-1 ring-line active:bg-line disabled:opacity-40'

const message = (e: unknown) =>
  (e as Error).message === 'offline'
    ? t('PC nicht erreichbar, oder der Code ist abgelaufen bzw. schon benutzt. Ist das Handy im selben WLAN oder im VPN? Blockt eine Firewall am PC (z. B. Portmaster) die Verbindung?')
    : (e as Error).message

// Android's WebView has a built-in barcode reader (from the phone's own system services, nothing we ship); it reads a
// code off a screen far better than jsQR. Without it (phones without Google services) jsQR does the work.
type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
const Barcode = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
const SIDE = 800

/** The camera's centre square (what the preview shows), scaled down for jsQR, which is slow on full frames. */
function readWithJsQR(v: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  const s = Math.min(v.videoWidth, v.videoHeight)
  canvas.width = canvas.height = SIDE
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, SIDE, SIDE)
  return jsQR(g.getImageData(0, 0, SIDE, SIDE).data, SIDE, SIDE)?.data ?? null
}

/** Camera + the WebView's barcode reader (or jsQR): reads the code the PC shows under Settings → Phone access. */
function PairPage({ onDone }: { onDone(): void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [camera, setCamera] = useState(true)

  const tryCode = async (text: string) => {
    const code = decodePairing(text.trim())
    if (!code) return setError(t('Das ist kein KandleOS-Kopplungscode.'))
    setBusy(true)
    setError('')
    try {
      await pairWith(code)
      onDone()
    } catch (e) {
      setError(message(e))
      setBusy(false)
    }
  }
  const tryRef = useRef(tryCode)
  tryRef.current = tryCode

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer = 0
    let found = false
    let reading = false
    const canvas = document.createElement('canvas')
    const detector = Barcode ? new Barcode({ formats: ['qr_code'] }) : null
    navigator.mediaDevices
      // High resolution: the code is dense and shown on a screen; at the default 640×480 its squares are too small.
      ?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then((s) => {
        stream = s
        const v = video.current
        if (!v) return
        v.srcObject = s
        void v.play()
        timer = window.setInterval(async () => {
          if (found || reading || !v.videoWidth) return
          reading = true
          try {
            const text = detector
              ? (await detector.detect(v)).find((r) => r.rawValue.startsWith('kandleos:'))?.rawValue
              : readWithJsQR(v, canvas)
            if (text?.startsWith('kandleos:') && !found) {
              found = true
              void tryRef.current(text)
            }
          } catch {
            // a frame that could not be read; the next one comes in 200 ms
          } finally {
            reading = false
          }
        }, 200)
      })
      .catch(() => setCamera(false))
    return () => {
      clearInterval(timer)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [])

  return (
    <Layer id="pair" title={t('Mit PC koppeln')} onClose={onDone}>
      <p className="mb-3 text-muted">{t('Am PC: Einstellungen → Handy koppeln → Jetzt koppeln. Dann den Code hier scannen.')}</p>
      {camera ? (
        <>
          <div className="relative mb-2">
            <video ref={video} playsInline muted className="aspect-square w-full rounded-xl bg-black object-cover" />
            {/* Aim frame: the whole code with some margin inside it reads best. */}
            <div className="pointer-events-none absolute inset-[12%] rounded-lg border-2 border-white/70" />
          </div>
          <p className="mb-3 text-xs text-muted">{t('Den ganzen Code mit etwas Rand in den Rahmen halten, nicht zu nah.')}</p>
        </>
      ) : (
        <p className="mb-3 text-muted">
          {t('Die App darf die Kamera nicht nutzen. In den Android-Einstellungen bei KandleOS die Kamera erlauben, oder den Code am PC kopieren und hier einfügen.')}
        </p>
      )}
      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        placeholder="kandleos:…"
        rows={3}
        spellCheck={false}
        className="mb-2 w-full rounded-lg bg-panel p-2 font-mono text-xs outline-none ring-1 ring-line focus:ring-accent"
      />
      <button type="button" disabled={busy || !pasted.trim()} onClick={() => tryCode(pasted)} className={button}>
        {busy ? t('Kopple …') : t('Code einfügen und koppeln')}
      </button>
      {error && <p className="mt-3 text-down">{error}</p>}
    </Layer>
  )
}

/** Settings → PC (phone): pair, see whether the PC is there, unpair. */
export default function PcLink() {
  const { state, pcName, lastSeen, syncFailed } = usePcStatus()
  const [pairing, setPairing] = useState(false)
  return (
    <section>
      <h3 className="settings-title settings-rule">PC</h3>
      {state === 'none' ? (
        <>
          <p className="mb-2 text-xs leading-relaxed text-muted">
            {t('Koppeln gleicht Watchlist, Zeichnungen, Chart-Stände und Alarme mit KandleOS am PC ab und übernimmt dessen Kurs-Keys.')}
          </p>
          <button type="button" onClick={() => setPairing(true)} className={button}>
            {t('Mit PC koppeln')}
          </button>
        </>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${state === 'online' ? 'bg-up' : 'bg-muted'}`} />
          <span className="text-slate-200">{pcName}</span>
          <span className="text-muted">
            {state === 'online' ? (syncFailed ? t('erreichbar · Abgleich fehlgeschlagen') : t('erreichbar')) : lastSeen ? t('PC aus · zuletzt {when}', { when: new Date(lastSeen).toLocaleString() }) : t('PC aus')}
          </span>
          <button
            type="button"
            className="ml-auto text-muted active:text-down"
            onClick={() => confirm(t('Vom PC entkoppeln? Die vom PC übernommenen Kurs-Keys werden auf dem Handy gelöscht. Am PC das Gerät unter „Handy koppeln“ ebenfalls entfernen.')) && void unpair()}
          >
            {t('Entkoppeln')}
          </button>
        </div>
      )}
      {pairing && <PairPage onDone={() => setPairing(false)} />}
    </section>
  )
}
