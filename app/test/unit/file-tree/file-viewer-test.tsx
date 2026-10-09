import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FileViewer } from '../../../src/ui/file-tree/file-viewer'
import { Repository } from '../../../src/models/repository'
import { FileViewerContents } from '../../../src/models/file-tree'
import * as readFile from '../../../src/lib/file-tree/read-file'
import * as worker from '../../../src/lib/highlighter/worker'
import * as blameLib from '../../../src/lib/git/blame'

const repo = new Repository('/tmp/repo-1', 1, null, false)

/** Build a FileViewer instance whose setState mutates state synchronously. */
function makeViewer(filePath: string | null): FileViewer {
  const viewer = new FileViewer({
    repository: repo,
    filePath,
    emoji: new Map(),
    reloadToken: 0,
  })
  ;(viewer as any).setState = function (
    partial: Partial<{ [k: string]: unknown }>
  ) {
    this.state = { ...this.state, ...partial }
  }
  return viewer
}

/** Render the viewer's current render() output to static markup. */
function renderViewer(viewer: FileViewer): string {
  return renderToStaticMarkup(viewer.render() as React.ReactElement)
}

function setContents(viewer: FileViewer, contents: FileViewerContents) {
  ;(viewer as any).state = {
    loading: false,
    contents,
    media: null,
    browserViewable: false,
    tokens: {},
    error: null,
  }
}

describe('FileViewer rendering', () => {
  it('prompts to select a file when none is selected', () => {
    const html = renderViewer(makeViewer(null))
    expect(html.toLowerCase()).toContain('select a file')
  })

  it('renders file content with line numbers', () => {
    const viewer = makeViewer('a.txt')
    setContents(viewer, {
      content: 'line one\nline two',
      isBinary: false,
      tooLarge: false,
    })
    const html = renderViewer(viewer)
    expect(html).toContain('line one')
    expect(html).toContain('line two')
    // Line-number gutter renders 1 and 2.
    expect(html).toContain('>1<')
    expect(html).toContain('>2<')
  })

  it('shows a binary notice', () => {
    const viewer = makeViewer('bin')
    setContents(viewer, { content: '', isBinary: true, tooLarge: false })
    expect(renderViewer(viewer).toLowerCase()).toContain('binary file')
  })

  it('shows a too-large notice', () => {
    const viewer = makeViewer('big.txt')
    setContents(viewer, { content: '', isBinary: false, tooLarge: true })
    expect(renderViewer(viewer).toLowerCase()).toContain('too large')
  })

  it('shows an empty-file notice', () => {
    const viewer = makeViewer('empty.txt')
    setContents(viewer, { content: '', isBinary: false, tooLarge: false })
    expect(renderViewer(viewer).toLowerCase()).toContain('empty')
  })

  it('renders Markdown files through the sandboxed renderer', () => {
    const viewer = makeViewer('README.md')
    setContents(viewer, {
      content: '# Hello',
      isBinary: false,
      tooLarge: false,
    })
    const html = renderViewer(viewer)
    // The Markdown branch renders an iframe (SandboxedMarkdown), not a code
    // table, so there is no line-number gutter.
    expect(html).toContain('file-viewer-markdown')
    expect(html).not.toContain('file-viewer-code')
  })

  it('offers to open HTML/PDF files in the browser', () => {
    const viewer = makeViewer('report.pdf')
    ;(viewer as any).state = {
      loading: false,
      contents: null,
      media: null,
      browserViewable: true,
      tokens: {},
      error: null,
    }
    const html = renderViewer(viewer)
    expect(html).toContain('file-viewer-browser')
    expect(html.toLowerCase()).toContain('open in browser')
  })

  it('renders CSV files as a table', () => {
    const viewer = makeViewer('data.csv')
    setContents(viewer, {
      content: 'name,age\nAda,36',
      isBinary: false,
      tooLarge: false,
    })
    const html = renderViewer(viewer)
    expect(html).toContain('file-viewer-table')
    expect(html).toContain('delimited-table')
    expect(html).toContain('<th>name</th>')
    expect(html).toContain('<td>Ada</td>')
    // Not rendered as the code table.
    expect(html).not.toContain('file-viewer-code')
  })

  it('renders a blame gutter when blame is loaded and shown', () => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, {
      content: 'const x = 1\nconst y = 2',
      isBinary: false,
      tooLarge: false,
    })
    ;(viewer as any).state = {
      ...(viewer as any).state,
      showBlame: true,
      blame: [
        {
          sha: 'abcdef1234567890abcdef1234567890abcdef12',
          author: 'Ada Lovelace',
          authorMail: 'ada@example.com',
          authorTime: 1600000000,
          summary: 'first',
          previousSha: null,
          lineNumber: 1,
          content: 'const x = 1',
        },
        {
          sha: '1111111111111111111111111111111111111111',
          author: 'Bob',
          authorMail: 'bob@example.com',
          authorTime: 1610000000,
          summary: 'second',
          previousSha: null,
          lineNumber: 2,
          content: 'const y = 2',
        },
      ],
    }
    const html = renderViewer(viewer)
    expect(html).toContain('file-viewer-blame')
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Bob')
    // Short sha (first 8) is shown, not the full 40-char sha.
    expect(html).toContain('abcdef12')
  })

  it('suppresses the author on a line that repeats the commit above', () => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, {
      content: 'line one\nline two',
      isBinary: false,
      tooLarge: false,
    })
    const shared = {
      sha: '2222222222222222222222222222222222222222',
      author: 'Grace',
      authorMail: 'grace@example.com',
      authorTime: 1,
      summary: 's',
      previousSha: null,
    }
    ;(viewer as any).state = {
      ...(viewer as any).state,
      showBlame: true,
      blame: [
        { ...shared, lineNumber: 1, content: 'line one' },
        { ...shared, lineNumber: 2, content: 'line two' },
      ],
    }
    const html = renderViewer(viewer)
    // The repeated row is marked and the author only appears once.
    expect(html).toContain('is-repeat')
    expect(html.match(/Grace/g)).toHaveLength(1)
  })

  it('does not render the blame gutter when blame is hidden', () => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, {
      content: 'const x = 1',
      isBinary: false,
      tooLarge: false,
    })
    expect(renderViewer(viewer)).not.toContain('file-viewer-blame')
  })

  it('renders non-Markdown files as a highlighted code table', () => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, {
      content: 'const x = 1',
      isBinary: false,
      tooLarge: false,
    })
    const html = renderViewer(viewer)
    expect(html).toContain('file-viewer-code')
    // cm-s-default scopes the syntax theme so token colours apply.
    expect(html).toContain('cm-s-default')
  })

  it('renders a find bar with a match count when find is open', () => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, {
      content: 'foo bar\nbar foo foo',
      isBinary: false,
      tooLarge: false,
    })
    ;(viewer as any).state = {
      ...(viewer as any).state,
      findVisible: true,
      findQuery: 'foo',
      activeMatchIndex: 0,
    }
    const html = renderViewer(viewer)
    expect(html).toContain('file-viewer-find')
    // Three 'foo' occurrences; active is the first.
    expect(html).toContain('1 of 3')
  })

  it('shows no-results in the find bar when nothing matches', () => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, {
      content: 'hello world',
      isBinary: false,
      tooLarge: false,
    })
    ;(viewer as any).state = {
      ...(viewer as any).state,
      findVisible: true,
      findQuery: 'zzz',
      activeMatchIndex: 0,
    }
    const html = renderViewer(viewer)
    expect(html).toContain('file-viewer-find')
    expect(html).toContain('0 of 0')
  })

  it('does not render the find bar by default', () => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, {
      content: 'foo',
      isBinary: false,
      tooLarge: false,
    })
    expect(renderViewer(viewer)).not.toContain('file-viewer-find')
  })

  it('shows an error notice', () => {
    const viewer = makeViewer('gone.txt')
    ;(viewer as any).state = {
      loading: false,
      contents: null,
      media: null,
      tokens: {},
      error: new Error('ENOENT'),
    }
    expect(renderViewer(viewer).toLowerCase()).toContain('could not open')
  })

  it('renders an image file inline', () => {
    const viewer = makeViewer('logo.png')
    ;(viewer as any).state = {
      loading: false,
      contents: null,
      media: {
        kind: 'image',
        dataUrl: 'data:image/png;base64,AAAA',
        tooLarge: false,
      },
      tokens: {},
      error: null,
    }
    const html = renderViewer(viewer)
    expect(html).toContain('file-viewer-image')
    expect(html).toContain('data:image/png;base64,AAAA')
  })

  it('renders a video file with controls', () => {
    const viewer = makeViewer('clip.mp4')
    ;(viewer as any).state = {
      loading: false,
      contents: null,
      media: {
        kind: 'video',
        dataUrl: 'data:video/mp4;base64,AAAA',
        tooLarge: false,
      },
      tokens: {},
      error: null,
    }
    const html = renderViewer(viewer)
    expect(html).toContain('file-viewer-video')
    expect(html).toContain('controls')
  })

  it('shows a too-large notice for oversized media', () => {
    const viewer = makeViewer('huge.mp4')
    ;(viewer as any).state = {
      loading: false,
      contents: null,
      media: { kind: 'video', dataUrl: '', tooLarge: true },
      tokens: {},
      error: null,
    }
    expect(renderViewer(viewer).toLowerCase()).toContain('too large')
  })
})

describe('FileViewer load', () => {
  afterEach(() => jest.restoreAllMocks())

  it('reloads the open file when its on-disk mtime changed', async () => {
    jest.spyOn(readFile, 'statMtimeMs').mockResolvedValue(200)
    const readSpy = jest
      .spyOn(readFile, 'readFileForViewer')
      .mockResolvedValue({
        content: 'updated',
        isBinary: false,
        tooLarge: false,
      })
    jest.spyOn(worker, 'highlight').mockResolvedValue({})

    const viewer = makeViewer('a.ts')
    ;(viewer as any).loadedMtimeMs = 100
    await (viewer as any).reloadIfChanged('a.ts')

    expect(readSpy).toHaveBeenCalled()
    expect(viewer.state.contents?.content).toBe('updated')
  })

  it('does not reload when the mtime is unchanged', async () => {
    jest.spyOn(readFile, 'statMtimeMs').mockResolvedValue(100)
    const readSpy = jest.spyOn(readFile, 'readFileForViewer')

    const viewer = makeViewer('a.ts')
    ;(viewer as any).loadedMtimeMs = 100
    await (viewer as any).reloadIfChanged('a.ts')

    expect(readSpy).not.toHaveBeenCalled()
  })

  it('flags HTML/PDF for the browser without reading the file', async () => {
    const textSpy = jest.spyOn(readFile, 'readFileForViewer')
    const mediaSpy = jest.spyOn(readFile, 'readMediaForViewer')

    const viewer = makeViewer('index.html')
    await (viewer as any).load('index.html')

    expect(textSpy).not.toHaveBeenCalled()
    expect(mediaSpy).not.toHaveBeenCalled()
    expect(viewer.state.browserViewable).toBe(true)
  })

  it('reads media files as a data URL and skips highlighting', async () => {
    const mediaSpy = jest
      .spyOn(readFile, 'readMediaForViewer')
      .mockResolvedValue({
        kind: 'image',
        dataUrl: 'data:image/png;base64,AAAA',
        tooLarge: false,
      })
    const textSpy = jest.spyOn(readFile, 'readFileForViewer')
    const highlightSpy = jest.spyOn(worker, 'highlight')

    const viewer = makeViewer('logo.png')
    await (viewer as any).load('logo.png')

    expect(mediaSpy).toHaveBeenCalledTimes(1)
    expect(textSpy).not.toHaveBeenCalled()
    expect(highlightSpy).not.toHaveBeenCalled()
    expect(viewer.state.media?.kind).toBe('image')
    expect(viewer.state.contents).toBeNull()
  })

  it('reads and highlights a text file', async () => {
    jest.spyOn(readFile, 'readFileForViewer').mockResolvedValue({
      content: 'const x = 1\n',
      isBinary: false,
      tooLarge: false,
    })
    const highlightSpy = jest
      .spyOn(worker, 'highlight')
      .mockResolvedValue({ 0: {} })

    const viewer = makeViewer('a.ts')
    await (viewer as any).load('a.ts')

    expect(highlightSpy).toHaveBeenCalledTimes(1)
    expect(viewer.state.contents?.content).toBe('const x = 1\n')
    expect(viewer.state.error).toBeNull()
  })

  it('does not highlight binary files', async () => {
    jest.spyOn(readFile, 'readFileForViewer').mockResolvedValue({
      content: '',
      isBinary: true,
      tooLarge: false,
    })
    const highlightSpy = jest.spyOn(worker, 'highlight')

    const viewer = makeViewer('bin')
    await (viewer as any).load('bin')

    expect(highlightSpy).not.toHaveBeenCalled()
    expect(viewer.state.contents?.isBinary).toBe(true)
  })

  it('records an error when the read fails', async () => {
    jest
      .spyOn(readFile, 'readFileForViewer')
      .mockRejectedValue(new Error('ENOENT'))

    const viewer = makeViewer('gone.txt')
    await (viewer as any).load('gone.txt')

    expect(viewer.state.error).not.toBeNull()
    expect(viewer.state.contents).toBeNull()
  })

  it('ignores a stale result when a newer load has started', async () => {
    let resolveFirst: (v: FileViewerContents) => void = () => undefined
    const first = new Promise<FileViewerContents>(r => (resolveFirst = r))
    jest
      .spyOn(readFile, 'readFileForViewer')
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({
        content: 'newer',
        isBinary: false,
        tooLarge: false,
      })
    jest.spyOn(worker, 'highlight').mockResolvedValue({})

    const viewer = makeViewer('a.txt')
    const stale = (viewer as any).load('a.txt')
    const fresh = (viewer as any).load('b.txt')
    resolveFirst({ content: 'stale', isBinary: false, tooLarge: false })
    await Promise.all([stale, fresh])

    // The fresh load wins; the stale one is dropped by the token guard.
    expect(viewer.state.contents?.content).toBe('newer')
  })
})

/** Pull state the viewer needs for find / blame tests into a baseline. */
function openFind(viewer: FileViewer, patch: Record<string, unknown> = {}) {
  ;(viewer as any).state = {
    ...(viewer as any).state,
    findVisible: true,
    findQuery: 'foo',
    activeMatchIndex: 0,
    ...patch,
  }
}

describe('FileViewer find', () => {
  const content = 'foo one\nbar\nfoo two\nfoo three'

  it('clamps a stale active index instead of showing "4 of 3"', () => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, { content, isBinary: false, tooLarge: false })
    openFind(viewer, { activeMatchIndex: 9 })

    const html = renderViewer(viewer)

    expect(html).toContain('3 of 3')
    // The last match's row is the active one.
    expect(html.match(/is-find-active/g)).toHaveLength(1)
  })

  it('wraps around from a stale index when stepping', () => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, { content, isBinary: false, tooLarge: false })
    openFind(viewer, { activeMatchIndex: 9 })
    // stepMatch uses an updater function, which the default stub ignores.
    ;(viewer as any).setState = function (
      update: ((prev: unknown) => object) | object
    ) {
      const patch = typeof update === 'function' ? update(this.state) : update
      this.state = { ...this.state, ...patch }
    }
    ;(viewer as any).stepMatch(1)

    // Clamped to the last match (2), then +1 wraps to the first.
    expect(viewer.state.activeMatchIndex).toBe(0)
  })

  it('scrolls the active match into view when it moves', () => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, { content, isBinary: false, tooLarge: false })
    openFind(viewer)
    const scrollIntoView = jest.fn()
    ;(viewer as any).activeLineElement = { scrollIntoView }
    const prevState = { ...(viewer as any).state, activeMatchIndex: 0 }

    ;(viewer as any).state = { ...(viewer as any).state, activeMatchIndex: 1 }
    viewer.componentDidUpdate((viewer as any).props, prevState)

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
  })

  it('also scrolls when the query changes', () => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, { content, isBinary: false, tooLarge: false })
    openFind(viewer, { findQuery: 'two' })
    const scrollIntoView = jest.fn()
    ;(viewer as any).activeLineElement = { scrollIntoView }
    const prevState = { ...(viewer as any).state, findQuery: 'foo' }

    viewer.componentDidUpdate((viewer as any).props, prevState)

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('does not scroll when nothing about the match changed', () => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, { content, isBinary: false, tooLarge: false })
    openFind(viewer)
    const scrollIntoView = jest.fn()
    ;(viewer as any).activeLineElement = { scrollIntoView }

    viewer.componentDidUpdate((viewer as any).props, (viewer as any).state)

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('does not scroll while the find bar is closed', () => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, { content, isBinary: false, tooLarge: false })
    openFind(viewer, { findVisible: false })
    const scrollIntoView = jest.fn()
    ;(viewer as any).activeLineElement = { scrollIntoView }
    const prevState = { ...(viewer as any).state, activeMatchIndex: 3 }

    viewer.componentDidUpdate((viewer as any).props, prevState)

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('tolerates a DOM without scrollIntoView', () => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, { content, isBinary: false, tooLarge: false })
    openFind(viewer)
    ;(viewer as any).activeLineElement = {}
    const prevState = { ...(viewer as any).state, activeMatchIndex: 2 }

    expect(() =>
      viewer.componentDidUpdate((viewer as any).props, prevState)
    ).not.toThrow()
  })

  it('computes matches once per content and query, not once per call', () => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, { content, isBinary: false, tooLarge: false })
    openFind(viewer)

    const first = (viewer as any).findMatches
    const second = (viewer as any).findMatches

    expect(second).toBe(first)
  })

  it('starts from the first match when a different file is opened', () => {
    jest.spyOn(readFile, 'statMtimeMs').mockResolvedValue(1)
    jest.spyOn(readFile, 'readFileForViewer').mockResolvedValue({
      content: 'x',
      isBinary: false,
      tooLarge: false,
    })
    jest.spyOn(worker, 'highlight').mockResolvedValue({})
    const viewer = makeViewer('a.ts')
    openFind(viewer, { activeMatchIndex: 5 })

    viewer.componentDidUpdate(
      { ...(viewer as any).props, filePath: 'previous.ts' },
      (viewer as any).state
    )

    expect(viewer.state.activeMatchIndex).toBe(0)
    jest.restoreAllMocks()
  })
})

describe('FileViewer refresh on disk change', () => {
  afterEach(() => jest.restoreAllMocks())

  it('keeps showing the file while a changed file is re-read', async () => {
    jest.spyOn(readFile, 'statMtimeMs').mockResolvedValue(200)
    let release: (v: FileViewerContents) => void = () => undefined
    jest
      .spyOn(readFile, 'readFileForViewer')
      .mockReturnValue(new Promise<FileViewerContents>(r => (release = r)))
    jest.spyOn(worker, 'highlight').mockResolvedValue({})

    const viewer = makeViewer('a.ts')
    setContents(viewer, {
      content: 'old text',
      isBinary: false,
      tooLarge: false,
    })
    ;(viewer as any).loadedMtimeMs = 100

    const reload = (viewer as any).reloadIfChanged('a.ts')
    await new Promise(r => setImmediate(r))

    // Mid-reload: no "Loading…" swap, so scroll position and find survive.
    expect(viewer.state.loading).toBe(false)
    expect(renderViewer(viewer)).toContain('old text')

    release({ content: 'new text', isBinary: false, tooLarge: false })
    await reload
    expect(renderViewer(viewer)).toContain('new text')
  })

  it('still shows Loading… when switching to a different file', async () => {
    let release: (v: FileViewerContents) => void = () => undefined
    jest.spyOn(readFile, 'statMtimeMs').mockResolvedValue(1)
    jest
      .spyOn(readFile, 'readFileForViewer')
      .mockReturnValue(new Promise<FileViewerContents>(r => (release = r)))
    jest.spyOn(worker, 'highlight').mockResolvedValue({})

    const viewer = makeViewer('b.ts')
    const load = (viewer as any).load('b.ts')

    expect(viewer.state.loading).toBe(true)
    expect(renderViewer(viewer)).toContain('Loading')

    release({ content: 'b', isBinary: false, tooLarge: false })
    await load
  })

  it('keeps blame visible during a refresh but clears it for a new file', async () => {
    jest.spyOn(readFile, 'statMtimeMs').mockResolvedValue(1)
    jest.spyOn(readFile, 'readFileForViewer').mockResolvedValue({
      content: 'x',
      isBinary: false,
      tooLarge: false,
    })
    jest.spyOn(worker, 'highlight').mockResolvedValue({})
    const blame: any = { lines: [] }

    const viewer = makeViewer('a.ts')
    ;(viewer as any).state = { ...(viewer as any).state, blame }
    await (viewer as any).load('a.ts', true)
    expect(viewer.state.blame).toBe(blame)

    await (viewer as any).load('b.ts')
    expect(viewer.state.blame).toBeNull()
  })
})

describe('FileViewer errors', () => {
  afterEach(() => jest.restoreAllMocks())

  it('says why the file could not be opened and offers a retry', () => {
    const viewer = makeViewer('locked.txt')
    ;(viewer as any).state = {
      loading: false,
      contents: null,
      media: null,
      tokens: {},
      error: new Error('EACCES: permission denied'),
    }

    const html = renderViewer(viewer)

    expect(html).toContain('Could not open this file')
    expect(html).toContain('EACCES: permission denied')
    expect(html).toContain('Retry')
    expect(html).toContain('role="alert"')
  })

  it('retries by reloading the file', async () => {
    const readSpy = jest
      .spyOn(readFile, 'readFileForViewer')
      .mockResolvedValue({ content: 'ok', isBinary: false, tooLarge: false })
    jest.spyOn(readFile, 'statMtimeMs').mockResolvedValue(1)
    jest.spyOn(worker, 'highlight').mockResolvedValue({})
    const viewer = makeViewer('a.ts')
    ;(viewer as any).state = {
      ...(viewer as any).state,
      error: new Error('boom'),
    }
    ;(viewer as any).onRetry()
    await new Promise(r => setImmediate(r))

    expect(readSpy).toHaveBeenCalledTimes(1)
    expect(viewer.state.error).toBeNull()
    expect(viewer.state.contents?.content).toBe('ok')
  })

  it('does not retry when no file is selected', () => {
    const readSpy = jest.spyOn(readFile, 'readFileForViewer')
    const viewer = makeViewer(null)

    ;(viewer as any).onRetry()

    expect(readSpy).not.toHaveBeenCalled()
  })
})

describe('FileViewer blame status', () => {
  const withCode = (patch: Record<string, unknown>) => {
    const viewer = makeViewer('a.ts')
    setContents(viewer, {
      content: 'one\ntwo',
      isBinary: false,
      tooLarge: false,
    })
    ;(viewer as any).state = { ...(viewer as any).state, ...patch }
    return renderViewer(viewer)
  }

  it('says blame is loading instead of showing a blank gutter', () => {
    expect(withCode({ showBlame: true, blame: null })).toContain(
      'Loading blame'
    )
  })

  it('says when blame is unavailable', () => {
    const html = withCode({ showBlame: true, blame: null, blameError: true })
    expect(html).toContain('Blame unavailable')
    expect(html).not.toContain('Loading blame')
  })

  it('shows no status when blame is off', () => {
    const html = withCode({ showBlame: false })
    expect(html).not.toContain('Loading blame')
    expect(html).not.toContain('Blame unavailable')
  })

  it('records the failure when loading blame throws', async () => {
    jest.spyOn(blameLib, 'getBlame').mockRejectedValue(new Error('not tracked'))
    const viewer = makeViewer('a.ts')

    await (viewer as any).loadBlame('a.ts')

    expect(viewer.state.blameError).toBe(true)
    expect(viewer.state.blame).toBeNull()
    jest.restoreAllMocks()
  })

  it('clears a previous failure when blame loads', async () => {
    jest.spyOn(blameLib, 'getBlame').mockResolvedValue({ lines: [] } as any)
    const viewer = makeViewer('a.ts')
    ;(viewer as any).state = { ...(viewer as any).state, blameError: true }

    await (viewer as any).loadBlame('a.ts')

    expect(viewer.state.blameError).toBe(false)
    jest.restoreAllMocks()
  })

  it('ignores a blame result for a file that is no longer open', async () => {
    jest.spyOn(blameLib, 'getBlame').mockRejectedValue(new Error('late'))
    const viewer = makeViewer('current.ts')

    await (viewer as any).loadBlame('other.ts')

    expect(viewer.state.blameError).toBe(false)
    jest.restoreAllMocks()
  })
})

describe('FileViewer unmount', () => {
  afterEach(() => jest.restoreAllMocks())

  it('drops a load that finishes after the viewer is gone', async () => {
    let release: (v: FileViewerContents) => void = () => undefined
    jest.spyOn(readFile, 'statMtimeMs').mockResolvedValue(1)
    jest
      .spyOn(readFile, 'readFileForViewer')
      .mockReturnValue(new Promise<FileViewerContents>(r => (release = r)))
    jest.spyOn(worker, 'highlight').mockResolvedValue({})
    const viewer = makeViewer('a.ts')
    const setState = jest.spyOn(viewer as any, 'setState')

    const load = (viewer as any).load('a.ts')
    viewer.componentWillUnmount()
    setState.mockClear()
    release({ content: 'late', isBinary: false, tooLarge: false })
    await load

    expect(setState).not.toHaveBeenCalled()
    expect(viewer.state.contents).toBeNull()
  })

  it('drops a blame result that arrives after the viewer is gone', async () => {
    let release: (v: any) => void = () => undefined
    jest
      .spyOn(blameLib, 'getBlame')
      .mockReturnValue(new Promise(r => (release = r)))
    const viewer = makeViewer('a.ts')

    const pending = (viewer as any).loadBlame('a.ts')
    viewer.componentWillUnmount()
    release({ lines: [] })
    await pending

    expect(viewer.state.blame).toBeNull()
  })
})
