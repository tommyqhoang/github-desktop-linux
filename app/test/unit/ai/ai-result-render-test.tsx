import { renderToStaticMarkup } from 'react-dom/server'
import {
  aiResultCopyText,
  renderAIResult,
  AIResult,
} from '../../../src/ui/ai/ai-result-render'

const render = (result: AIResult) =>
  renderToStaticMarkup(renderAIResult(result))

describe('renderAIResult', () => {
  it('renders a PR description as title + body', () => {
    const html = render({
      kind: 'pr-description',
      value: { title: 'Add login', body: 'Adds a form.' },
    })
    expect(html).toContain('Add login')
    expect(html).toContain('Adds a form.')
  })

  it('renders a summary as text', () => {
    const html = render({ kind: 'summary', value: 'It does a thing.' })
    expect(html).toContain('It does a thing.')
  })

  it('renders review findings with severity and title', () => {
    const html = render({
      kind: 'review',
      value: [
        { severity: 'high', title: 'Null deref', detail: 'x may be null' },
      ],
    })
    expect(html).toContain('Null deref')
    expect(html).toContain('x may be null')
    expect(html.toLowerCase()).toContain('high')
  })

  it('renders a clean-review empty state', () => {
    const html = render({ kind: 'review', value: [] })
    expect(html.toLowerCase()).toContain('no issues')
  })

  it('renders a conflict suggestion with explanation and resolution', () => {
    const html = render({
      kind: 'conflict',
      value: { explanation: 'Both edited', resolution: 'merged code' },
    })
    expect(html).toContain('Both edited')
    expect(html).toContain('merged code')
  })
})

describe('aiResultCopyText', () => {
  it('joins a PR title and body', () => {
    expect(
      aiResultCopyText({
        kind: 'pr-description',
        value: { title: 'T', body: 'B' },
      })
    ).toBe('T\n\nB')
  })

  it('copies the raw summary text', () => {
    expect(aiResultCopyText({ kind: 'summary', value: 'hello' })).toBe('hello')
  })

  it('copies only the resolution for a conflict', () => {
    expect(
      aiResultCopyText({
        kind: 'conflict',
        value: { explanation: 'e', resolution: 'the code' },
      })
    ).toBe('the code')
  })

  it('formats review findings as text', () => {
    const text = aiResultCopyText({
      kind: 'review',
      value: [{ severity: 'low', title: 'Nit', detail: 'rename' }],
    })
    expect(text).toContain('Nit')
    expect(text).toContain('rename')
  })
})
