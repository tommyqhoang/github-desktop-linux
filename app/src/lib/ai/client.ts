import { IAISettings } from './ai-settings'

/** A chat message sent to the model. */
export interface IAIMessage {
  readonly role: 'system' | 'user'
  readonly content: string
}

/** Per-request generation options. */
export interface IAICompleteOptions {
  readonly maxTokens?: number
  readonly temperature?: number
  /** Abort the request (e.g. the dialog that asked for it was closed). */
  readonly signal?: AbortSignal
  /**
   * Accept a response the model stopped because it hit `maxTokens`. Fine for
   * free-text output; JSON callers leave this off so a cut-off payload is
   * reported as such instead of as "invalid JSON".
   */
  readonly allowTruncated?: boolean
  /** Give up after this many ms. Defaults to {@link DEFAULT_TIMEOUT_MS}. */
  readonly timeoutMs?: number
}

/** A minimal chat-completion client shared by every AI feature. */
export interface IAIClient {
  complete(
    messages: ReadonlyArray<IAIMessage>,
    options?: IAICompleteOptions
  ): Promise<string>
}

/** Settings plus an injectable fetch implementation (for tests). */
export type IAIClientOptions = IAISettings & { readonly fetcher?: typeof fetch }

const DEFAULT_MAX_TOKENS = 512
const DEFAULT_TEMPERATURE = 0.2

/**
 * Without a ceiling, a provider that accepts the connection but never answers
 * leaves the dialog on "Loading" forever.
 */
export const DEFAULT_TIMEOUT_MS = 60_000

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function getProviderErrorMessage(json: any): string | null {
  const message = json?.error?.message || json?.message
  return typeof message === 'string' && message.trim().length > 0
    ? message.trim()
    : null
}

/**
 * Build an OpenAI-compatible (OpenRouter) chat-completion client from the
 * shared AI settings. Auth, base-URL normalization, and error mapping live
 * here so every AI feature shares one implementation.
 */
export function createAIClient(options: IAIClientOptions): IAIClient {
  const fetcher = options.fetcher || fetch

  return {
    async complete(
      messages: ReadonlyArray<IAIMessage>,
      completeOptions?: IAICompleteOptions
    ): Promise<string> {
      // Nothing to do (and no request or timer to start) for a caller that
      // has already given up.
      if (completeOptions?.signal?.aborted) {
        throw new DOMException('The request was aborted.', 'AbortError')
      }

      const timeoutMs = completeOptions?.timeoutMs ?? DEFAULT_TIMEOUT_MS
      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)

      const callerSignal = completeOptions?.signal
      const onCallerAbort = () => controller.abort()
      callerSignal?.addEventListener('abort', onCallerAbort, { once: true })

      try {
        const response = await fetcher(
          `${normalizeBaseUrl(options.baseUrl)}/chat/completions`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: options.model,
              temperature: completeOptions?.temperature ?? DEFAULT_TEMPERATURE,
              max_tokens: completeOptions?.maxTokens ?? DEFAULT_MAX_TOKENS,
              messages,
            }),
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          let providerMessage: string | null = null
          try {
            providerMessage = getProviderErrorMessage(await response.json())
          } catch (e) {
            providerMessage = null
          }
          const statusMessage = `AI request failed with ${response.status}.`
          throw new Error(
            providerMessage === null
              ? statusMessage
              : `${statusMessage} ${providerMessage}`
          )
        }

        const json = await response.json()
        const choice = json?.choices?.[0]
        const content = choice?.message?.content
        if (typeof content !== 'string' || content.length === 0) {
          throw new Error('The AI provider returned no content.')
        }
        if (
          choice?.finish_reason === 'length' &&
          completeOptions?.allowTruncated !== true
        ) {
          throw new Error(
            'The AI response was cut off before it finished. Try again.'
          )
        }
        return content
      } catch (e) {
        if (timedOut) {
          throw new Error(
            `The AI provider did not respond within ${Math.round(
              timeoutMs / 1000
            )} seconds.`
          )
        }
        throw e
      } finally {
        clearTimeout(timer)
        callerSignal?.removeEventListener('abort', onCallerAbort)
      }
    },
  }
}

/**
 * Clamp text to `maxLength`, appending a visible truncation notice when cut.
 * Used by prompt builders to keep large diffs within the model's context.
 */
export function truncateForPrompt(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  const notice = '\n\n[truncated]'
  return `${text.substring(0, Math.max(0, maxLength - notice.length))}${notice}`
}
