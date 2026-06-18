import {
  buildSummaryPrompt,
  parseSummary,
} from '../../../src/lib/ai/summarize-changes'

describe('buildSummaryPrompt', () => {
  it('includes the diff and asks for a plain-language summary', () => {
    const prompt = buildSummaryPrompt('diff --git a/x b/x\n+hi', 'changes')
    expect(prompt).toContain('+hi')
    expect(prompt.toLowerCase()).toContain('summar')
  })

  it('frames a commit summary differently from working changes', () => {
    const commit = buildSummaryPrompt('d', 'commit')
    const changes = buildSummaryPrompt('d', 'changes')
    expect(commit).toContain('commit')
    expect(changes).toContain('changes')
  })

  it('truncates an oversized diff', () => {
    const prompt = buildSummaryPrompt('x'.repeat(40000), 'changes', 1500)
    expect(prompt.length).toBeLessThanOrEqual(1500)
    expect(prompt).toContain('[truncated]')
  })
})

describe('parseSummary', () => {
  it('trims surrounding whitespace', () => {
    expect(parseSummary('  This adds a thing.\n')).toBe('This adds a thing.')
  })

  it('strips a leading code fence if present', () => {
    expect(parseSummary('```\nA summary\n```')).toBe('A summary')
  })

  it('throws on empty content', () => {
    expect(() => parseSummary('   ')).toThrow()
  })
})
