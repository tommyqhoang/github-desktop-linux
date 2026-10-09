import {
  terminalScrollbackKey,
  loadTerminalScrollback,
  saveTerminalScrollback,
  clearTerminalScrollback,
  clampScrollback,
  MAX_SCROLLBACK_CHARS,
} from '../../../src/lib/terminal/scrollback'

describe('terminal/scrollback', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('terminalScrollbackKey', () => {
    it('namespaces the session id under a versioned prefix', () => {
      expect(terminalScrollbackKey('abc')).toBe('terminal-scrollback-v1:abc')
    })

    it('produces distinct keys per session', () => {
      expect(terminalScrollbackKey('one')).not.toBe(
        terminalScrollbackKey('two')
      )
    })
  })

  describe('save/load round-trip', () => {
    it('persists and reads back the payload', () => {
      saveTerminalScrollback('s1', 'hello world')
      expect(loadTerminalScrollback('s1')).toBe('hello world')
    })

    it('returns null for an unknown session', () => {
      expect(loadTerminalScrollback('missing')).toBeNull()
    })

    it('keeps sessions isolated from one another', () => {
      saveTerminalScrollback('s1', 'first')
      saveTerminalScrollback('s2', 'second')
      expect(loadTerminalScrollback('s1')).toBe('first')
      expect(loadTerminalScrollback('s2')).toBe('second')
    })
  })

  describe('saveTerminalScrollback', () => {
    it('removes the key when given an empty payload', () => {
      saveTerminalScrollback('s1', 'something')
      saveTerminalScrollback('s1', '')
      expect(loadTerminalScrollback('s1')).toBeNull()
      expect(localStorage.getItem(terminalScrollbackKey('s1'))).toBeNull()
    })

    it('overwrites a previous payload', () => {
      saveTerminalScrollback('s1', 'old')
      saveTerminalScrollback('s1', 'new')
      expect(loadTerminalScrollback('s1')).toBe('new')
    })
  })

  describe('clearTerminalScrollback', () => {
    it('removes a stored payload', () => {
      saveTerminalScrollback('s1', 'data')
      clearTerminalScrollback('s1')
      expect(loadTerminalScrollback('s1')).toBeNull()
    })

    it('is a no-op for an absent session', () => {
      expect(() => clearTerminalScrollback('missing')).not.toThrow()
    })
  })

  describe('clampScrollback', () => {
    it('returns content within the limit unchanged', () => {
      expect(clampScrollback('a\r\nb', 100)).toBe('a\r\nb')
      expect(clampScrollback('abc', 3)).toBe('abc')
    })

    it('keeps the most recent rows and drops the oldest', () => {
      const rows = Array.from({ length: 50 }, (_, i) => `row-${i}`)
      const clamped = clampScrollback(rows.join('\r\n'), 60)

      expect(clamped).toContain('row-49')
      expect(clamped).not.toContain('row-0\r')
    })

    it('starts on a whole row, never mid-row', () => {
      const rows = Array.from({ length: 50 }, (_, i) => `row-${i}`)
      const clamped = clampScrollback(rows.join('\r\n'), 60)
      const firstRow = clamped.replace('\x1b[0m', '').split('\r\n')[0]

      expect(firstRow).toMatch(/^row-\d+$/)
    })

    it('never cuts inside an escape sequence', () => {
      // A plain tail slice of this content would begin at "31mred...", i.e.
      // in the middle of the colour code. Cutting at a row boundary drops that
      // partial row instead, leaving only whole rows.
      const content = 'x'.repeat(10) + '\n\x1b[31mred\x1b[0m\nend'
      expect(content.slice(-14).startsWith('31m')).toBe(true)

      expect(clampScrollback(content, 14)).toBe('\x1b[0mend')
    })

    it('resets attributes so a trimmed start does not inherit colour', () => {
      const clamped = clampScrollback('a\nb\nc\nd\ne\nf', 6)
      expect(clamped.startsWith('\x1b[0m')).toBe(true)
    })

    it('keeps the raw tail when there is no row boundary to cut at', () => {
      const clamped = clampScrollback('y'.repeat(100), 10)
      expect(clamped).toBe('\x1b[0m' + 'y'.repeat(10))
    })

    it('stays within the limit plus the reset prefix', () => {
      const clamped = clampScrollback('z\n'.repeat(5000), 1000)
      expect(clamped.length).toBeLessThanOrEqual(1000 + '\x1b[0m'.length)
    })
  })

  describe('size limits when saving', () => {
    afterEach(() => jest.restoreAllMocks())

    it('caps what is stored for an oversized buffer', () => {
      const huge = 'line\r\n'.repeat(MAX_SCROLLBACK_CHARS)
      saveTerminalScrollback('big', huge)

      const stored = loadTerminalScrollback('big')!
      expect(stored.length).toBeLessThanOrEqual(MAX_SCROLLBACK_CHARS + 10)
      expect(stored.endsWith('line\r\n')).toBe(true)
    })

    it('stores a normal buffer untouched', () => {
      saveTerminalScrollback('small', 'hello\r\nworld')
      expect(loadTerminalScrollback('small')).toBe('hello\r\nworld')
    })

    it('retries with a smaller tail when the quota rejects the write', () => {
      const real = Storage.prototype.setItem
      const limit = MAX_SCROLLBACK_CHARS / 2
      jest
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(function (this: Storage, k: string, v: string) {
          if (v.length > limit) {
            throw new DOMException('quota', 'QuotaExceededError')
          }
          return real.call(this, k, v)
        })

      saveTerminalScrollback('quota', 'line\r\n'.repeat(MAX_SCROLLBACK_CHARS))

      const stored = loadTerminalScrollback('quota')
      expect(stored).not.toBeNull()
      expect(stored!.length).toBeLessThanOrEqual(limit)
    })

    it('gives up quietly when even the smaller write is rejected', () => {
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError')
      })

      expect(() => saveTerminalScrollback('nope', 'some output')).not.toThrow()
      expect(loadTerminalScrollback('nope')).toBeNull()
    })

    it('does not touch other sessions when it has to shrink', () => {
      saveTerminalScrollback('other', 'keep me')
      saveTerminalScrollback('big', 'line\r\n'.repeat(MAX_SCROLLBACK_CHARS))

      expect(loadTerminalScrollback('other')).toBe('keep me')
    })
  })
})
