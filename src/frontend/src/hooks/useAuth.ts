import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuthStore } from '../store/authStore'

interface LoginPayload { subdomain: string; email: string; password: string }

export function useLogin() {
  const setAuth   = useAuthStore((s) => s.setAuth)
  const navigate  = useNavigate()

  return useMutation({
    mutationFn: (payload: LoginPayload) =>
      api.post<{ success: boolean; data: { token: string; userId: number; tenantId: number; role: string; name: string } }>('/auth/login', payload),
    onSuccess: (res) => {
      setAuth(res.data.data)
      // Role-based redirect: admin → admin section, others → clinic section
      const role = res.data.data.role
      navigate(role === 'admin' ? '/admin/dashboard' : '/clinic/dashboard')
    },
  })
}

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const navigate  = useNavigate()
  return () => { clearAuth(); navigate('/login') }
}
