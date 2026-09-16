// Axios instance — injects JWT from auth store on every request
import axios from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../store/authStore'
import { clearServerState } from './queryClient'

declare module 'axios' {
  export interface AxiosRequestConfig {
    /**
     * When true, a 401 response for this request will NOT trigger the global
     * "clear auth + redirect to /login" side effect below. Used by
     * self-service flows (e.g. change-password) where a 401 means "wrong
     * current password" — a normal inline-error case, not a session expiry.
     */
    skipAuthRedirect?: boolean
  }
}

const api = axios.create({ baseURL: '/' })

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // A caller-supplied Authorization header wins — used by the identity-
  // resolution calls that must authenticate with a freshly issued token
  // that hasn't been written to the auth store yet (login/select-branch
  // are not atomic with setAuth: ADR-0024 resolves /auth/me BEFORE the
  // token is persisted). Every other call site never sets this, so the
  // store-derived default below is unaffected.
  // @qa-agent (2026-09-10): `.has()` is a case-insensitive header lookup
  // (AxiosHeaders); a plain `config.headers.Authorization` truthiness check
  // would miss a caller that set a lowercase `authorization` key and silently
  // overwrite it with the store token.
  if (!config.headers.has('Authorization')) {
    const token = useAuthStore.getState().token
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const skipAuthRedirect = err.config?.skipAuthRedirect === true
    if (err.response?.status === 401 && !skipAuthRedirect) {
      // HI-09: clear cached PII before dropping auth + navigating away.
      void clearServerState().finally(() => {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login?reason=session-expired'
      })
      return Promise.reject(err)
    }
    return Promise.reject(err)
  }
)

export default api
