import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('no app link scheme of our own: any app could claim it and receive the pairing code with the keys', () => {
  const manifest = readFileSync(new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8')
  assert.doesNotMatch(manifest, /android:scheme="kandleos"/)
})

test('no app data goes along with a cloud backup or a move to a new phone (allowBackup alone does not stop the move)', () => {
  const manifest = readFileSync(new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8')
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/)
  const rules = readFileSync(new URL('../../android/app/src/main/res/xml/data_extraction_rules.xml', import.meta.url), 'utf8')
  for (const part of ['cloud-backup', 'device-transfer']) {
    const block = rules.split(`<${part}>`)[1]?.split(`</${part}>`)[0] ?? ''
    assert.match(block, /<exclude domain="root" path="\."\s*\/>/, part)
  }
})

const read = (p: string) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8')
const java = (name: string) => read(`android/app/src/main/java/io/github/sined1010/kandleos/${name}.java`)

test('privacy: no WebView usage statistics and no Safe Browsing lookups (the app loads only its own pages)', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  assert.match(manifest, /android:name="android\.webkit\.WebView\.MetricsOptOut"\s+android:value="true"/)
  assert.match(manifest, /android:name="android\.webkit\.WebView\.EnableSafeBrowsing"\s+android:value="false"/)
})

test('privacy: the keyboard is asked not to learn from what is typed (incognito keyboard)', () => {
  assert.match(java('KandleWebView'), /IME_FLAG_NO_PERSONALIZED_LEARNING/)
})

// Ours replaces Capacitor's layout of the same name: it must stay Capacitor's but for the WebView class. A Capacitor
// update that changes its own (or a lost id="webview", which BridgeActivity would hide behind "no WebView") fails here.
test('the replaced Capacitor layout equals Capacitor\'s own but for the WebView class', () => {
  const plain = (s: string) =>
    s
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/xmlns:app="[^"]*"/, '')
      .replace(/fill_parent/g, 'match_parent')
      .replace(/\s+/g, ' ')
      .replace(/ >/g, '>')
      .trim()
  const ours = read('android/app/src/main/res/layout/capacitor_bridge_layout_main.xml')
  const theirs = read('node_modules/@capacitor/android/capacitor/src/main/res/layout/capacitor_bridge_layout_main.xml')
  assert.equal(plain(ours), plain(theirs).replace('com.getcapacitor.CapacitorWebView', 'io.github.sined1010.kandleos.KandleWebView'))
})

test('privacy: with Android set to hide sensitive content, the lock screen shows a neutral notice; no picture in recent apps', () => {
  assert.match(java('Notifier'), /setPublicVersion\(/)
  assert.match(java('MainActivity'), /setRecentsScreenshotEnabled\(false\)/)
})

test('privacy: no spell checker on the desktop, in the window and the session (it fetched dictionaries from a Google server)', () => {
  const main = read('src/main/index.ts')
  assert.match(main, /spellcheck:\s*false/)
  assert.match(main, /session\.defaultSession\.setSpellCheckerEnabled\(false\)/)
})
