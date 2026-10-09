import { Account } from '../../models/account'
import { IHttpClient, IHttpResponse } from './pull-request-reviews'
import { fetchWithTimeout, RequestTimeoutMs } from '../http'

/**
 * Minimal `IHttpClient` backed by `fetch` and an `Account` for auth headers.
 *
 * The existing `API` class has its own elaborate request pipeline (proxies,
 * retry, dotcom vs GHES base URL handling), but it is not currently exposed
 * as an IHttpClient. This adapter is a focused subset for the PR review
 * feature; it can be replaced with a wrapper over `API` later without
 * changing consumers.
 *
 * Network failures (DNS, offline, abort, refused) and body-read failures
 * are returned as `{ ok: false, status: 0, body: null }` rather than
 * propagated as thrown exceptions — callers (`pull-request-reviews.ts`,
 * `pull-request-review-store.ts`) check `res.ok` and act accordingly.
 */
export function makeAccountHttpClient(
  account: Account,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = RequestTimeoutMs
): IHttpClient {
  return {
    async request(method, path, body) {
      const url = `${account.endpoint.replace(/\/$/, '')}${
        path.startsWith('/') ? path : '/' + path
      }`
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }
      if (account.token) {
        headers.Authorization = `token ${account.token}`
      }
      const init: RequestInit = { method, headers }
      if (body !== undefined && body !== null) {
        headers['Content-Type'] = 'application/json'
        init.body = JSON.stringify(body)
      }
      let res: { status: number; ok: boolean; text: string }
      try {
        // The deadline covers the body read too, so a stalled response can
        // never leave a caller (e.g. review submit) pending forever.
        res = await fetchWithTimeout(url, init, {
          timeoutMs,
          fetchImpl,
          settle: async r => ({
            status: r.status,
            ok: r.ok,
            text: await r.text(),
          }),
        })
      } catch (err) {
        // Network-level failure (DNS, offline, refused, aborted, timeout).
        // Surface as a non-ok response so callers don't see an unhandled
        // rejection.
        log.warn(
          `[account-http-client] ${method} ${path} request failed: ${
            (err as Error)?.message ?? String(err)
          }`
        )
        return { status: 0, ok: false, body: null }
      }
      const text = res.text
      let parsed: unknown = null
      if (text.length > 0) {
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = text
        }
      }
      const out: IHttpResponse = {
        status: res.status,
        ok: res.ok,
        body: parsed,
      }
      return out
    },
  }
}
