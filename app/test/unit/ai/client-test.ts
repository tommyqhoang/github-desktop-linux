import { createAIClient, truncateForPrompt } from '../../../src/lib/ai/client'
import { IAISettings } from '../../../src/lib/ai/ai-settings'

const settings: IAISettings = {
  enabled: true,
  apiKey: 'test-key',
  model: 'test-model',
  baseUrl: 'https://example.test/api/v1',
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('createAIClient', () => {
  it('posts to the chat completions endpoint with auth and model', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    const fetcher = (async (url: string, init?: RequestInit) => {
      capturedUrl = url
      capturedInit = init
      return jsonResponse({ choices: [{ message: { content: 'hello' } }] })
    }) as unknown as typeof fetch

    const client = createAIClient({ ...settings, fetcher })
    const result = await client.complete([{ role: 'user', content: 'hi' }])

    expect(result).toBe('hello')
    expect(capturedUrl).toBe('https://example.test/api/v1/chat/completions')
    const headers = capturedInit!.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-key')
    const sent = JSON.parse(capturedInit!.body as string)
    expect(sent.model).toBe('test-model')
    expect(sent.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('strips trailing slashes from the base url', async () => {
    let capturedUrl = ''
    const fetcher = (async (url: string) => {
      capturedUrl = url
      return jsonResponse({ choices: [{ message: { content: 'x' } }] })
    }) as unknown as typeof fetch

    const client = createAIClient({
      ...settings,
      baseUrl: 'https://example.test/api/v1///',
      fetcher,
    })
    await client.complete([{ role: 'user', content: 'hi' }])
    expect(capturedUrl).toBe('https://example.test/api/v1/chat/completions')
  })

  it('passes through maxTokens and temperature', async () => {
    let body: any
    const fetcher = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(init!.body as string)
      return jsonResponse({ choices: [{ message: { content: 'x' } }] })
    }) as unknown as typeof fetch

    const client = createAIClient({ ...settings, fetcher })
    await client.complete([{ role: 'user', content: 'hi' }], {
      maxTokens: 42,
      temperature: 0.7,
    })
    expect(body.max_tokens).toBe(42)
    expect(body.temperature).toBe(0.7)
  })

  it('throws with the provider message on a non-ok response', async () => {
    const fetcher = (async () =>
      jsonResponse(
        { error: { message: 'rate limited' } },
        false,
        429
      )) as unknown as typeof fetch

    const client = createAIClient({ ...settings, fetcher })
    await expect(
      client.complete([{ role: 'user', content: 'hi' }])
    ).rejects.toThrow(/429.*rate limited/)
  })

  it('throws when the response has no content', async () => {
    const fetcher = (async () =>
      jsonResponse({ choices: [] })) as unknown as typeof fetch
    const client = createAIClient({ ...settings, fetcher })
    await expect(
      client.complete([{ role: 'user', content: 'hi' }])
    ).rejects.toThrow()
  })
})

describe('truncateForPrompt', () => {
  it('returns text unchanged when within the limit', () => {
    expect(truncateForPrompt('short', 100)).toBe('short')
  })

  it('truncates and appends a notice when over the limit', () => {
    const result = truncateForPrompt('a'.repeat(100), 30)
    expect(result.length).toBeLessThanOrEqual(30)
    expect(result).toContain('[truncated]')
  })
})
