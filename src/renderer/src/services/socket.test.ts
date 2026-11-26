import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { socket } from './socket.ts'

/** A WebSocket stand-in: every new one is kept, the test opens or drops it. */
class FakeSocket {
  static all: FakeSocket[] = []
  onopen?: () => void
  onmessage?: (e: { data: string }) => void
  onclose?: () => void
  constructor() {
    FakeSocket.all.push(this)
  }
  close() {}
}

test('a socket that keeps failing waits longer each time (3 s doubling to 60 s), and from 3 s again once it opened', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  FakeSocket.all = []
  ;(globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket
  const stop = socket('wss://x', () => {})
  const waits: number[] = []
  for (let i = 0; i < 7; i++) {
    const before = FakeSocket.all.length
    FakeSocket.all.at(-1)!.onclose!()
    let waited = 0
    while (FakeSocket.all.length === before) {
      mock.timers.tick(1000)
      waited += 1000
    }
    waits.push(waited)
  }
  assert.deepEqual(waits, [3000, 6000, 12000, 24000, 48000, 60000, 60000])
  FakeSocket.all.at(-1)!.onopen!()
  FakeSocket.all.at(-1)!.onclose!()
  mock.timers.tick(3000)
  assert.equal(FakeSocket.all.length, 9)
  stop()
  mock.timers.reset()
})

test('onOpen says whether the socket opened again after a drop, so a gap can be filled', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  FakeSocket.all = []
  ;(globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket
  const opens: boolean[] = []
  const stop = socket('wss://x', () => {}, (_ws, again) => void opens.push(again))
  FakeSocket.all[0].onopen!()
  FakeSocket.all[0].onclose!()
  mock.timers.tick(3000)
  FakeSocket.all[1].onopen!()
  assert.deepEqual(opens, [false, true])
  stop()
  mock.timers.reset()
})
