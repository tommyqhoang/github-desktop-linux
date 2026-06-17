import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FileViewer } from '../../../src/ui/file-tree/file-viewer'
import { Repository } from '../../../src/models/repository'
import { FileViewerContents } from '../../../src/models/file-tree'
import * as readFile from '../../../src/lib/file-tree/read-file'
import * as worker from '../../../src/lib/highlighter/worker'

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
