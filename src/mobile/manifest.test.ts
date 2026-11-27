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
