import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FileTabs } from '../../../src/ui/file-tree/file-tabs'

const noop = () => undefined

const baseProps = {
  openFilePaths: [] as ReadonlyArray<string>,
  activeFilePath: null as string | null,
  onSelectTab: noop,
  onCloseTab: noop,
  onCloseAll: noop,
  onTabContextMenu: noop,
  onReorderTab: noop,
}

function render(props: Partial<React.ComponentProps<typeof FileTabs>> = {}) {
  return renderToStaticMarkup(
    React.createElement(FileTabs, { ...baseProps, ...props })
  )
}

/** Build a FileTabs instance with a stubbed setState for handler-level tests. */
function instance(props: Partial<React.ComponentProps<typeof FileTabs>> = {}) {
  const tabs = new FileTabs({ ...baseProps, ...props })
  ;(tabs as any).setState = (patch: any) => {
    ;(tabs as any).state = { ...(tabs as any).state, ...patch }
  }
  return tabs
}

describe('FileTabs', () => {
  it('renders nothing when no files are open', () => {
    expect(render()).toBe('')
  })

  it('renders one tab per open file with its base name', () => {
    const html = render({
      openFilePaths: ['app/index.ts', 'README.md'],
      activeFilePath: 'app/index.ts',
    })
    expect(html).toContain('index.ts')
    expect(html).toContain('README.md')
  })

  it('marks the active tab', () => {
    const html = render({
      openFilePaths: ['a.ts', 'b.ts'],
      activeFilePath: 'b.ts',
    })
    // Only the active tab carries the "active" class modifier.
    expect(html.match(/file-tab active/g)?.length).toBe(1)
  })

  it('renders draggable tabs', () => {
    const html = render({ openFilePaths: ['a.ts'], activeFilePath: 'a.ts' })
    expect(html).toContain('draggable="true"')
  })

  it('hides "close all" until more than one tab is open', () => {
    expect(
      render({ openFilePaths: ['a.ts'], activeFilePath: 'a.ts' })
    ).not.toContain('Close all')
    expect(
      render({ openFilePaths: ['a.ts', 'b.ts'], activeFilePath: 'a.ts' })
    ).toContain('Close all')
  })

  it('fires onCloseTab without selecting when the close button is clicked', () => {
    const onSelectTab = jest.fn()
    const onCloseTab = jest.fn()
    const tabs = instance({ onSelectTab, onCloseTab })
    const stopPropagation = jest.fn()
    ;(tabs as any).onClose('a.ts')({ stopPropagation })
    expect(onCloseTab).toHaveBeenCalledWith('a.ts')
    expect(stopPropagation).toHaveBeenCalled()
    expect(onSelectTab).not.toHaveBeenCalled()
  })

  it('closes a tab on middle-click', () => {
    const onCloseTab = jest.fn()
    const tabs = instance({ onCloseTab })
    ;(tabs as any).onMiddleClick('a.ts')({ button: 1, preventDefault: noop })
    expect(onCloseTab).toHaveBeenCalledWith('a.ts')
  })

  it('fires onTabContextMenu on right-click and suppresses the native menu', () => {
    const onTabContextMenu = jest.fn()
    const tabs = instance({
      openFilePaths: ['a.ts', 'b.ts'],
      onTabContextMenu,
    })
    const preventDefault = jest.fn()
    ;(tabs as any).onContextMenu('b.ts')({ preventDefault })
    expect(preventDefault).toHaveBeenCalled()
    expect(onTabContextMenu).toHaveBeenCalledWith('b.ts')
  })

  it('fires onReorderTab when a tab is dropped onto another', () => {
    const onReorderTab = jest.fn()
    const tabs = instance({
      openFilePaths: ['a.ts', 'b.ts'],
      onReorderTab,
    })
    ;(tabs as any).onDragStart('a.ts')({
      dataTransfer: {},
    })
    const preventDefault = jest.fn()
    ;(tabs as any).onDrop('b.ts')({ preventDefault })
    expect(preventDefault).toHaveBeenCalled()
    expect(onReorderTab).toHaveBeenCalledWith('a.ts', 'b.ts')
  })

  it('does not reorder when a tab is dropped onto itself', () => {
    const onReorderTab = jest.fn()
    const tabs = instance({ openFilePaths: ['a.ts', 'b.ts'], onReorderTab })
    ;(tabs as any).onDragStart('a.ts')({ dataTransfer: {} })
    ;(tabs as any).onDrop('a.ts')({ preventDefault: noop })
    expect(onReorderTab).not.toHaveBeenCalled()
  })
})

describe('FileTabs accessibility', () => {
  it('keeps "Close all" out of the tablist', () => {
    const html = render({
      openFilePaths: ['a.ts', 'b.ts'],
      activeFilePath: 'a.ts',
    })
    const tablist = html.match(/<div[^>]*role="tablist"[^>]*>/)
    expect(tablist).not.toBeNull()
    // The tablist is the strip, which closes before the Close all button.
    const stripEnd = html.indexOf('file-tabs-close-all')
    const listStart = html.indexOf('role="tablist"')
    expect(listStart).toBeLessThan(stripEnd)
    expect(html.slice(listStart, stripEnd)).toContain('</div></div>')
  })

  it('uses a roving tabindex and describes tabs by path', () => {
    const html = render({
      openFilePaths: ['src/a.ts', 'src/b.ts'],
      activeFilePath: 'src/b.ts',
    })
    const tabButtons = html.match(/<button[^>]*role="tab"[^>]*>/g)!
    expect(tabButtons[0]).toContain('tabindex="-1"')
    expect(tabButtons[1]).toContain('tabindex="0"')
    // Visible name is the accessible name; the path is only a description.
    expect(tabButtons[0]).not.toContain('aria-label')
    expect(tabButtons[0]).toContain('aria-describedby')
    expect(html).toContain('class="sr-only">src/a.ts<')
  })

  it('falls back to the first tab as the Tab stop when none is active', () => {
    const html = render({
      openFilePaths: ['a.ts', 'b.ts'],
      activeFilePath: null,
    })
    const tabButtons = html.match(/<button[^>]*role="tab"[^>]*>/g)!
    expect(tabButtons[0]).toContain('tabindex="0"')
    expect(tabButtons[1]).toContain('tabindex="-1"')
  })

  const key = (k: string, over: any = {}) => ({
    key: k,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: jest.fn(),
    ...over,
  })

  it('arrow keys select the neighbouring tab and wrap', () => {
    const onSelectTab = jest.fn()
    const tabs = instance({
      openFilePaths: ['a.ts', 'b.ts', 'c.ts'],
      activeFilePath: 'a.ts',
      onSelectTab,
    })
    ;(tabs as any).onTabKeyDown('a.ts')(key('ArrowLeft'))
    expect(onSelectTab).toHaveBeenLastCalledWith('c.ts')
    ;(tabs as any).onTabKeyDown('c.ts')(key('ArrowRight'))
    expect(onSelectTab).toHaveBeenLastCalledWith('a.ts')
    ;(tabs as any).onTabKeyDown('b.ts')(key('Home'))
    expect(onSelectTab).toHaveBeenLastCalledWith('a.ts')
    ;(tabs as any).onTabKeyDown('a.ts')(key('End'))
    expect(onSelectTab).toHaveBeenLastCalledWith('c.ts')
  })

  it('Ctrl+Shift+Arrow reorders and announces', () => {
    const onReorderTab = jest.fn()
    const tabs = instance({
      openFilePaths: ['src/a.ts', 'src/b.ts'],
      activeFilePath: 'src/a.ts',
      onReorderTab,
    })
    ;(tabs as any).onTabKeyDown('src/a.ts')(
      key('ArrowRight', { ctrlKey: true, shiftKey: true })
    )
    expect(onReorderTab).toHaveBeenCalledWith('src/a.ts', 'src/b.ts')
    expect((tabs as any).state.announcement).toBe(
      'Moved a.ts to position 2 of 2'
    )
    // Cannot move the first tab left.
    onReorderTab.mockClear()
    ;(tabs as any).onTabKeyDown('src/a.ts')(
      key('ArrowLeft', { ctrlKey: true, shiftKey: true })
    )
    expect(onReorderTab).not.toHaveBeenCalled()
  })

  it('Delete closes the focused tab', () => {
    const onCloseTab = jest.fn()
    const tabs = instance({
      openFilePaths: ['a.ts'],
      activeFilePath: 'a.ts',
      onCloseTab,
    })
    ;(tabs as any).onTabKeyDown('a.ts')(key('Delete'))
    expect(onCloseTab).toHaveBeenCalledWith('a.ts')
  })
})
