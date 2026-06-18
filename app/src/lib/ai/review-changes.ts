import { truncateForPrompt } from './client'

export type ReviewSeverity = 'high' | 'medium' | 'low'

/** A single issue surfaced by the AI pre-commit review. */
export interface IReviewFinding {
  readonly severity: ReviewSeverity
  readonly title: string
  readonly detail: string
  /** Optional file the finding refers to. */
  readonly file?: string
}

const DefaultMaxPromptLength = 12000

const PromptPrefix =
  'Review the following code changes before they are committed.\n' +
  'Identify likely bugs, risky changes, and notable nits — be concise and\n' +
  'specific, and do not invent issues. Return only a JSON array of findings,\n' +
  'each with "severity" ("high" | "medium" | "low"), "title", "detail", and an\n' +
  'optional "file". Return an empty array if the changes look fine.\n\n'

/** Build the pre-commit review prompt from the working-directory diff. */
export function buildReviewPrompt(
  diffText: string,
  maxLength: number = DefaultMaxPromptLength
): string {
  const prompt = `${PromptPrefix}Diff:\n${diffText}`.trimEnd()
  return truncateForPrompt(prompt, maxLength)
}

function stripCodeFence(content: string): string {
  const trimmed = content.trim()
  return trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed
}

function normalizeSeverity(value: unknown): ReviewSeverity {
  return value === 'high' || value === 'medium' || value === 'low'
    ? value
    : 'low'
}

/**
 * Parse the model's response into review findings. Accepts either a bare JSON
 * array or a `{ "findings": [...] }` wrapper, tolerates code fences, normalizes
 * unknown severities to "low", and drops entries without a title.
 */
export function parseReviewFindings(
  content: string
): ReadonlyArray<IReviewFinding> {
  let parsed: any
  try {
    parsed = JSON.parse(stripCodeFence(content))
  } catch (e) {
    throw new Error('The AI provider returned an invalid review.')
  }

  const list: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.findings)
    ? parsed.findings
    : []

  const findings = new Array<IReviewFinding>()
  for (const entry of list) {
    const title = typeof entry?.title === 'string' ? entry.title.trim() : ''
    if (title.length === 0) {
      continue
    }
    const finding: IReviewFinding = {
      severity: normalizeSeverity(entry?.severity),
      title,
      detail: typeof entry?.detail === 'string' ? entry.detail.trim() : '',
      ...(typeof entry?.file === 'string' && entry.file.trim().length > 0
        ? { file: entry.file.trim() }
        : {}),
    }
    findings.push(finding)
  }

  return findings
}
