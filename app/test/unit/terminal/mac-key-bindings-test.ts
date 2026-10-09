import { macTerminalKeySequence } from '../../../src/lib/terminal/mac-key-bindings'

const ev = (key: string, mods: Partial<Record<string, boolean>> = {}) => ({
  key,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...mods,
})

describe('macTerminalKeySequence', () => {
  it('maps Option+Arrow to word movement', () => {
    expect(macTerminalKeySequence(ev('ArrowLeft', { altKey: true }))).toBe(
      '\x1bb'
    )
    expect(macTerminalKeySequence(ev('ArrowRight', { altKey: true }))).toBe(
      '\x1bf'
    )
  })
  it('maps Cmd+Arrow to line start/end and Cmd+Backspace to kill line', () => {
    expect(macTerminalKeySequence(ev('ArrowLeft', { metaKey: true }))).toBe(
      '\x01'
    )
    expect(macTerminalKeySequence(ev('ArrowRight', { metaKey: true }))).toBe(
      '\x05'
    )
    expect(macTerminalKeySequence(ev('Backspace', { metaKey: true }))).toBe(
      '\x15'
    )
  })
  it('maps Option+Backspace to kill word', () => {
    expect(macTerminalKeySequence(ev('Backspace', { altKey: true }))).toBe(
      '\x1b\x7f'
    )
  })
  it('ignores plain, shifted and ctrl chords', () => {
    expect(macTerminalKeySequence(ev('ArrowLeft'))).toBeNull()
    expect(
      macTerminalKeySequence(ev('ArrowLeft', { altKey: true, shiftKey: true }))
    ).toBeNull()
    expect(
      macTerminalKeySequence(ev('ArrowLeft', { ctrlKey: true }))
    ).toBeNull()
    expect(macTerminalKeySequence(ev('a', { metaKey: true }))).toBeNull()
  })
})
