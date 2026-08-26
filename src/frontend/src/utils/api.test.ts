import { describe, it, expect, vi, beforeEach } from 'vitest'

const clearAuth = vi.fn()

vi.mock('../store/authStore', () => ({
  useAuthStore: { getState: () => ({ token: '', clearAuth }) },
}))

import api from './api'

function getRejectedHandler(): (err: unknown) => Promise<never> {
  // axios stores interceptors internally; the response interceptor registered
  // in api.ts is the first (only) one, so index 0's `rejected` is our handler.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (api.interceptors.response as any).handlers[0].rejected
}

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
