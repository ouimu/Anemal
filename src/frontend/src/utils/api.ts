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
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
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
        window.location.href = '/login'
      })
      return Promise.reject(err)
    }
    return Promise.reject(err)
  }
)

export default api
