// Collects the license texts of everything KandleOS ships into resources/THIRD_PARTY_LICENSES.txt.
// Runs before every installer build (npm run dist:*), so the file always matches the installed packages.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// Runtime dependencies are shipped as node_modules; these devDependencies are bundled into the app's JavaScript.
const BUNDLED = ['react', 'react-dom', 'zustand', 'lucide-react', 'lightweight-charts', 'markdown-it']
const roots = [...Object.keys(pkg.dependencies ?? {}), ...BUNDLED]

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
  '',
  'Übersicht:',
  ...entries.map((e) => `- ${e.key} (${e.license})`),
  ''
]
for (const e of entries) {
  out.push(line, `${e.key} – ${e.license}${e.url ? ` – ${String(e.url).replace(/^git\+/, '')}` : ''}`, line, '')
  out.push(e.text ?? `(Das Paket enthält keinen eigenen Lizenztext; Lizenz laut Paketangabe: ${e.license}.)`, '')
}
writeFileSync(join(root, 'resources', 'THIRD_PARTY_LICENSES.txt'), out.join('\n'))
console.log(`THIRD_PARTY_LICENSES.txt: ${entries.length} Pakete`)
