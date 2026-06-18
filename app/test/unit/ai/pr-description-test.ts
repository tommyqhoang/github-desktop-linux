import {
  buildPRDescriptionPrompt,
  parsePRDescription,
} from '../../../src/lib/ai/pr-description'

describe('buildPRDescriptionPrompt', () => {
  it('includes the commit summaries and the diff', () => {
    const prompt = buildPRDescriptionPrompt(
      ['Add login form', 'Fix validation'],
      'diff --git a/x b/x\n+hello'
    )
    expect(prompt).toContain('Add login form')
    expect(prompt).toContain('Fix validation')
    expect(prompt).toContain('+hello')
    // Asks for JSON title + body.
    expect(prompt.toLowerCase()).toContain('json')
    expect(prompt).toContain('title')
    expect(prompt).toContain('body')
  })

  it('truncates an oversized diff', () => {
    const prompt = buildPRDescriptionPrompt(['c'], 'x'.repeat(50000), 2000)
    expect(prompt.length).toBeLessThanOrEqual(2000)
    expect(prompt).toContain('[truncated]')
  })
})

describe('parsePRDescription', () => {
  it('parses a title and body', () => {
    const result = parsePRDescription(
      '{"title": "Add login", "body": "Adds a login form."}'
    )
    expect(result).toEqual({ title: 'Add login', body: 'Adds a login form.' })
  })

  it('tolerates a fenced code block', () => {
    const result = parsePRDescription(
      '```json\n{"title": "T", "body": "B"}\n```'
    )
    expect(result).toEqual({ title: 'T', body: 'B' })
  })

  it('defaults body to an empty string when missing', () => {
    expect(parsePRDescription('{"title": "Only title"}')).toEqual({
      title: 'Only title',
      body: '',
    })
  })

  it('throws on invalid JSON', () => {
    expect(() => parsePRDescription('not json')).toThrow()
  })

  it('throws when the title is empty', () => {
    expect(() => parsePRDescription('{"title": "  ", "body": "b"}')).toThrow()
  })
})
