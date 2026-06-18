import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SubmoduleList } from '../../../src/ui/submodules/submodule-list'
import { SubmoduleListItem } from '../../../src/ui/submodules/submodule-list-item'
import {
  ISubmoduleStatusEntry,
  SubmoduleWorkDirState,
} from '../../../src/models/submodule'

const entry = (
  over: Partial<ISubmoduleStatusEntry> = {}
): ISubmoduleStatusEntry => ({
  sha: 'abcdef0123456789abcdef0123456789abcdef01',
  path: 'vendor/lib',
  describe: 'v1.0.0',
  state: SubmoduleWorkDirState.UpToDate,
  ...over,
})

const noop = () => undefined

const renderList = (props: {
  entries: ReadonlyArray<ISubmoduleStatusEntry>
  loading: boolean
}): string =>
  renderToStaticMarkup(
    React.createElement(SubmoduleList, {
      ...props,
      onUpdateAll: noop,
      onSyncAll: noop,
      onUpdateSubmodule: noop,
    })
  )

const renderItem = (e: ISubmoduleStatusEntry): string =>
  renderToStaticMarkup(
    React.createElement(SubmoduleListItem, { entry: e, onUpdate: noop })
  )

describe('SubmoduleList', () => {
  it('shows a loading message while refreshing', () => {
    expect(renderList({ entries: [], loading: true })).toContain(
      'Loading submodules'
    )
  })

  it('shows an empty message when there are no submodules', () => {
    expect(renderList({ entries: [], loading: false })).toContain(
      'No submodules found'
    )
  })

  it('renders one row per entry', () => {
    const html = renderList({
      entries: [entry({ path: 'vendor/a' }), entry({ path: 'vendor/b' })],
      loading: false,
    })
    expect(html).toContain('vendor/a')
    expect(html).toContain('vendor/b')
  })
})

describe('SubmoduleListItem', () => {
  it('shows the path, describe, and short sha', () => {
    const html = renderItem(entry())
    expect(html).toContain('vendor/lib')
    expect(html).toContain('v1.0.0')
    expect(html).toContain('abcdef01')
  })

  it('shows an uninitialized badge', () => {
    const html = renderItem(
      entry({ state: SubmoduleWorkDirState.Uninitialized })
    )
    expect(html.toLowerCase()).toContain('uninitialized')
  })

  it('shows an out-of-date badge', () => {
    const html = renderItem(entry({ state: SubmoduleWorkDirState.OutOfDate }))
    expect(html.toLowerCase()).toContain('out of date')
  })

  it('shows a conflicted badge', () => {
    const html = renderItem(entry({ state: SubmoduleWorkDirState.Conflicted }))
    expect(html.toLowerCase()).toContain('conflict')
  })
})
