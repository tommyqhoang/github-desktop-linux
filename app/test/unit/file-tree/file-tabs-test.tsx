import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FileTabs } from '../../../src/ui/file-tree/file-tabs'

const noop = () => undefined

function render(props: Partial<React.ComponentProps<typeof FileTabs>> = {}) {
  return renderToStaticMarkup(
    React.createElement(FileTabs, {
      openFilePaths: [],
      activeFilePath: null,
      onSelectTab: noop,
      onCloseTab: noop,
      onCloseAll: noop,
      ...props,
    })
  )
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
    const tabs = new FileTabs({
      openFilePaths: ['a.ts'],
      activeFilePath: 'a.ts',
      onSelectTab,
      onCloseTab,
      onCloseAll: noop,
    })
    const stopPropagation = jest.fn()
    ;(tabs as any).onClose('a.ts')({ stopPropagation })
    expect(onCloseTab).toHaveBeenCalledWith('a.ts')
    expect(stopPropagation).toHaveBeenCalled()
    expect(onSelectTab).not.toHaveBeenCalled()
  })

  it('closes a tab on middle-click', () => {
    const onCloseTab = jest.fn()
    const tabs = new FileTabs({
      openFilePaths: ['a.ts'],
      activeFilePath: 'a.ts',
      onSelectTab: noop,
      onCloseTab,
      onCloseAll: noop,
    })
    ;(tabs as any).onMiddleClick('a.ts')({ button: 1, preventDefault: noop })
    expect(onCloseTab).toHaveBeenCalledWith('a.ts')
  })
})
