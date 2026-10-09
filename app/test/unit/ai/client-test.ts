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

describe('createAIClient timeout and cancellation', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  /** A fetcher that never answers but rejects when its signal aborts. */
  const hangingFetcher = (() => {
    return ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        )
      })) as unknown as typeof fetch
  })()

  it('gives up with a clear message when the provider never answers', async () => {
    const client = createAIClient({ ...settings, fetcher: hangingFetcher })

    const result = client.complete([{ role: 'user', content: 'hi' }])
    const assertion = expect(result).rejects.toThrow(
      'did not respond within 60 seconds'
    )
    await jest.advanceTimersByTimeAsync(60_000)
    await assertion
  })

  it('honors a custom timeout', async () => {
    const client = createAIClient({ ...settings, fetcher: hangingFetcher })

    const result = client.complete([{ role: 'user', content: 'hi' }], {
      timeoutMs: 5_000,
    })
    const assertion = expect(result).rejects.toThrow('within 5 seconds')
    await jest.advanceTimersByTimeAsync(5_000)
    await assertion
  })

  it('does not time out a request that answers in time', async () => {
    const fetcher = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'done' } }] }),
      }) as unknown as Response) as unknown as typeof fetch
    const client = createAIClient({ ...settings, fetcher })

    const result = await client.complete([{ role: 'user', content: 'hi' }])
    await jest.advanceTimersByTimeAsync(120_000)

    expect(result).toBe('done')
  })

  it('aborts the in-flight request when the caller aborts, without calling it a timeout', async () => {
    const client = createAIClient({ ...settings, fetcher: hangingFetcher })
    const controller = new AbortController()

    const result = client.complete([{ role: 'user', content: 'hi' }], {
      signal: controller.signal,
    })
    const assertion = expect(result).rejects.toThrow('aborted')
    controller.abort()
    await assertion
  })

  it('rejects immediately for a signal that is already aborted', async () => {
    const client = createAIClient({ ...settings, fetcher: hangingFetcher })
    const controller = new AbortController()
    controller.abort()

    await expect(
      client.complete([{ role: 'user', content: 'hi' }], {
        signal: controller.signal,
      })
    ).rejects.toThrow('aborted')
    // No request was made and no timer was left running.
    expect(jest.getTimerCount()).toBe(0)
  })

  it('cancels its timer once settled so nothing lingers', async () => {
    const fetcher = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      }) as unknown as Response) as unknown as typeof fetch
    const client = createAIClient({ ...settings, fetcher })

    await client.complete([{ role: 'user', content: 'hi' }])

    expect(jest.getTimerCount()).toBe(0)
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
