import test from 'node:test'
import assert from 'node:assert/strict'
import { createRemoteOps, type RemoteDeps } from './remoteOps.ts'

function deps(over: Partial<RemoteDeps> = {}): RemoteDeps & { loads: number; progress?: (share: number) => void; finish?: (ok: boolean) => void } {
  const d: RemoteDeps & { loads: number; progress?: (share: number) => void; finish?: (ok: boolean) => void } = {
    loads: 0,
    forecast: async (series, groups) => [[[(series as number[][]).length, (groups as number[])[0]]]],
    modelReady: async () => true,
    loadModel: (onProgress) => {
      d.loads++
      d.progress = onProgress
      return new Promise((ok, fail) => (d.finish = (good) => (good ? ok(null) : fail(new Error('Prüfsumme falsch')))))
    },
    archive: { add: async () => true, summary: async (key) => ({ key: key ?? 'all' }) },
    agents: {
      status: () => ({ installed: true }),
      keys: () => ({ openai: true }),
      config: () => ({ provider: 'openai' }),
      start: async () => ({ started: 42 }),
      job: () => ({ running: null, last: null }),
      cancel: () => {},
      results: async () => []
    },
    ...over
  }
  return d
}

test('an op outside the list is refused, including the ones that must never come from a phone', async () => {
  const op = createRemoteOps(deps())
  for (const name of ['rm-rf', 'archive.clear', 'archive.settle', 'agents.install', 'agents.remove', 'agents.setKey', 'sync'])
    await assert.rejects(op(name, null, 'dev'), /unknown-op/)
})

test('forecast passes series and groups on, and refuses while the model is missing', async () => {
  assert.deepEqual(await createRemoteOps(deps())('forecast', { series: [[1], [2]], groups: [7, 8] }, 'dev'), [[[2, 7]]])
  await assert.rejects(createRemoteOps(deps({ modelReady: async () => false }))('forecast', { series: [[1]], groups: [0] }, 'dev'), /no-model/)
})

test('model.load starts one download, reports whole percents, and is ready afterwards', async () => {
  let ready = false
  const d = deps({ modelReady: async () => ready })
  const op = createRemoteOps(d)
  await op('model.load', null, 'dev')
  await op('model.load', null, 'dev')
  assert.equal(d.loads, 1)
  d.progress!(0.426)
  assert.deepEqual(await op('model.state', null, 'dev'), { ready: false, pct: 42, error: '' })
  ready = true
  d.finish!(true)
  await new Promise((ok) => setTimeout(ok, 0))
  assert.deepEqual(await op('model.state', null, 'dev'), { ready: true, pct: 100, error: '' })
})

test('a failed download shows its error and can be started again', async () => {
  const d = deps({ modelReady: async () => false })
  const op = createRemoteOps(d)
  await op('model.load', null, 'dev')
  d.finish!(false)
  await new Promise((ok) => setTimeout(ok, 0))
  assert.deepEqual(await op('model.state', null, 'dev'), { ready: false, pct: null, error: 'Prüfsumme falsch' })
  await op('model.load', null, 'dev')
  assert.equal(d.loads, 2)
  assert.deepEqual(await op('model.state', null, 'dev'), { ready: false, pct: 0, error: '' })
})

test('agents.start names the phone as starter and passes "already running" on in words', async () => {
  const by: string[] = []
  const ok = createRemoteOps(deps({ agents: { ...deps().agents, start: async (_req, device) => (by.push(device), { started: 5 }) } }))
  assert.deepEqual(await ok('agents.start', { symbol: 'AAPL' }, 'phone-1'), { started: 5 })
  assert.deepEqual(by, ['phone-1'])
  const busy = createRemoteOps(deps({ agents: { ...deps().agents, start: async () => { throw new Error('Es läuft bereits eine Analyse') } } }))
  await assert.rejects(busy('agents.start', { symbol: 'AAPL' }, 'phone-1'), /Es läuft bereits eine Analyse/)
})

test('agents.start runs with the PC settings, taking only value and forecast from the phone', async () => {
  const reqs: unknown[] = []
  const config = { provider: 'ollama', models: {}, analysts: ['market'], debateRounds: 2, ollamaUrl: 'http://localhost:11434' }
  const agents = { ...deps().agents, config: () => config, start: async (req: unknown) => (reqs.push(req), { started: 1 }) }
  const phone = { symbol: 'AAPL', chronos: { skipped: 'declined' }, provider: 'openai', deepModel: 'gpt-expensive', quickModel: 'x', analysts: ['news'], debateRounds: 3, ollamaUrl: 'http://evil:1' }
  await createRemoteOps(deps({ agents }))('agents.start', phone, 'phone-1')
  assert.deepEqual(reqs, [
    { symbol: 'AAPL', chronos: { skipped: 'declined' }, provider: 'ollama', deepModel: 'glm-4.7-flash:latest', quickModel: 'qwen3:latest', analysts: ['market'], debateRounds: 2, ollamaUrl: 'http://localhost:11434' }
  ])
  const none = createRemoteOps(deps({ agents: { ...agents, config: () => null } }))
  await assert.rejects(none('agents.start', phone, 'phone-1'), /eingerichtet|set up/)
  assert.equal(reqs.length, 1)
})

test('archive.add takes a phone forecast only when it starts in the past and ends within its horizon', async () => {
  const added: unknown[] = []
  const op = createRemoteOps(deps({ archive: { add: async (e) => (added.push(e), true), summary: async () => ({}) } }))
  const now = Math.floor(Date.now() / 1000)
  const day = 86400
  const ok = { timeframe: '1D', baseTime: now - day, times: [now, now + 63 * day] }
  assert.equal(await op('archive.add', ok, 'dev'), true)
  for (const bad of [
    { ...ok, baseTime: now + 30 * day, times: [now + 31 * day] },
    { ...ok, times: [now, now + 400 * day] },
    { ...ok, timeframe: 'evil' },
    { ...ok, times: [] },
    null
  ])
    assert.equal(await op('archive.add', bad, 'dev'), false, JSON.stringify(bad))
  assert.equal(added.length, 1)
})

test('archive.summary takes only a string key', async () => {
  const op = createRemoteOps(deps())
  assert.deepEqual(await op('archive.summary', 'BTCUSDT|1d', 'dev'), { key: 'BTCUSDT|1d' })
  assert.deepEqual(await op('archive.summary', { evil: 1 }, 'dev'), { key: 'all' })
})

test('agents.job passes a numeric start time on and ignores anything else', async () => {
  const asked: (number | undefined)[] = []
  const op = createRemoteOps(deps({ agents: { ...deps().agents, job: (started) => (asked.push(started), null) } }))
  await op('agents.job', 1700, 'dev')
  await op('agents.job', { evil: 1 }, 'dev')
  await op('agents.job', null, 'dev')
  assert.deepEqual(asked, [1700, undefined, undefined])
})
