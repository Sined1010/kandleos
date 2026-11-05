import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fetchHttp } from './http.ts'

async function serve(handler: (req: IncomingMessage, res: import('node:http').ServerResponse) => void) {
  const server = createServer(handler)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { url, close: () => new Promise<void>((r) => server.close(() => r())) }
}

test('fetchHttp sends the given headers and returns the body', async () => {
  let seen: Record<string, unknown> = {}
  const s = await serve((req, res) => {
    seen = req.headers
    res.end('{"ok":1}')
  })
  try {
    const res = await fetchHttp(s.url, { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: 'a=1' }, timeoutMs: 2000 })
    assert.equal(res.status, 200)
    assert.equal(res.ok, true)
    assert.deepEqual(await res.json(), { ok: 1 })
    assert.equal(seen['user-agent'], 'Mozilla/5.0')
    assert.equal(seen.cookie, 'a=1')
  } finally {
    await s.close()
  }
})

test('fetchHttp lists each Set-Cookie as name=value without attributes', async () => {
  const s = await serve((_req, res) => {
    res.setHeader('Set-Cookie', ['a=1; Path=/; HttpOnly', 'b=2; Secure'])
    res.end('')
  })
  try {
    const res = await fetchHttp(s.url, { timeoutMs: 2000 })
    assert.deepEqual(res.setCookies, ['a=1', 'b=2'])
  } finally {
    await s.close()
  }
})

test('fetchHttp with redirect manual reports the redirect instead of following it', async () => {
  const s = await serve((req, res) => {
    if (req.url === '/next') return res.end('followed')
    res.statusCode = 302
    res.setHeader('Location', '/next')
    res.setHeader('Set-Cookie', 'c=3')
    res.end()
  })
  try {
    const res = await fetchHttp(s.url, { redirect: 'manual', timeoutMs: 2000 })
    assert.equal(res.status, 302)
    assert.deepEqual(res.setCookies, ['c=3'])
  } finally {
    await s.close()
  }
})

test('fetchHttp gives up after the time limit', async () => {
  const s = await serve(() => {})
  try {
    await assert.rejects(fetchHttp(s.url, { timeoutMs: 50 }))
  } finally {
    await s.close()
  }
})
