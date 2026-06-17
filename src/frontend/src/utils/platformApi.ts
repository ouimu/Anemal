/**
 * Axios instance for platform-plane API calls.
 * Injects the platform JWT (separate from clinic JWT) on every request.
 */
import axios from 'axios'
import { usePlatformAuthStore } from '../store/platformAuthStore'

const platformApi = axios.create({ baseURL: '/' })

platformApi.interceptors.request.use((config) => {
  const token = usePlatformAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

platformApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      usePlatformAuthStore.getState().clearAuth()
      window.location.href = '/platform/login'
    }
    return Promise.reject(err)
  }
)

export default platformApi
