import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rmdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readOrSetAside, writeFileAtomic } from './atomicFile.ts'

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

test('readOrSetAside returns a readable JSON file as it is', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kandleos-atomic-'))
  const file = join(dir, 'kandleos-store.json')
  await writeFile(file, '{"state":{}}')
  assert.equal(readOrSetAside(file, 5), '{"state":{}}')
})

test('readOrSetAside moves an empty or cut-off file aside, so the defaults cannot overwrite it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kandleos-atomic-'))
  const file = join(dir, 'kandleos-store.json')
  await writeFile(file, '')
  assert.equal(readOrSetAside(file, 5), null)
  assert.deepEqual(await readdir(dir), ['kandleos-store.broken-5.json'])
})

test('readOrSetAside without a file returns null and creates nothing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kandleos-atomic-'))
  assert.equal(readOrSetAside(join(dir, 'kandleos-store.json'), 5), null)
  assert.deepEqual(await readdir(dir), [])
})

test('a rename that the system refuses for a moment (file briefly locked) is tried again', { skip: process.platform !== 'win32' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kandleos-atomic-'))
  const file = join(dir, 'x.json')
  // A folder in the way makes Windows refuse the rename with EPERM, like a scanner holding the file.
  await mkdir(file)
  setTimeout(() => void rmdir(file), 60)
  await writeFileAtomic(file, 'new')
  assert.equal(await readFile(file, 'utf8'), 'new')
})

test('readOrSetAside does not take a file it cannot read for a missing one (locked, a folder): it throws', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kandleos-atomic-'))
  const file = join(dir, 'kandleos-store.json')
  await mkdir(file)
  assert.throws(() => readOrSetAside(file, 5))
})

test('readOrSetAside tries again when another program holds the file for a moment (virus scanner at start)', () => {
  let tries = 0
  const read = (): string => {
    if (++tries < 3) throw Object.assign(new Error('busy'), { code: 'EBUSY' })
    return '{"v":1}'
  }
  assert.equal(readOrSetAside('x.json', 5, read), '{"v":1}')
  assert.equal(tries, 3)
})
