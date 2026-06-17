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
