import { truncateForPrompt } from './client'

/** A generated pull request title and body. */
export interface IAIPRDescription {
  readonly title: string
  readonly body: string
}

const DefaultMaxPromptLength = 12000

const PromptPrefix =
  'Write a clear pull request title and description for the changes below.\n' +
  'Return only JSON with "title" and "body" string fields.\n' +
  'The title is a concise imperative summary under 72 characters.\n' +
  'The body uses short Markdown describing what changed and why.\n\n'

/**
 * Build the PR-description prompt from the branch's commit summaries and its
 * combined diff. The diff is truncated to keep the prompt within the model's
 * context budget.
 */
export function buildPRDescriptionPrompt(
  commitSummaries: ReadonlyArray<string>,
  diffText: string,
  maxLength: number = DefaultMaxPromptLength
): string {
  const commits =
    commitSummaries.length > 0
      ? commitSummaries.map(s => `- ${s}`).join('\n')
      : '(no commit summaries)'

  const prompt =
    `${PromptPrefix}Commits:\n${commits}\n\nDiff:\n${diffText}`.trimEnd()

  return truncateForPrompt(prompt, maxLength)
}

function stripCodeFence(content: string): string {
  const trimmed = content.trim()
  return trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed
}

/** Parse the model's JSON response into a title + body. */
export function parsePRDescription(content: string): IAIPRDescription {
  let parsed: any
  try {
    parsed = JSON.parse(stripCodeFence(content))
  } catch (e) {
    throw new Error('The AI provider returned an invalid PR description.')
  }

  if (typeof parsed.title !== 'string' || parsed.title.trim().length === 0) {
    throw new Error('The AI provider did not return a PR title.')
  }

  const body =
    typeof parsed.body === 'string' && parsed.body.trim().length > 0
      ? parsed.body.trim()
      : ''

  return { title: parsed.title.trim(), body }
}
