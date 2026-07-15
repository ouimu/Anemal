import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { ReactNode } from 'react'

const post = vi.fn()
vi.mock('../utils/api', () => ({ default: { post: (...args: unknown[]) => post(...args) } }))

import { useChangePassword } from './useChangePassword'

// Plain .ts (no JSX transform here per repo convention, see useAuth.test.ts) -
// use React.createElement instead of a JSX wrapper.
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient()
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => { post.mockReset() })

describe('useChangePassword', () => {
  it('POSTs to /auth/change-password with skipAuthRedirect: true', async () => {
    post.mockResolvedValue({ status: 204 })
    const { result } = renderHook(() => useChangePassword(), { wrapper })

    result.current.mutate({ currentPassword: 'OldPass1!', newPassword: 'NewPass1!' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(post).toHaveBeenCalledWith(
      '/auth/change-password',
      { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' },
      { skipAuthRedirect: true },
    )
  })
})
