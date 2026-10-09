import { PtySession } from '../../../src/main-process/terminal/pty-session'
import { IPtyOptions } from '../../../src/lib/terminal/pty-types'
import { MockPty, MockPort } from '../../helpers/mock-pty'

const KB = 1024

const baseOptions = (): IPtyOptions => ({
  shell: '/bin/bash',
  args: [],
  cwd: '/tmp',
  env: {},
  cols: 80,
  rows: 24,
})

function start() {
  const pty = new MockPty()
  const port = new MockPort()
  const session = new PtySession({
    factory: () => pty,
    port,
    options: baseOptions(),
    id: 'sess-flow',
    repositoryId: 1,
  })
  session.start()
  const dataMessages = () =>
    port.posted.map(p => p.message).filter(m => m.type === 'data')
  const text = (m: any) => Buffer.from(m.bytes).toString('utf8')
  return { session, pty, port, dataMessages, text }
}

describe('PtySession output coalescing', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(1_000_000)
  })
  afterEach(() => jest.useRealTimers())

  it('posts the first chunk after an idle gap immediately', () => {
    const { pty, dataMessages } = start()
    pty.emitData('a')
    expect(dataMessages()).toHaveLength(1)
  })

  it('batches a burst into one message after the coalesce window', () => {
    const { pty, dataMessages, text } = start()
    pty.emitData('a')
    pty.emitData('b')
    pty.emitData('c')

    expect(dataMessages()).toHaveLength(1)

    jest.advanceTimersByTime(4)

    const msgs = dataMessages()
    expect(msgs).toHaveLength(2)
    expect(text(msgs[1])).toBe('bc')
  })

  it('flushes immediately once a batch reaches 64KB', () => {
    const { pty, dataMessages } = start()
    pty.emitData('a')
    pty.emitData(Buffer.alloc(64 * KB, 0x78))

    expect(dataMessages()).toHaveLength(2)
    expect(dataMessages()[1].bytes.byteLength).toBe(64 * KB)
  })

  it('never reorders output relative to meta messages', () => {
    const { pty, port } = start()
    pty.emitData('a')
    pty.emitData('b\x1b]7;file:///tmp/proj\x1b\\')

    const types = port.posted.map(p => p.message.type)
    expect(types).toEqual(['data', 'data', 'meta'])
    expect(port.posted[2].message.liveCwd).toBe('/tmp/proj')
  })

  it('flushes pending output before the exit message', () => {
    const { pty, port, text } = start()
    pty.emitData('a')
    pty.emitData('tail')
    pty.emitExit(0)

    const msgs = port.posted.map(p => p.message)
    expect(msgs.map(m => m.type)).toEqual(['data', 'data', 'exit'])
    expect(text(msgs[1])).toBe('tail')
  })

  it('drops pending output and its timer when killed', () => {
    const { session, pty, dataMessages } = start()
    pty.emitData('a')
    pty.emitData('b')
    session.kill()

    jest.advanceTimersByTime(100)

    expect(dataMessages()).toHaveLength(1)
  })
})

describe('PtySession flow control', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(1_000_000)
  })
  afterEach(() => jest.useRealTimers())

  /** Emit `total` bytes as 64KB chunks, each flushing immediately. */
  const flood = (pty: MockPty, total: number) => {
    for (let sent = 0; sent < total; sent += 64 * KB) {
      pty.emitData(Buffer.alloc(64 * KB, 0x78))
    }
  }

  it('never pauses before the renderer has acked once', () => {
    const { pty } = start()
    flood(pty, 4 * 1024 * KB)
    expect(pty.pauseCalls).toBe(0)
  })

  it('pauses at the high watermark once acks are flowing', () => {
    const { pty, port } = start()
    port.emitRendererMessage({ type: 'ack', bytes: 0 })

    flood(pty, 1024 * KB)

    expect(pty.pauseCalls).toBe(1)
  })

  it('does not pause below the high watermark', () => {
    const { pty, port } = start()
    port.emitRendererMessage({ type: 'ack', bytes: 0 })

    flood(pty, 512 * KB)

    expect(pty.pauseCalls).toBe(0)
  })

  it('resumes once acks bring the backlog under the low watermark', () => {
    const { pty, port } = start()
    port.emitRendererMessage({ type: 'ack', bytes: 0 })
    flood(pty, 1024 * KB)
    expect(pty.pauseCalls).toBe(1)

    // 1024KB outstanding; ack 600KB -> 424KB, still above the 256KB mark.
    port.emitRendererMessage({ type: 'ack', bytes: 600 * KB })
    expect(pty.resumeCalls).toBe(0)

    // Ack another 200KB -> 224KB, below the mark.
    port.emitRendererMessage({ type: 'ack', bytes: 200 * KB })
    expect(pty.resumeCalls).toBe(1)
  })

  it('pauses only once while already paused', () => {
    const { pty, port } = start()
    port.emitRendererMessage({ type: 'ack', bytes: 0 })
    flood(pty, 2048 * KB)
    expect(pty.pauseCalls).toBe(1)
  })

  it('resumes and disables flow control if acks stop arriving', () => {
    const { pty, port } = start()
    port.emitRendererMessage({ type: 'ack', bytes: 0 })
    flood(pty, 1024 * KB)
    expect(pty.pauseCalls).toBe(1)

    jest.advanceTimersByTime(10_000)

    expect(pty.resumeCalls).toBe(1)
    // Without a fresh ack it must not pause again.
    flood(pty, 2048 * KB)
    expect(pty.pauseCalls).toBe(1)
  })

  it('keeps the watchdog alive while acks make progress', () => {
    const { pty, port } = start()
    port.emitRendererMessage({ type: 'ack', bytes: 0 })
    flood(pty, 1024 * KB)

    jest.advanceTimersByTime(9_000)
    port.emitRendererMessage({ type: 'ack', bytes: 100 * KB })
    jest.advanceTimersByTime(9_000)

    expect(pty.resumeCalls).toBe(0)
  })

  it('clears the watchdog when killed so no timer outlives the session', () => {
    const { session, pty, port } = start()
    port.emitRendererMessage({ type: 'ack', bytes: 0 })
    flood(pty, 1024 * KB)

    session.kill()
    jest.advanceTimersByTime(60_000)

    expect(pty.resumeCalls).toBe(0)
  })

  it('works with a PTY that cannot pause', () => {
    const { pty, port } = start()
    ;(pty as any).pause = undefined
    port.emitRendererMessage({ type: 'ack', bytes: 0 })

    expect(() => flood(pty, 2048 * KB)).not.toThrow()
  })
})

describe('PtySession renderer message validation', () => {
  it.each([
    ['a number', 42],
    ['a plain object', { length: 3 }],
    ['an array', [1, 2, 3]],
    ['null', null],
    ['undefined', undefined],
  ])('drops input whose bytes are %s without throwing', (_n, bytes) => {
    const { pty, port } = start()

    expect(() =>
      port.emitRendererMessage({ type: 'input', bytes })
    ).not.toThrow()
    expect(pty.writes).toHaveLength(0)
  })

  it('accepts string and byte-array input', () => {
    const { pty, port } = start()
    port.emitRendererMessage({ type: 'input', bytes: 'ls\n' })
    port.emitRendererMessage({ type: 'input', bytes: new Uint8Array([1, 2]) })
    expect(pty.writes).toHaveLength(2)
  })

  it('drops oversized input', () => {
    const { pty, port } = start()
    port.emitRendererMessage({
      type: 'input',
      bytes: new Uint8Array(1024 * KB + 1),
    })
    expect(pty.writes).toHaveLength(0)
  })

  it('ignores non-finite resize dimensions', () => {
    const { session, pty, port } = start()
    port.emitRendererMessage({ type: 'resize', cols: NaN, rows: 10 })
    port.emitRendererMessage({ type: 'resize', cols: 10, rows: Infinity })

    expect(pty.resizes).toHaveLength(0)
    expect(session.getSnapshot().cols).toBe(80)
  })

  it('clamps absurd resize dimensions', () => {
    const { pty, port } = start()
    port.emitRendererMessage({ type: 'resize', cols: 1e9, rows: 1e9 })
    expect(pty.resizes[0]).toEqual({ cols: 1000, rows: 1000 })
  })

  it.each([['x'], [-5], [NaN], [Infinity], [undefined]])(
    'ignores a bad ack value (%p)',
    bytes => {
      const { pty, port } = start()
      expect(() =>
        port.emitRendererMessage({ type: 'ack', bytes })
      ).not.toThrow()
      expect(pty.pauseCalls).toBe(0)
    }
  )
})
