import {
  buildConflictPrompt,
  parseConflictHunks,
  parseConflictSuggestion,
} from '../../../src/lib/ai/conflict-assist'

describe('parseConflictHunks', () => {
  it('parses a simple two-sided conflict', () => {
    const text = [
      'line before',
      '<<<<<<< HEAD',
      'our change',
      '=======',
      'their change',
      '>>>>>>> branch',
      'line after',
    ].join('\n')

    const hunks = parseConflictHunks(text)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].ours).toBe('our change')
    expect(hunks[0].theirs).toBe('their change')
    expect(hunks[0].base).toBeUndefined()
    // 1-based line of the <<<<<<< marker.
    expect(hunks[0].startLine).toBe(2)
  })

  it('captures the base section in a diff3 conflict', () => {
    const text = [
      '<<<<<<< HEAD',
      'ours',
      '||||||| base',
      'original',
      '=======',
      'theirs',
      '>>>>>>> other',
    ].join('\n')

    const hunks = parseConflictHunks(text)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].ours).toBe('ours')
    expect(hunks[0].base).toBe('original')
    expect(hunks[0].theirs).toBe('theirs')
  })

  it('parses multiple conflicts and preserves multi-line content', () => {
    const text = [
      '<<<<<<< HEAD',
      'a1',
      'a2',
      '=======',
      'b1',
      '>>>>>>> x',
      'middle',
      '<<<<<<< HEAD',
      'c',
      '=======',
      'd',
      '>>>>>>> y',
    ].join('\n')

    const hunks = parseConflictHunks(text)
    expect(hunks).toHaveLength(2)
    expect(hunks[0].ours).toBe('a1\na2')
    expect(hunks[1].ours).toBe('c')
    expect(hunks[1].theirs).toBe('d')
  })

  it('returns an empty array when there are no conflict markers', () => {
    expect(parseConflictHunks('just\nnormal\ntext')).toEqual([])
  })
})

describe('buildConflictPrompt', () => {
  it('includes both sides and asks for JSON explanation + resolution', () => {
    const prompt = buildConflictPrompt({
      ours: 'our code',
      theirs: 'their code',
      startLine: 1,
    })
    expect(prompt).toContain('our code')
    expect(prompt).toContain('their code')
    expect(prompt.toLowerCase()).toContain('json')
    expect(prompt).toContain('explanation')
    expect(prompt).toContain('resolution')
  })

  it('includes the base section when present', () => {
    const prompt = buildConflictPrompt({
      ours: 'o',
      theirs: 't',
      base: 'original base',
      startLine: 1,
    })
    expect(prompt).toContain('original base')
  })
})

describe('parseConflictSuggestion', () => {
  it('parses an explanation and a resolution', () => {
    const result = parseConflictSuggestion(
      '{"explanation": "Both renamed it", "resolution": "final code"}'
    )
    expect(result).toEqual({
      explanation: 'Both renamed it',
      resolution: 'final code',
    })
  })

  it('tolerates a fenced code block', () => {
    const result = parseConflictSuggestion(
      '```json\n{"explanation":"e","resolution":"r"}\n```'
    )
    expect(result).toEqual({ explanation: 'e', resolution: 'r' })
  })

  it('throws when the resolution is missing', () => {
    expect(() =>
      parseConflictSuggestion('{"explanation": "only explanation"}')
    ).toThrow()
  })
})
