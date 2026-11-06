import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileAtomic } from './atomicFile.ts'

test('writeFileAtomic replaces the file in one step and leaves no temp file behind', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kandleos-atomic-'))
  const file = join(dir, 'link-devices.bin')
  await writeFile(file, 'old')
  await writeFileAtomic(file, 'new', 0o600)
  assert.equal(await readFile(file, 'utf8'), 'new')
  assert.deepEqual(await readdir(dir), ['link-devices.bin'])
})

test('two writes of the same file at once both succeed and leave one of the two contents', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kandleos-atomic-'))
  const file = join(dir, 'x.bin')
  await Promise.all([writeFileAtomic(file, 'a'), writeFileAtomic(file, 'b')])
  assert.ok(['a', 'b'].includes(await readFile(file, 'utf8')))
  assert.deepEqual(await readdir(dir), ['x.bin'])
})
