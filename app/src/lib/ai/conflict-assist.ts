import { truncateForPrompt } from './client'

/** One conflicted region extracted from a file's conflict markers. */
export interface IConflictHunk {
  /** Our side (between `<<<<<<<` and the base/`=======` marker). */
  readonly ours: string
  /** Their side (between `=======` and `>>>>>>>`). */
  readonly theirs: string
  /** The common ancestor section, present only in diff3-style conflicts. */
  readonly base?: string
  /** 1-based line number of the opening `<<<<<<<` marker. */
  readonly startLine: number
}

/** A model suggestion for resolving a conflict. */
export interface IConflictSuggestion {
  readonly explanation: string
  readonly resolution: string
}

const DefaultMaxPromptLength = 8000

/**
 * Extract conflict hunks from a file's contents by walking its conflict
 * markers. Handles both two-sided (`<<<<<<<` / `=======` / `>>>>>>>`) and
 * diff3 (`|||||||` base section) conflicts. Returns an empty array when the
 * file has no conflict markers.
 */
export function parseConflictHunks(
  fileText: string
): ReadonlyArray<IConflictHunk> {
  const lines = fileText.split('\n')
  const hunks = new Array<IConflictHunk>()

  let startLine = 0
  let section: 'ours' | 'base' | 'theirs' | null = null
  let ours: string[] = []
  let base: string[] = []
  let theirs: string[] = []
  let sawBase = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('<<<<<<<')) {
      startLine = i + 1
      section = 'ours'
      ours = []
      base = []
      theirs = []
      sawBase = false
    } else if (line.startsWith('|||||||') && section !== null) {
      section = 'base'
      sawBase = true
    } else if (line.startsWith('=======') && section !== null) {
      section = 'theirs'
    } else if (line.startsWith('>>>>>>>') && section !== null) {
      hunks.push({
        ours: ours.join('\n'),
        theirs: theirs.join('\n'),
        ...(sawBase ? { base: base.join('\n') } : {}),
        startLine,
      })
      section = null
    } else if (section === 'ours') {
      ours.push(line)
    } else if (section === 'base') {
      base.push(line)
    } else if (section === 'theirs') {
      theirs.push(line)
    }
  }

  return hunks
}

/** Build the prompt asking the model to explain and resolve one conflict. */
export function buildConflictPrompt(
  hunk: IConflictHunk,
  maxLength: number = DefaultMaxPromptLength
): string {
  const baseSection =
    hunk.base !== undefined ? `Common ancestor (base):\n${hunk.base}\n\n` : ''

  const prompt =
    'A Git merge conflict is shown below. Explain in plain language why the\n' +
    'two sides conflict, then propose a single merged resolution that preserves\n' +
    'both intents where possible. Return only JSON with an "explanation"\n' +
    'string and a "resolution" string (the merged code, no conflict markers).\n\n' +
    `Our side:\n${hunk.ours}\n\n` +
    baseSection +
    `Their side:\n${hunk.theirs}`

  return truncateForPrompt(prompt, maxLength)
}

function stripCodeFence(content: string): string {
  const trimmed = content.trim()
  return trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed
}

/** Parse the model's JSON suggestion into an explanation + resolution. */
export function parseConflictSuggestion(content: string): IConflictSuggestion {
  let parsed: any
  try {
    parsed = JSON.parse(stripCodeFence(content))
  } catch (e) {
    throw new Error('The AI provider returned an invalid conflict suggestion.')
  }

  if (
    typeof parsed.resolution !== 'string' ||
    parsed.resolution.trim().length === 0
  ) {
    throw new Error('The AI provider did not return a resolution.')
  }

  const explanation =
    typeof parsed.explanation === 'string' ? parsed.explanation.trim() : ''

  return { explanation, resolution: parsed.resolution.trim() }
}
