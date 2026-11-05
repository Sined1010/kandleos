import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

// Android build: a second entry page that reuses the desktop renderer (see src/mobile/main.tsx).
export default defineConfig({
  root: 'src/mobile',
  base: './',
  mode: 'mobile',
  plugins: [
    react(),
    tailwindcss(),
    {
      // The GPL text and the third-party notices travel inside the app (shown under About → licenses).
      name: 'licenses',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'LICENSE.txt', source: readFileSync('LICENSE') })
        this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_LICENSES.txt', source: readFileSync('resources/THIRD_PARTY_LICENSES.txt') })
      }
    }
  ],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { outDir: '../../out-mobile', emptyOutDir: true }
})
