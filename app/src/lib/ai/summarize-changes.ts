import { truncateForPrompt } from './client'

/** What is being summarized — uncommitted work or an existing commit. */
export type SummaryKind = 'changes' | 'commit'

const DefaultMaxPromptLength = 12000

function prefixFor(kind: SummaryKind): string {
  const subject = kind === 'commit' ? 'commit' : 'set of working changes'
  return (
    `Summarize the following ${subject} in plain language for a teammate.\n` +
    'Lead with a one-sentence overview, then a few short bullets of the most\n' +
    'important changes. Be concise and specific. Return plain text only.\n\n'
  )
}

/**
 * Build a plain-language summary prompt for a diff. `kind` tailors the framing
 * (an existing commit vs. uncommitted working changes).
 */
export function buildSummaryPrompt(
  diffText: string,
  kind: SummaryKind,
  maxLength: number = DefaultMaxPromptLength
): string {
  const prompt = `${prefixFor(kind)}Diff:\n${diffText}`.trimEnd()
  return truncateForPrompt(prompt, maxLength)
}

/** Normalize the model's free-text summary. */
export function parseSummary(content: string): string {
  let text = content.trim()
  if (text.startsWith('```')) {
    text = text
      .replace(/^```(?:\w+)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
  }
  if (text.length === 0) {
    throw new Error('The AI provider returned an empty summary.')
  }
  return text
}
