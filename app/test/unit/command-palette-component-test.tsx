import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommandPalette } from '../../src/ui/command-palette/command-palette'
import { ICommandPaletteItem } from '../../src/models/command-palette'

function items(): ReadonlyArray<ICommandPaletteItem> {
  return [
    { id: 'push', title: 'Push', action: jest.fn() },
    { id: 'pull', title: 'Pull', action: jest.fn() },
    { id: 'fetch', title: 'Fetch origin', action: jest.fn() },
  ]
}

/** Build a palette whose setState mutates synchronously for assertions. */
function makePalette(its = items()): CommandPalette {
  const palette = new CommandPalette({ items: its, onDismissed: jest.fn() })
  ;(palette as any).setState = function (partial: any) {
    this.state = {
      ...this.state,
      ...(typeof partial === 'function' ? partial(this.state) : partial),
    }
  }
  return palette
}

function render(palette: CommandPalette): string {
  return renderToStaticMarkup(palette.render() as React.ReactElement)
}

describe('CommandPalette', () => {
  it('renders every command when the query is empty', () => {
    const html = render(makePalette())
    expect(html).toContain('Push')
    expect(html).toContain('Pull')
    expect(html).toContain('Fetch origin')
  })

  it('filters the list as the query narrows', () => {
    const palette = makePalette()
    ;(palette as any).state = { query: 'fetch', selectedIndex: 0 }
    const html = render(palette)
    expect(html).toContain('Fetch origin')
    expect(html).not.toContain('>Push<')
    expect(html).not.toContain('>Pull<')
  })

  it('runs the selected command and dismisses on activation', () => {
    const its = items()
    const onDismissed = jest.fn()
    const palette = new CommandPalette({ items: its, onDismissed })
    ;(palette as any).setState = function (p: any) {
      this.state = { ...this.state, ...p }
    }
    ;(palette as any).state = { query: '', selectedIndex: 1 }

    // Activating the second visible item runs Pull.
    ;(palette as any).activateSelected()

    expect(its[1].action).toHaveBeenCalledTimes(1)
    expect(onDismissed).toHaveBeenCalledTimes(1)
  })

  it('shows an empty state when nothing matches', () => {
    const palette = makePalette()
    ;(palette as any).state = { query: 'zzzznomatch', selectedIndex: 0 }
    expect(render(palette).toLowerCase()).toContain('no commands')
  })
})

describe('CommandPalette combobox accessibility', () => {
  it('exposes combobox semantics wired to the listbox and active option', () => {
    const html = render(makePalette())
    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('aria-controls="command-palette-listbox"')
    expect(html).toContain('aria-activedescendant="command-palette-option-0"')
    expect(html).toContain('id="command-palette-listbox"')
    expect(html).toContain('id="command-palette-option-2"')
  })

  it('announces the result count and the empty state in a live region', () => {
    expect(render(makePalette())).toContain('3 commands available')
    const palette = makePalette()
    ;(palette as any).state = { query: 'zzzznomatch', selectedIndex: 0 }
    const html = render(palette)
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('No commands found')
    expect(html).toContain('aria-expanded="false"')
  })

  it('moves the selection with Home/End/PageDown/PageUp', () => {
    const palette = makePalette()
    const press = (key: string, extra: any = {}) =>
      (palette as any).onKeyDown({ key, preventDefault: jest.fn(), ...extra })
    ;(palette as any).state = { query: '', selectedIndex: 0, error: null }
    press('End')
    expect((palette as any).state.selectedIndex).toBe(2)
    press('Home')
    expect((palette as any).state.selectedIndex).toBe(0)
    press('PageDown')
    expect((palette as any).state.selectedIndex).toBe(2)
    press('PageUp')
    expect((palette as any).state.selectedIndex).toBe(0)
  })

  it('leaves Home/End to the caret when there is a query', () => {
    const palette = makePalette()
    ;(palette as any).state = { query: 'p', selectedIndex: 0, error: null }
    const preventDefault = jest.fn()
    ;(palette as any).onKeyDown({ key: 'End', preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('keeps the palette open and shows an alert when an action throws', () => {
    const its: ICommandPaletteItem[] = [
      {
        id: 'boom',
        title: 'Boom',
        action: () => {
          throw new Error('kaput')
        },
      },
    ]
    const onDismissed = jest.fn()
    const palette = new CommandPalette({ items: its, onDismissed })
    ;(palette as any).setState = function (p: any) {
      this.state = { ...this.state, ...p }
    }
    ;(palette as any).activateSelected()
    expect(onDismissed).not.toHaveBeenCalled()
    const html = render(palette)
    expect(html).toContain('role="alert"')
    expect(html).toContain('Could not run')
    expect(html).toContain('Boom')
    expect(html).toContain('kaput')
  })

  it('handles async rejections instead of leaving them unhandled', async () => {
    const its: ICommandPaletteItem[] = [
      {
        id: 'later',
        title: 'Later',
        action: (() => Promise.reject(new Error('nope'))) as any,
      },
    ]
    const onDismissed = jest.fn()
    const palette = new CommandPalette({ items: its, onDismissed })
    ;(palette as any).setState = function (p: any) {
      this.state = { ...this.state, ...p }
    }
    ;(palette as any).activateSelected()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(onDismissed).not.toHaveBeenCalled()
    expect(render(palette)).toContain('nope')
  })

  it('dismisses after an async action resolves', async () => {
    const its: ICommandPaletteItem[] = [
      { id: 'ok', title: 'Ok', action: (() => Promise.resolve()) as any },
    ]
    const onDismissed = jest.fn()
    const palette = new CommandPalette({ items: its, onDismissed })
    ;(palette as any).activateSelected()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(onDismissed).toHaveBeenCalledTimes(1)
  })
})
