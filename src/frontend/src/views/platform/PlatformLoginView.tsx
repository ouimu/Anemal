/**
 * PlatformLoginView — sign-in screen for platform operators.
 * Submits to POST /platform/auth/login and stores the platform JWT.
 * Completely separate from clinic login — no tenantId required.
 */
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import platformApi from '../../utils/platformApi'
import { usePlatformAuthStore } from '../../store/platformAuthStore'
import { type PlatformAuthPayload } from '../../store/platformAuthStore'
import MaterialIcon from '../../components/MaterialIcon'

interface LoginPayload {
  email:    string
  password: string
}

export default function PlatformLoginView() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const setAuth  = usePlatformAuthStore((s) => s.setAuth)
  const navigate = useNavigate()
  const showIdleBanner = new URLSearchParams(window.location.search).get('reason') === 'idle'

  const mutation = useMutation({
    mutationFn: (payload: LoginPayload) =>
      platformApi
        .post<{ success: boolean; data: PlatformAuthPayload }>('/platform/auth/login', payload)
        .then((r) => r.data.data),
    onSuccess: (data) => {
      setAuth(data)
      navigate('/platform/customers')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({ email, password })
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-md">
      <div className="bg-surface rounded-lg shadow-lvl2 w-full max-w-sm p-xl">
        <div className="mb-xl text-center">
          <p className="text-headline-sm font-headline font-bold text-on-surface">Platform Console</p>
          <p className="text-body-sm text-on-surface-variant mt-xs">Anemal SaaS Operations</p>
        </div>

        {showIdleBanner && (
          <div className="mb-md flex items-start gap-sm bg-secondary-container/30 border border-secondary/30 rounded-lg px-md py-sm">
            <MaterialIcon name="info" size={18} />
            <p className="text-body-sm text-on-surface">You were logged out due to inactivity.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-md">
          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-[44px] px-md pr-12 border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
                placeholder="Password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-0 top-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-on-surface-variant"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                <MaterialIcon name={showPw ? 'visibility_off' : 'visibility'} size={20} />
              </button>
            </div>
          </div>

          {mutation.error && (
            <p className="text-label-md text-error">
              Invalid credentials. Please try again.
            </p>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full min-h-[44px] bg-primary text-on-primary rounded text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-sm"
          >
            {mutation.isPending ? (
              <span className="w-5 h-5 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
