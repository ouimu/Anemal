// Self-service password change (PWD-1). No target-user param — server derives
// the caller's identity from the JWT (req.context), never from the body.
import { useMutation } from '@tanstack/react-query'
import api from '../utils/api'

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

/**
 * POST /auth/change-password. Uses `skipAuthRedirect: true` so a 401 (wrong
 * current password) surfaces as an inline error instead of triggering the
 * global "session expired" logout redirect in utils/api.ts.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (data: ChangePasswordInput) =>
      api.post('/auth/change-password', data, { skipAuthRedirect: true }),
  })
}
