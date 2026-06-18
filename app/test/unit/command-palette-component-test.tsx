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
