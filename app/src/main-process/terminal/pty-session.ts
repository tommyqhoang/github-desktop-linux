/**
 * Wraps a single PTY process and the Electron `MessagePortMain` it
 * communicates with. The class is structured to be unit-testable without
 * importing `node-pty` — the PTY is supplied via the `PtyFactory` argument
 * and any `IPty`-compatible object will do.
 *
 * The session owns:
 *   - the PTY process lifecycle (spawn → kill → exit)
 *   - the bytes pump (PTY → renderer; renderer → PTY)
 *   - resize forwarding
 *   - exit notification
 *
 * Higher-level coordination (mapping repo id to session id, exposing state
 * to the renderer's store) is the job of `TerminalManager`, not this class.
 */

import {
  IPtyOptions,
  ITerminalSessionSnapshot,
} from '../../lib/terminal/pty-types'
import { OscParser, OscEvent } from '../../lib/terminal/osc-parser'

/** Minimum surface our PTY needs to expose. Mirrors `node-pty`'s `IPty`. */
export interface IPty {
  readonly pid: number
  onData(cb: (data: string | Buffer) => void): { dispose(): void }
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): {
    dispose(): void
  }
  write(data: string | Buffer): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
  /** Stop reading PTY output (flow control). Not available on every platform. */
  pause?(): void
  resume?(): void
}

/**
 * Output is batched so a burst of small PTY reads becomes one port message:
 * fewer structured-clone round trips and one xterm write per batch. The first
 * chunk after an idle gap is posted immediately (typing echo is never
 * delayed); only chunks arriving within COALESCE_MS of the last post wait.
 */
const COALESCE_MS = 4
const MAX_BATCH_BYTES = 64 * 1024

/**
 * Flow control. The renderer acks bytes once xterm has parsed them; while more
 * than HIGH_WATERMARK bytes are unacked the PTY is paused (so `cat bigfile`
 * can't queue unbounded data in the port), and resumed below LOW_WATERMARK.
 * It only engages after the renderer has acked at least once, so a consumer
 * that never acks can't wedge the shell, and a watchdog resumes the PTY if
 * acks stop arriving while paused.
 */
const HIGH_WATERMARK = 1024 * 1024
const LOW_WATERMARK = 256 * 1024
const ACK_WATCHDOG_MS = 10_000

/** Upper bounds on renderer-supplied values. */
const MAX_INPUT_BYTES = 1024 * 1024
const MAX_COLS = 1000
const MAX_ROWS = 1000

/** Factory function that creates a PTY given options. */
export type PtyFactory = (options: IPtyOptions) => IPty

/**
 * Subset of `Electron.MessagePortMain` we use. Ports tests should pass a
 * fake exposing the same shape — no `Electron` import required.
 */
export interface IPtyPort {
  start(): void
  postMessage(message: any, transferables?: any[]): void
  on(event: 'message', cb: (event: { data: any }) => void): void
  on(event: 'close', cb: () => void): void
  removeAllListeners(event?: string): void
  close(): void
}

interface IPtySessionDeps {
  readonly factory: PtyFactory
  readonly port: IPtyPort
  readonly options: IPtyOptions
  readonly id: string
  readonly repositoryId: number
  readonly now?: () => number
}

/**
 * One terminal session — encapsulates a PTY + a `MessagePort`. After
 * construction the session is `'starting'`; after `start()` resolves the
 * status flips to `'running'`. When the underlying shell exits the status
 * is `'exited'` and `exitCode` is set.
 */
export class PtySession {
  private readonly deps: IPtySessionDeps
  private pty: IPty | null = null
  private snapshot: ITerminalSessionSnapshot
  private dataDisposable: { dispose(): void } | null = null
  private exitDisposable: { dispose(): void } | null = null
  private destroyed = false
  private exitListeners: Array<(snapshot: ITerminalSessionSnapshot) => void> =
    []
  private oscParser = new OscParser()

  private pendingChunks: Uint8Array[] = []
  private pendingBytes = 0
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private lastFlushAt = 0
  private unackedBytes = 0
  private ackSeen = false
  private paused = false
  private watchdog: ReturnType<typeof setTimeout> | null = null

  public constructor(deps: IPtySessionDeps) {
    this.deps = deps
    this.snapshot = {
      id: deps.id,
      repositoryId: deps.repositoryId,
      cwd: deps.options.cwd,
      shell: deps.options.shell,
      cols: deps.options.cols,
      rows: deps.options.rows,
      createdAt: (deps.now ?? Date.now)(),
      status: 'starting',
      exitCode: null,
      liveCwd: null,
      hasActivity: false,
      lastExitCode: null,
      title: null,
    }
  }

  /** Snapshot of the session as observed externally. Always returns a fresh copy. */
  public getSnapshot(): ITerminalSessionSnapshot {
    return { ...this.snapshot }
  }

  /**
   * Spawn the PTY, wire up the port pump, and flip status to 'running'.
   *
   * Idempotent: subsequent calls are no-ops once the PTY exists.
   */
  public start(): void {
    if (this.pty !== null || this.destroyed) {
      return
    }

    this.oscParser.onEvent(evt => this.onOsc(evt))

    this.pty = this.deps.factory(this.deps.options)
    this.snapshot = { ...this.snapshot, status: 'running' }

    this.dataDisposable = this.pty.onData(chunk => {
      if (this.destroyed) {
        return
      }
      this.enqueue(chunkToBytes(chunk))
    })

    this.exitDisposable = this.pty.onExit(({ exitCode }) => {
      if (this.destroyed) {
        // We may have torn down already (renderer-initiated kill). Drop.
        return
      }
      this.flushPending()
      this.snapshot = { ...this.snapshot, status: 'exited', exitCode }
      this.safePost({ type: 'exit', exitCode })
      const listeners = this.exitListeners.slice()
      for (const cb of listeners) {
        try {
          cb(this.snapshot)
        } catch (err) {
          log.error('[pty-session] exit listener threw', err as Error)
        }
      }
      this.cleanup()
    })

    this.deps.port.on('message', ({ data }) => this.handleRendererMessage(data))
    this.deps.port.on('close', () => this.kill())
    this.deps.port.start()
  }

  /** Forward keystrokes / paste payloads to the PTY. */
  public write(bytes: Uint8Array | string): void {
    if (this.pty === null || this.destroyed) {
      return
    }
    this.pty.write(typeof bytes === 'string' ? bytes : Buffer.from(bytes))
  }

  /** Resize the PTY (clamped to >=1 in each dimension). */
  public resize(cols: number, rows: number): void {
    if (this.pty === null || this.destroyed) {
      return
    }
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) {
      return
    }
    const c = Math.min(MAX_COLS, Math.max(1, Math.floor(cols)))
    const r = Math.min(MAX_ROWS, Math.max(1, Math.floor(rows)))
    if (c === this.snapshot.cols && r === this.snapshot.rows) {
      return
    }
    try {
      this.pty.resize(c, r)
    } catch (err) {
      // PTY may have exited between the check and the call; not actionable.
      log.warn('[pty-session] resize failed', err as Error)
      return
    }
    this.snapshot = { ...this.snapshot, cols: c, rows: r }
  }

  /** Kill the PTY and tear down the port. Safe to call multiple times. */
  public kill(signal: string = 'SIGHUP'): void {
    if (this.destroyed) {
      return
    }
    if (this.pty !== null) {
      try {
        this.pty.kill(signal)
      } catch {
        // PTY may have already exited; nothing actionable.
      }
    }
    this.cleanup()
  }

  /** Subscribe to the one-shot exit notification. */
  public onExit(cb: (snapshot: ITerminalSessionSnapshot) => void): void {
    this.exitListeners.push(cb)
  }

  private handleRendererMessage(data: any): void {
    if (this.destroyed) {
      return
    }
    if (data === null || typeof data !== 'object') {
      return
    }
    // Runs inside the port's message event in the main process, so a
    // malformed payload must never throw out of here.
    try {
      switch (data.type) {
        case 'input': {
          const bytes = data.bytes
          const length =
            typeof bytes === 'string'
              ? bytes.length
              : ArrayBuffer.isView(bytes)
                ? bytes.byteLength
                : -1
          if (length < 0 || length > MAX_INPUT_BYTES) {
            return
          }
          this.write(bytes)
          return
        }
        case 'resize':
          this.resize(data.cols, data.rows)
          return
        case 'ack':
          this.handleAck(data.bytes)
          return
        default:
          // Unknown message — drop silently. We never throw on a renderer payload.
          return
      }
    } catch (err) {
      log.warn('[pty-session] dropped malformed renderer message', err as Error)
    }
  }

  /** Queue PTY output and post it as one batched message. */
  private enqueue(bytes: Uint8Array): void {
    this.pendingChunks.push(bytes)
    this.pendingBytes += bytes.byteLength
    // Parse after queueing: an OSC event flushes pending output first so
    // `meta` messages never overtake the bytes that produced them.
    this.oscParser.feed(bytes)

    if (this.pendingBytes === 0) {
      return
    }
    if (this.pendingBytes >= MAX_BATCH_BYTES) {
      this.flushPending()
      return
    }
    if (this.flushTimer !== null) {
      return
    }
    const sinceLast = Date.now() - this.lastFlushAt
    if (sinceLast >= COALESCE_MS) {
      this.flushPending()
    } else {
      this.flushTimer = setTimeout(
        () => this.flushPending(),
        COALESCE_MS - sinceLast
      )
    }
  }

  private flushPending(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.pendingBytes === 0) {
      return
    }
    const chunks = this.pendingChunks
    let out: Uint8Array
    if (chunks.length === 1) {
      out = chunks[0]
    } else {
      out = new Uint8Array(this.pendingBytes)
      let offset = 0
      for (const c of chunks) {
        out.set(c, offset)
        offset += c.byteLength
      }
    }
    this.pendingChunks = []
    this.pendingBytes = 0
    this.lastFlushAt = Date.now()
    this.unackedBytes += out.byteLength
    this.safePost({ type: 'data', bytes: out })
    this.pauseIfBacklogged()
  }

  private pauseIfBacklogged(): void {
    if (
      !this.ackSeen ||
      this.paused ||
      this.unackedBytes < HIGH_WATERMARK ||
      this.pty === null ||
      typeof this.pty.pause !== 'function'
    ) {
      return
    }
    try {
      this.pty.pause()
    } catch {
      return
    }
    this.paused = true
    this.armWatchdog()
  }

  private handleAck(bytes: unknown): void {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
      return
    }
    this.ackSeen = true
    this.unackedBytes = Math.max(0, this.unackedBytes - bytes)
    if (!this.paused) {
      return
    }
    if (this.unackedBytes <= LOW_WATERMARK) {
      this.resumePty()
    } else {
      this.armWatchdog()
    }
  }

  private resumePty(): void {
    this.clearWatchdog()
    if (!this.paused) {
      return
    }
    this.paused = false
    try {
      this.pty?.resume?.()
    } catch {
      // PTY may have exited; nothing actionable.
    }
  }

  /**
   * If the renderer stops acking while the PTY is paused (hung, or its view
   * is gone), resume and turn flow control off rather than leave the shell
   * blocked forever.
   */
  private armWatchdog(): void {
    this.clearWatchdog()
    this.watchdog = setTimeout(() => {
      this.watchdog = null
      this.ackSeen = false
      this.unackedBytes = 0
      this.resumePty()
    }, ACK_WATCHDOG_MS)
  }

  private clearWatchdog(): void {
    if (this.watchdog !== null) {
      clearTimeout(this.watchdog)
      this.watchdog = null
    }
  }

  private onOsc(evt: OscEvent): void {
    if (this.destroyed) {
      return
    }
    if (evt.type === 'cwd' || evt.type === 'command-end') {
      this.flushPending()
    }
    if (evt.type === 'cwd') {
      this.snapshot = { ...this.snapshot, liveCwd: evt.path }
      this.safePost({ type: 'meta', liveCwd: evt.path })
    } else if (evt.type === 'command-end') {
      this.snapshot = { ...this.snapshot, lastExitCode: evt.exitCode }
      this.safePost({ type: 'meta', lastExitCode: evt.exitCode })
    }
  }

  private safePost(msg: any): void {
    try {
      this.deps.port.postMessage(msg)
    } catch (err) {
      // Port can be closed by the renderer at any moment; the resulting
      // throw must not propagate into the PTY data callback or it will
      // crash the main process.
      log.warn('[pty-session] postMessage failed', err as Error)
    }
  }

  private cleanup(): void {
    if (this.destroyed) {
      return
    }
    this.destroyed = true
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.clearWatchdog()
    this.pendingChunks = []
    this.pendingBytes = 0
    try {
      this.dataDisposable?.dispose()
    } catch {
      // node-pty disposables can throw if the PTY is gone; ignore.
    }
    try {
      this.exitDisposable?.dispose()
    } catch {
      // Same — ignore.
    }
    this.dataDisposable = null
    this.exitDisposable = null
    try {
      this.deps.port.removeAllListeners()
    } catch {
      // Port may have already been closed.
    }
    try {
      this.deps.port.close()
    } catch {
      // Port may have already been closed.
    }
  }
}

/**
 * Always copy the PTY chunk into a fresh buffer. node-pty re-uses an
 * internal buffer pool for subsequent reads; Electron's structured clone
 * inside `MessagePortMain.postMessage` is asynchronous w.r.t. the caller,
 * so a zero-copy `Uint8Array` view of the source buffer would be
 * overwritten before the renderer receives it (data garbling, output
 * bleed across commands).
 */
function chunkToBytes(chunk: string | Buffer): Uint8Array {
  if (typeof chunk === 'string') {
    const buf = Buffer.from(chunk, 'utf8')
    return new Uint8Array(buf)
  }
  // Copy into a freshly-allocated ArrayBuffer.
  const out = new Uint8Array(chunk.byteLength)
  out.set(chunk)
  return out
}
