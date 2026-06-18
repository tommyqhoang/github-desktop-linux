# AI-Native Workflow — Design

Date: 2026-06-17
Status: Approved (Approach A)

## Goal

Make this fork the first choice for "vibe coders" on Linux by turning the AI
assistant into a first-class part of the git loop. Builds on the existing
AI-commit-message feature by adding four one-shot AI actions that reuse the same
OpenRouter provider + Preferences settings:

1. **AI PR descriptions** — generate a PR title + body from the branch's commits and diff.
2. **AI commit/diff summaries** — "Explain this commit" / "Summarize these changes" in plain language.
3. **AI pre-commit review** — "Review my changes" surfaces likely bugs / risky changes / nits before committing.
4. **AI conflict assist** — explain each merge conflict and suggest a resolution.

Interaction model: **one-shot + Regenerate** (matches the existing commit-message UX).

## Architecture (Approach A: shared core + thin features)

### 1. Shared AI client — `app/src/lib/ai/client.ts`

Extract the OpenRouter request/error logic currently inside `commit-message.ts`
into a generic, injectable client:

```ts
export interface IAIClient {
  complete(
    messages: ReadonlyArray<{ role: 'system' | 'user'; content: string }>,
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<string>
}
export function createAIClient(settings: IAISettings): IAIClient
export function truncateForPrompt(text: string, maxLength: number): string
```

- Reuses base-URL normalization, `Authorization: Bearer`, OpenRouter error
  extraction, and an injectable `fetcher` (for tests).
- `commit-message.ts` is refactored to call this client (its public functions
  and tests stay green).

### 2. Settings — `app/src/lib/ai/ai-settings.ts`

The existing `commit-message-settings.ts` already stores the provider config
(api key, model, base URL). Generalize the *type* to `IAISettings` (alias kept
for back-compat) and add `getAISettings()` / `hasUsableAISettings()` that the
new features gate on. No new Preferences UI — one provider config powers
everything. The per-repo enable flag remains commit-message-specific; the four
new actions only require usable settings (key + model + base URL).

### 3. AI actions (pure prompt builder + response parser per feature)

Each is a pure, network-free unit (fully TDD'd), plus a thin
`generate*` orchestrator that gathers git data and calls the client.

- `pr-description.ts`: `buildPRDescriptionPrompt(commits, diffText)`,
  `parsePRDescription(content) → { title, body }`.
- `summarize-changes.ts`: `buildSummaryPrompt(diffText, kind)`, returns plain text.
- `review-changes.ts`: `buildReviewPrompt(diffText)`,
  `parseReviewFindings(content) → ReadonlyArray<IReviewFinding>`
  (`{ severity: 'high'|'medium'|'low', title, detail, file? }`).
- `conflict-assist.ts`: `parseConflictHunks(fileText) → ReadonlyArray<IConflictHunk>`
  (`{ ours, theirs, base?, startLine }` from `<<<<<<<` / `|||||||` / `=======` /
  `>>>>>>>` markers), `buildConflictPrompt(hunk)`,
  `parseConflictSuggestion(content) → { explanation, resolution }`.

Each builder truncates oversized diffs via `truncateForPrompt`.

### 4. Result UX — `app/src/ui/ai/`

A reusable one-shot result surface used by all four:

- `ai-result-dialog.tsx` — states: loading / error / result. Actions:
  **Insert** (feature-specific callback), **Copy**, **Regenerate**, Close.
- Specialized renderers for structured results: a findings list (review),
  title+body fields (PR description), plain text (summary), explanation +
  resolution block (conflict). The dialog accepts a `render(result)` prop so
  each feature controls its result body while sharing the chrome/actions.

### 5. Entry points & wiring

- **PR description:** "Generate with AI" button in the open-PR dialog →
  fills title/body.
- **Summaries:** "Explain" action on the selected commit in History and on the
  Changes view.
- **Review:** "Review my changes" button near the commit area + command-palette command.
- **Conflict assist:** per-conflicted-file "Explain & suggest" button in the
  merge-conflicts dialog.
- **Command palette:** register the global actions (Review changes, Summarize
  changes) so they're reachable via Ctrl/Cmd+K.
- Dispatcher methods: `generateAIPRDescription`, `summarizeAIChanges`,
  `reviewAIChanges`, `assistAIConflict`.

## Testing

- Client: `complete()` happy-path + error mapping with an injected fetcher.
- Each prompt builder + parser: TDD with representative inputs, malformed
  responses, truncation, and edge cases (empty diff, no commits, conflict with a
  base section).
- `parseConflictHunks`: multiple hunks, diff3 (base) markers, nested-safe.
- Result dialog + structured renderers: static-markup render tests
  (loading/error/result, findings list, etc.), mirroring existing UI tests.

## Out of scope (YAGNI)

- Conversational/chat refinement (one-shot chosen; can add later).
- New provider types beyond the existing OpenRouter/OpenAI-compatible config.
- Auto-applying conflict resolutions to disk (assist suggests; user copies/edits).
  A follow-up can add one-click apply once the suggestion UX proves out.

## Sequencing

1. Shared client + settings generalization (refactor commit-message onto it).
2. Reusable result dialog.
3. Features in value order: PR descriptions → summaries → review → conflict assist.

Each feature is independently shippable on top of the shared core.
