import * as Path from 'path'
import { readFile } from 'fs-extra'
import { Repository } from '../../models/repository'
import { IAIClient, createAIClient } from './client'
import { getAISettings, hasUsableAISettings } from './ai-settings'
import {
  getBranchCommitSummaries,
  getBranchDiffText,
  getCommitDiffText,
  getWorkingDiffText,
} from './git-context'
import {
  buildPRDescriptionPrompt,
  IAIPRDescription,
  parsePRDescription,
} from './pr-description'
import {
  buildSummaryPrompt,
  parseSummary,
  SummaryKind,
} from './summarize-changes'
import {
  buildReviewPrompt,
  IReviewFinding,
  parseReviewFindings,
} from './review-changes'
import {
  buildConflictPrompt,
  IConflictSuggestion,
  parseConflictHunks,
  parseConflictSuggestion,
} from './conflict-assist'

const SystemPromptJSON =
  'You are a precise senior engineer. Follow the instructions and return only the requested JSON.'
const SystemPromptText =
  'You are a precise senior engineer. Follow the instructions exactly.'

/** Resolve a usable client, or throw a user-facing error. */
async function resolveClient(injected?: IAIClient): Promise<IAIClient> {
  if (injected !== undefined) {
    return injected
  }
  const settings = await getAISettings()
  if (!hasUsableAISettings(settings)) {
    throw new Error('Configure the AI provider in Preferences first.')
  }
  return createAIClient(settings)
}

/** Generate a pull request title + body from the branch's commits and diff. */
export async function runPRDescription(
  repository: Repository,
  baseRef: string,
  client?: IAIClient
): Promise<IAIPRDescription> {
  const ai = await resolveClient(client)
  const [summaries, diff] = await Promise.all([
    getBranchCommitSummaries(repository, baseRef),
    getBranchDiffText(repository, baseRef),
  ])
  const prompt = buildPRDescriptionPrompt(summaries, diff)
  const content = await ai.complete(
    [
      { role: 'system', content: SystemPromptJSON },
      { role: 'user', content: prompt },
    ],
    { maxTokens: 700 }
  )
  return parsePRDescription(content)
}

/** Summarize the uncommitted working changes, or a specific commit. */
export async function runSummary(
  repository: Repository,
  source: { kind: SummaryKind; sha?: string },
  client?: IAIClient
): Promise<string> {
  const ai = await resolveClient(client)
  const diff =
    source.kind === 'commit' && source.sha !== undefined
      ? await getCommitDiffText(repository, source.sha)
      : await getWorkingDiffText(repository)
  if (diff.trim().length === 0) {
    throw new Error('There are no changes to summarize.')
  }
  const prompt = buildSummaryPrompt(diff, source.kind)
  const content = await ai.complete(
    [
      { role: 'system', content: SystemPromptText },
      { role: 'user', content: prompt },
    ],
    { maxTokens: 500 }
  )
  return parseSummary(content)
}

/** Review the uncommitted working changes for likely issues. */
export async function runReview(
  repository: Repository,
  client?: IAIClient
): Promise<ReadonlyArray<IReviewFinding>> {
  const ai = await resolveClient(client)
  const diff = await getWorkingDiffText(repository)
  if (diff.trim().length === 0) {
    throw new Error('There are no changes to review.')
  }
  const prompt = buildReviewPrompt(diff)
  const content = await ai.complete(
    [
      { role: 'system', content: SystemPromptJSON },
      { role: 'user', content: prompt },
    ],
    { maxTokens: 800 }
  )
  return parseReviewFindings(content)
}

/** Explain and suggest a resolution for the first conflict in a file. */
export async function runConflictAssist(
  repository: Repository,
  filePath: string,
  client?: IAIClient
): Promise<IConflictSuggestion> {
  const ai = await resolveClient(client)
  const fileText = await readFile(Path.join(repository.path, filePath), 'utf8')
  const hunks = parseConflictHunks(fileText)
  if (hunks.length === 0) {
    throw new Error('No conflict markers found in this file.')
  }
  const prompt = buildConflictPrompt(hunks[0])
  const content = await ai.complete(
    [
      { role: 'system', content: SystemPromptJSON },
      { role: 'user', content: prompt },
    ],
    { maxTokens: 700 }
  )
  return parseConflictSuggestion(content)
}
