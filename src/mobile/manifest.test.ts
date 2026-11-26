import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('no app link scheme of our own: any app could claim it and receive the pairing code with the keys', () => {
  const manifest = readFileSync(new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8')
  assert.doesNotMatch(manifest, /android:scheme="kandleos"/)
})
