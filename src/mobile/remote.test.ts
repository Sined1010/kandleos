import test from 'node:test'
import assert from 'node:assert/strict'
import { trimSeries, waitForModel, waitForRun, type Call } from './remote.ts'

const noSleep = async () => {}
/** A fake PC answering each call with the next entry; an Error entry is thrown. */
function scripted(answers: Record<string, unknown[]>): Call & { calls: string[] } {
  const calls: string[] = []
  const fn = (async (op: string) => {
    calls.push(op)
    const a = answers[op]?.shift()
    if (a instanceof Error) throw a
    return a ?? null
  }) as Call & { calls: string[] }
  fn.calls = calls
  return fn
}

test('trimSeries keeps the last 2048 values of each series with 7 significant digits', () => {
  const long = Array.from({ length: 3000 }, (_, i) => i + 1 / 3)
  const [a, b] = trimSeries([long, [1 / 3, 67432.123456]])
  assert.equal(a.length, 2048)
  assert.equal(a[0], Number((952 + 1 / 3).toPrecision(7)))
  assert.equal(a.at(-1), 2999.333)
  assert.deepEqual(b, [0.3333333, 67432.12])
})

test('waitForModel starts the download, reports percents and ends when ready', async () => {
  const call = scripted({ 'model.state': [{ ready: false, pct: 10, error: '' }, { ready: false, pct: 80, error: '' }, { ready: true, pct: 100, error: '' }] })
  const seen: number[] = []
  await waitForModel(call, (p) => seen.push(p), noSleep)
  assert.equal(call.calls[0], 'model.load')
  assert.deepEqual(seen, [10, 80, 100])
})

test('waitForModel throws the PC\'s error instead of waiting forever', async () => {
  const call = scripted({ 'model.state': [{ ready: false, pct: 30, error: '' }, { ready: false, pct: null, error: 'Modell-Download beschädigt' }] })
  await assert.rejects(waitForModel(call, () => {}, noSleep), /Modell-Download beschädigt/)
})

test('waitForRun rides out a lost connection and returns how the run ended', async () => {
  const run = (stage: number) => ({ running: { symbol: 'AAPL', started: 7, stage }, last: null })
  const call = scripted({
    'agents.job': [run(1), new Error('offline'), run(2), { running: null, last: { started: 7, symbol: 'AAPL', id: 'x', rating: 'Buy' } }]
  })
  const stages: number[] = []
  const end = await waitForRun(call, 7, (j) => stages.push(j.stage), noSleep)
  assert.deepEqual(stages, [1, 2])
  assert.deepEqual(end, { started: 7, symbol: 'AAPL', id: 'x', rating: 'Buy' })
})

test('waitForRun ignores another run and an older ending', async () => {
  const call = scripted({
    'agents.job': [
      { running: { symbol: 'MSFT', started: 3, stage: 4 }, last: { started: 1, symbol: 'X', error: 'alt' } },
      { running: null, last: { started: 7, symbol: 'AAPL', error: 'Abgebrochen' } }
    ]
  })
  const stages: number[] = []
  const end = await waitForRun(call, 7, (j) => stages.push(j.stage), noSleep)
  assert.deepEqual(stages, [])
  assert.equal(end.error, 'Abgebrochen')
})

test('waitForRun gives up when the PC no longer knows the run (it was restarted)', async () => {
  const none = { running: null, last: null }
  const call = scripted({ 'agents.job': [none, none, none] })
  await assert.rejects(waitForRun(call, 7, () => {}, noSleep), /unterbrochen|interrupted/)
})

test('waitForRun asks for its own run and stops on "Abbrechen" even with the PC off', async () => {
  const args: unknown[] = []
  let polls = 0
  const off: Call = async (_op, a) => {
    args.push(a)
    polls++
    throw new Error('offline')
  }
  await assert.rejects(waitForRun(off, 7, () => {}, noSleep, () => polls >= 3), /Abgebrochen|Cancelled/)
  assert.deepEqual(args, [7, 7, 7])
})

test('waitForRun gives up after 3 hours of waiting', async () => {
  let now = 0
  const off: Call = async () => {
    now += 60 * 60 * 1000
    throw new Error('offline')
  }
  await assert.rejects(waitForRun(off, 7, () => {}, noSleep, () => false, () => now), /unterbrochen|interrupted/)
})
