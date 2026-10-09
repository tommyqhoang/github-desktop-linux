import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InteractiveRebaseDialog } from '../../src/ui/interactive-rebase/interactive-rebase-dialog'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'

function commit(sha: string, summary: string): Commit {
  const author = new CommitIdentity('A', 'a@example.com', new Date(0))
  return new Commit(
    sha,
    sha.slice(0, 7),
    summary,
    '',
    author,
    author,
    [],
    [],
    []
  )
}

function make() {
  const commits = [
    commit('aaaaaaa1', 'Third'),
    commit('bbbbbbb2', 'Second'),
    commit('ccccccc3', 'First'),
  ]
  const dialog = new InteractiveRebaseDialog({
    repository: {} as any,
    commits,
    lastRetainedCommitRef: null,
    dispatcher: {} as any,
    onDismissed: jest.fn(),
  })
  ;(dialog as any).setState = function (p: any, cb?: () => void) {
    this.state = {
      ...this.state,
      ...(typeof p === 'function' ? p(this.state) : p),
    }
    cb?.()
  }
  return dialog
}

const order = (d: any): string[] =>
  d.state.entries.map((e: any) => e.commit.summary)

describe('InteractiveRebaseDialog keyboard reordering', () => {
  it('Alt+ArrowDown moves the row down and announces it', () => {
    const d: any = make()
    const el = {}
    d.onRowKeyDown(
      {
        key: 'ArrowDown',
        altKey: true,
        target: el,
        currentTarget: el,
        preventDefault: jest.fn(),
      },
      0
    )
    expect(order(d)).toEqual(['Second', 'Third', 'First'])
    expect(d.state.announcement).toBe('Moved Third to position 2 of 3')
  })

  it('Alt+ArrowUp moves up; it is a no-op at the top', () => {
    const d: any = make()
    const el = {}
    const ev = (key: string) => ({
      key,
      altKey: true,
      target: el,
      currentTarget: el,
      preventDefault: jest.fn(),
    })
    d.onRowKeyDown(ev('ArrowUp'), 0)
    expect(order(d)).toEqual(['Third', 'Second', 'First'])
    d.onRowKeyDown(ev('ArrowUp'), 2)
    expect(order(d)).toEqual(['Third', 'First', 'Second'])
  })

  it('ignores plain arrows and keys bubbling from a child <select>', () => {
    const d: any = make()
    d.onRowKeyDown(
      {
        key: 'ArrowDown',
        altKey: false,
        target: {},
        currentTarget: {},
        preventDefault: jest.fn(),
      },
      0
    )
    d.onRowKeyDown(
      {
        key: 'ArrowDown',
        altKey: true,
        target: {},
        currentTarget: {},
        preventDefault: jest.fn(),
      },
      0
    )
    expect(order(d)).toEqual(['Third', 'Second', 'First'])
  })

  it('renders focusable rows with Move up/down buttons disabled at the ends', () => {
    const html = renderToStaticMarkup(make().render() as React.ReactElement)
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('aria-label="Move Third up"')
    expect(html).toMatch(
      /disabled=""[^>]*aria-label="Move Third up"|aria-label="Move Third up"[^>]*disabled=""/
    )
    expect(html).toContain('aria-label="Move First down"')
  })

  it('explains why Start Rebase is disabled when every commit is dropped', () => {
    const d: any = make()
    expect(renderToStaticMarkup(d.render())).not.toContain(
      'Keep at least one commit.'
    )
    for (let i = 0; i < 3; i++) {
      d.onActionChange(i, 'drop')
    }
    const html = renderToStaticMarkup(d.render())
    expect(html).toContain('Keep at least one commit.')
    expect(html).toContain('role="status"')
  })

  it('shows a textual drop indicator, not only a CSS highlight', () => {
    const d: any = make()
    d.onDragStart(0)
    d.onDragOver({ preventDefault: jest.fn() }, 2)
    expect(renderToStaticMarkup(d.render())).toContain('Drop here')
  })
})
