/**
 * Axios instance for platform-plane API calls.
 * Injects the platform JWT (separate from clinic JWT) on every request.
 */
import axios from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'
import { usePlatformAuthStore } from '../store/platformAuthStore'

declare module 'axios' {
  export interface AxiosRequestConfig {
    /**
     * When true, a 401 for this request will NOT trigger the global
     * "clear auth + redirect to /platform/login" side effect below.
     * The login call itself returns 401 on wrong credentials — without this,
     * the interceptor force-navigates away before React can render the error.
     */
    skipAuthRedirect?: boolean
  }
}

const platformApi = axios.create({ baseURL: '/' })

platformApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = usePlatformAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

platformApi.interceptors.response.use(
  (res) => res,
  (err) => {
    const skipAuthRedirect = err.config?.skipAuthRedirect === true
    if (err.response?.status === 401 && !skipAuthRedirect) {
      usePlatformAuthStore.getState().clearAuth()
      window.location.href = '/platform/login'
    }
    return Promise.reject(err)
  }
)

export default platformApi
