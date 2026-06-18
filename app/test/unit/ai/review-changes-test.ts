import {
  buildReviewPrompt,
  parseReviewFindings,
} from '../../../src/lib/ai/review-changes'

describe('buildReviewPrompt', () => {
  it('includes the diff and asks for JSON findings with severity', () => {
    const prompt = buildReviewPrompt('diff --git a/x b/x\n+bug')
    expect(prompt).toContain('+bug')
    expect(prompt.toLowerCase()).toContain('json')
    expect(prompt.toLowerCase()).toContain('severity')
  })

  it('truncates an oversized diff', () => {
    const prompt = buildReviewPrompt('x'.repeat(40000), 1500)
    expect(prompt.length).toBeLessThanOrEqual(1500)
    expect(prompt).toContain('[truncated]')
  })
})

describe('parseReviewFindings', () => {
  it('parses an array of findings', () => {
    const findings = parseReviewFindings(
      JSON.stringify([
        {
          severity: 'high',
          title: 'Null deref',
          detail: 'x may be null',
          file: 'a.ts',
        },
        { severity: 'low', title: 'Nit', detail: 'rename var' },
      ])
    )
    expect(findings).toHaveLength(2)
    expect(findings[0]).toEqual({
      severity: 'high',
      title: 'Null deref',
      detail: 'x may be null',
      file: 'a.ts',
    })
    expect(findings[1].file).toBeUndefined()
  })

  it('returns an empty array when no issues are found', () => {
    expect(parseReviewFindings('[]')).toEqual([])
  })

  it('tolerates a fenced code block and a findings wrapper object', () => {
    const findings = parseReviewFindings(
      '```json\n{"findings": [{"severity":"medium","title":"T","detail":"D"}]}\n```'
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('medium')
  })

  it('normalizes an unknown severity to low', () => {
    const findings = parseReviewFindings(
      '[{"severity":"catastrophic","title":"T","detail":"D"}]'
    )
    expect(findings[0].severity).toBe('low')
  })

  it('skips entries with no title', () => {
    const findings = parseReviewFindings(
      '[{"severity":"high","detail":"no title"},{"title":"ok","detail":"d"}]'
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].title).toBe('ok')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseReviewFindings('not json')).toThrow()
  })
})
