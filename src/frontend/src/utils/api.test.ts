import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AxiosHeaders } from 'axios'

const clearAuth = vi.fn()
let currentToken = ''

vi.mock('../store/authStore', () => ({
  useAuthStore: { getState: () => ({ token: currentToken, clearAuth }) },
}))

import api from './api'

function getRejectedHandler(): (err: unknown) => Promise<never> {
  // axios stores interceptors internally; the response interceptor registered
  // in api.ts is the first (only) one, so index 0's `rejected` is our handler.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (api.interceptors.response as any).handlers[0].rejected
}

// Phase 8 (2026-09-10 code-quality refactor, closing a @qa-agent conditional-
// approval gap): the request interceptor was the whole point of this
// refactor's api.ts change — it's what lets fetchMe()'s explicit,
// not-yet-persisted token survive instead of being overwritten by the store's
// (absent, at that point) token. Before this block, all three new lines
// (skipAuthRedirect passthrough at call sites, the explicit-header
// Authorization, and this guard) could be deleted with the full suite still
// green — a green suite with nothing actually exercising the mechanism it
// exists to protect.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRequestFulfilledHandler(): (config: any) => any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (api.interceptors.request as any).handlers[0].fulfilled
}

describe('api request interceptor — Authorization header', () => {
  beforeEach(() => {
    currentToken = ''
  })

  it('injects the store token when no Authorization header is set', () => {
    currentToken = 'store-token'
    const fulfilled = getRequestFulfilledHandler()
    const config = { headers: new AxiosHeaders() }
    const result = fulfilled(config)
    expect(result.headers.get('Authorization')).toBe('Bearer store-token')
  })

  it('does not set Authorization when there is no store token and none was supplied', () => {
    currentToken = ''
    const fulfilled = getRequestFulfilledHandler()
    const config = { headers: new AxiosHeaders() }
    const result = fulfilled(config)
    expect(result.headers.has('Authorization')).toBe(false)
  })

  it('a caller-supplied Authorization header wins over the store token (fetchMe\'s not-yet-persisted-token case)', () => {
    currentToken = 'store-token'
    const fulfilled = getRequestFulfilledHandler()
    const config = { headers: new AxiosHeaders({ Authorization: 'Bearer fresh-token' }) }
    const result = fulfilled(config)
    expect(result.headers.get('Authorization')).toBe('Bearer fresh-token')
  })

  it('a lowercase "authorization" header also wins — the check is case-insensitive (AxiosHeaders#has)', () => {
    currentToken = 'store-token'
    const fulfilled = getRequestFulfilledHandler()
    const config = { headers: new AxiosHeaders({ authorization: 'Bearer fresh-token' }) }
    const result = fulfilled(config)
    expect(result.headers.get('Authorization')).toBe('Bearer fresh-token')
  })
})

beforeEach(() => {
  clearAuth.mockReset()
  delete (window as unknown as { location?: unknown }).location
  ;(window as unknown as { location: { href: string } }).location = { href: '' }
})

describe('api response interceptor — 401 handling', () => {
  it('clears auth and redirects on a plain 401 (no skipAuthRedirect), carrying reason=session-expired', async () => {
    const rejected = getRejectedHandler()
    const err = { response: { status: 401 }, config: {} }
    await expect(rejected(err)).rejects.toBe(err)
    expect(clearAuth).toHaveBeenCalledTimes(1)
    expect(window.location.href).toBe('/login?reason=session-expired')
  })

  it('does NOT clear auth or redirect on a 401 when the request set skipAuthRedirect', async () => {
    const rejected = getRejectedHandler()
    const err = { response: { status: 401 }, config: { skipAuthRedirect: true } }
    await expect(rejected(err)).rejects.toBe(err)
    expect(clearAuth).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
  })

  it('still rejects (does not redirect) for non-401 errors', async () => {
    const rejected = getRejectedHandler()
    const err = { response: { status: 422 }, config: {} }
    await expect(rejected(err)).rejects.toBe(err)
    expect(clearAuth).not.toHaveBeenCalled()
  })
})
