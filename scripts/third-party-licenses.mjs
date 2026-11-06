// Collects the license texts of everything KandleOS ships into resources/THIRD_PARTY_LICENSES.txt.
// Runs before every installer build (npm run dist:*), so the file always matches the installed packages.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// Runtime dependencies are shipped as node_modules; these devDependencies are bundled into the app's JavaScript.
const BUNDLED = ['react', 'react-dom', 'zustand', 'lucide-react', 'lightweight-charts', 'markdown-it', 'qrcode-generator']
// The Android app (src/mobile) also ships Capacitor: its JavaScript and its native Android part.
const CAPACITOR = [...Object.keys(pkg.devDependencies ?? {}).filter((n) => n.startsWith('@capacitor/') && n !== '@capacitor/cli'), 'jsqr']
const roots = [...Object.keys(pkg.dependencies ?? {}), ...BUNDLED, ...CAPACITOR]

/** Directory of package `name` as Node would resolve it from `from` (nearest node_modules upwards). */
function findPackage(name, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    if (dirname(dir) === dir) return null
  }
}

const seen = new Map()
function collect(name, from) {
  const dir = findPackage(name, from)
  if (!dir) throw new Error(`Paket nicht gefunden: ${name} (npm install ausführen)`)
  const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const key = `${meta.name}@${meta.version}`
  if (seen.has(key)) return
  const licenseFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f))
  seen.set(key, {
    key,
    license: typeof meta.license === 'string' ? meta.license : (meta.license?.type ?? 'unbekannt'),
    url: meta.homepage ?? meta.repository?.url ?? meta.repository ?? '',
    text: licenseFile ? readFileSync(join(dir, licenseFile), 'utf8').trim() : null
  })
  for (const dep of Object.keys(meta.dependencies ?? {})) collect(dep, dir)
}
for (const name of roots) collect(name, root)

const entries = [...seen.values()].sort((a, b) => a.key.localeCompare(b.key))
const line = '='.repeat(78)
const out = [
  'KandleOS – Lizenzen von Drittanbietern',
  '',
  'KandleOS enthält die folgenden Open-Source-Komponenten. Ihre Lizenztexte stehen unten vollständig.',
  '',
  'Weitere Bestandteile:',
  '- Electron und Chromium: Lizenzen in LICENSE.electron.txt und LICENSES.chromium.html im Programmordner.',
  '- TradingView Lightweight Charts™ (Apache-2.0), Copyright TradingView, Inc. – https://www.tradingview.com/',
  '- Prognosemodell Amazon Chronos-2 (Apache-2.0, https://huggingface.co/amazon/chronos-2) als ONNX-Export',
  '  von sktime (https://huggingface.co/sktime/chronos2-onnx). Es ist nicht im Installer enthalten, sondern',
  '  wird beim ersten Start einer Prognose heruntergeladen.',
  '- Umfassende Analyse (optional): TradingAgents von Tauric Research (Apache-2.0,',
  '  https://github.com/TauricResearch/TradingAgents), Python (PSF-Lizenz) und uv von Astral (MIT/Apache-2.0).',
  '  Nichts davon ist im Installer enthalten; alles wird erst beim Einrichten der Analyse heruntergeladen.',
  '- Ladeanimation der Prognose nach „Candle Loader“ von Bilal Bostan (MIT,',
  '  https://uiverse.io/bilal_9731/new-moose-50); Lizenztext ganz unten.',
  '- Nur in der Android-App: Capacitor (@capacitor/*, MIT), jsQR (Apache-2.0, Liste unten) und AndroidX von Google (AppCompat,',
  '  CoordinatorLayout, Core-SplashScreen, WorkManager; Apache-2.0, https://www.apache.org/licenses/LICENSE-2.0,',
  '  Lizenztext wie bei lightweight-charts unten).',
  '',
  'Übersicht:',
  ...entries.map((e) => `- ${e.key} (${e.license})`),
  ''
]
for (const e of entries) {
  out.push(line, `${e.key} – ${e.license}${e.url ? ` – ${String(e.url).replace(/^git\+/, '')}` : ''}`, line, '')
  out.push(e.text ?? `(Das Paket enthält keinen eigenen Lizenztext; Lizenz laut Paketangabe: ${e.license}.)`, '')
}
// Adapted CSS from Uiverse (not an npm package, so its notice is kept here).
out.push(line, 'Candle Loader (Uiverse) – MIT – https://uiverse.io/bilal_9731/new-moose-50', line, '', `MIT License

Copyright (c) 2026 Bilal Bostan

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of
the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`, '')
writeFileSync(join(root, 'resources', 'THIRD_PARTY_LICENSES.txt'), out.join('\n'))
console.log(`THIRD_PARTY_LICENSES.txt: ${entries.length} Pakete`)
