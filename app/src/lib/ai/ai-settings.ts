import {
  getAICommitMessageSettings,
  IAICommitMessageSettings,
} from './commit-message-settings'

/**
 * Provider configuration shared by every AI feature. Structurally identical to
 * the original commit-message settings — one provider config powers them all.
 */
export type IAISettings = IAICommitMessageSettings

/** Read the shared AI provider settings (api key, model, base URL). */
export const getAISettings = getAICommitMessageSettings

/**
 * Whether the settings are complete enough to make a request. Unlike the
 * commit-message variant this is repository-agnostic: the four new AI actions
 * only need a usable provider, not a per-repo opt-in.
 */
export function hasUsableAISettings(settings: IAISettings): boolean {
  return (
    settings.apiKey.trim().length > 0 &&
    settings.model.trim().length > 0 &&
    settings.baseUrl.trim().length > 0
  )
}
