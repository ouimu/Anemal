import React, { useState } from 'react'
import { useLogin } from '../hooks/useAuth'
import { useAuthStore } from '../store/authStore'
import { Navigate } from 'react-router-dom'
import { useT } from '../i18n'

export default function LoginView() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated())
  const role = useAuthStore(s => s.role)
  const t = useT()

  const detectedSubdomain = (() => {
    const host = window.location.hostname
    const parts = host.split('.')
    if (parts.length >= 3) return parts[0]
    // Dev convenience: subdomain can't be derived from localhost/127.0.0.1,
    // so default to the seeded dev tenant instead of leaving an empty Clinic ID
    // (an empty Clinic ID makes every login fail with "Invalid credentials").
    if (host === 'localhost' || host === '127.0.0.1') return 'dev-clinic'
    return ''
  })()

  const [form, setForm]       = useState({ subdomain: detectedSubdomain, email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [remember, setRemember] = useState(false)
  const login = useLogin()

  if (isAuthenticated) {
    return <Navigate to={
      role === 'admin'      ? '/admin/dashboard' :
      role === 'superadmin' ? '/settings/system' :
      '/clinic/dashboard'
    } replace />
  }

  const set = (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [field]: e.target.value }))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    login.mutate({ ...form, remember })
  }

  const errorMsg = login.error
    ? ((login.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('login.invalidCredentials'))
    : null

  return (
    <div className="bg-background min-h-screen flex flex-col">
      <main className="flex-grow flex flex-col md:flex-row">

        {/* ── Left: Hero image (desktop only) ──────────────────────────── */}
        <section className="hidden md:flex md:w-1/2 lg:w-3/5 relative bg-primary-container overflow-hidden">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBx08i6mLtooKtMYfLPqt2q0Iiu8HzcBsB-zsx6cYuAeEhkq6zekL-h90BJ5vl_-ClVSjYHtyAEVlvGQuSUMilG1Ldrglao7qE9-wtTDvFMBp-aXyQRiotqMZwk31FwTlzN6vyx9ofRpjfnmdJCENAyYrR_o5kF0hMatwSWym6ixIBno6sLw_XUbDlqzbbCROL-i_mLnrKcbYd6IkP0HdDgLwd81uTxL735HIf0JdXrWSTyUZ530yRRNpxlijIzjHla_1Ey3snpdxQ"
            alt="Veterinary Clinic"
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Dark gradient overlay */}
          <div
            className="absolute inset-0 flex items-end p-xl"
            style={{ background: 'linear-gradient(rgba(15,23,42,0.4), rgba(15,23,42,0.1))' }}
          >
            <div className="bg-surface/90 backdrop-blur-md p-lg rounded-xl border border-outline-variant max-w-md">
              <span className="text-secondary font-bold text-label-md uppercase tracking-wider mb-sm block">
                Professional Excellence
              </span>
              <h2 className="text-headline-lg font-headline font-bold text-primary mb-sm leading-tight">
                Advanced Care for Every Patient
              </h2>
              <p className="text-on-surface-variant text-body-md">
                Empowering veterinary professionals with clinical precision and compassionate technology.
              </p>
            </div>
          </div>
        </section>

        {/* ── Right: Login form ─────────────────────────────────────────── */}
        <section className="flex-grow md:w-1/2 lg:w-2/5 flex flex-col justify-center items-center p-margin-mobile md:p-margin-desktop bg-surface">
          <div className="w-full max-w-[440px]">

            {/* Branding */}
            <div className="mb-xl text-center md:text-left">
              <div className="flex items-center gap-sm mb-lg justify-center md:justify-start">
                <div className="w-10 h-10 bg-primary-container rounded-lg flex items-center justify-center">
                  <span
                    className="material-symbols-outlined text-surface"
                    style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                  >
                    pets
                  </span>
                </div>
                <span className="text-headline-sm font-headline font-bold text-primary">Anemal</span>
              </div>
              <h1 className="text-headline-lg font-headline font-bold text-on-surface mb-xs">{t('login.title')}</h1>
              <p className="text-on-surface-variant text-body-md">
                {t('login.subtitle')}
              </p>
            </div>

            {/* Form */}
            <form className="space-y-lg" onSubmit={handleSubmit}>

              {/* Clinic ID (multi-tenant requirement) */}
              <div className="space-y-xs">
                <label htmlFor="subdomain" className="block text-label-md text-on-surface-variant font-medium">
                  {t('login.subdomain')}
                </label>
                <div className="relative">
                  <span className="absolute left-md top-1/2 -translate-y-1/2 material-symbols-outlined text-outline" style={{ fontSize: '20px' }}>
                    business
                  </span>
                  <input
                    id="subdomain" name="subdomain" type="text"
                    value={form.subdomain} onChange={set('subdomain')}
                    placeholder="e.g. bangkokpetcare"
                    autoComplete="organization" required
                    className="w-full pl-[48px] pr-[110px] py-[14px] bg-surface-container-low border border-outline-variant rounded-lg focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all text-body-md text-on-surface"
                  />
                  <span className="absolute right-md top-1/2 -translate-y-1/2 text-label-md text-on-surface-variant pointer-events-none select-none">
                    .anemal.app
                  </span>
                </div>
              </div>

              {/* Email */}
              <div className="space-y-xs">
                <label htmlFor="email" className="block text-label-md text-on-surface-variant font-medium">
                  {t('login.email')}
                </label>
                <div className="relative">
                  <span className="absolute left-md top-1/2 -translate-y-1/2 material-symbols-outlined text-outline" style={{ fontSize: '20px' }}>
                    mail
                  </span>
                  <input
                    id="email" name="email" type="email"
                    value={form.email} onChange={set('email')}
                    placeholder="name@clinic.com"
                    autoComplete="email" required
                    className="w-full pl-[48px] pr-md py-[14px] bg-surface-container-low border border-outline-variant rounded-lg focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all text-body-md text-on-surface"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-xs">
                <label htmlFor="password" className="block text-label-md text-on-surface-variant font-medium">
                  {t('login.password')}
                </label>
                <div className="relative">
                  <span className="absolute left-md top-1/2 -translate-y-1/2 material-symbols-outlined text-outline" style={{ fontSize: '20px' }}>
                    lock
                  </span>
                  <input
                    id="password" name="password"
                    type={showPass ? 'text' : 'password'}
                    value={form.password} onChange={set('password')}
                    placeholder="••••••••"
                    autoComplete="current-password" required
                    className="w-full pl-[48px] pr-[48px] py-[14px] bg-surface-container-low border border-outline-variant rounded-lg focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all text-body-md text-on-surface"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(p => !p)}
                    className="absolute right-md top-1/2 -translate-y-1/2 material-symbols-outlined text-outline hover:text-on-surface transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                    style={{ fontSize: '20px' }}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? 'visibility_off' : 'visibility'}
                  </button>
                </div>
              </div>

              {/* Remember me + Forgot password */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-sm cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    className="w-5 h-5 rounded border-outline-variant text-secondary focus:ring-secondary cursor-pointer"
                  />
                  <span className="text-label-md text-on-surface-variant group-hover:text-on-surface transition-colors">
                    Remember me
                  </span>
                </label>
                <a href="#" className="text-label-md text-secondary font-bold hover:underline transition-all">
                  Forgot password?
                </a>
              </div>

              {/* Error */}
              {errorMsg && (
                <div className="flex items-start gap-sm bg-error-container/30 border border-error/30 rounded-lg px-md py-sm">
                  <span className="material-symbols-outlined text-error flex-shrink-0 mt-0.5" style={{ fontSize: '18px' }}>
                    error_outline
                  </span>
                  <p className="text-body-md text-error">{errorMsg}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit" disabled={login.isPending}
                className="w-full bg-primary-container text-surface py-md rounded-lg text-headline-xs font-headline font-bold hover:bg-black active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-sm disabled:opacity-50 min-h-[48px]"
              >
                {login.isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-surface/40 border-t-surface rounded-full animate-spin" />
                    {t('login.signingIn')}
                  </>
                ) : (
                  <>
                    {t('login.signIn')}
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>login</span>
                  </>
                )}
              </button>
            </form>

            {/* Help */}
            <div className="mt-2xl text-center">
              <p className="text-body-md text-on-surface-variant">
                Need technical assistance?{' '}
                <a href="#" className="text-secondary font-bold hover:underline">{t('login.contactSupport')}</a>
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="w-full py-xl px-margin-desktop flex flex-col md:flex-row justify-between items-center gap-md bg-surface-container-low border-t border-outline-variant">
        <div className="flex flex-col md:flex-row items-center gap-lg">
          <span className="text-headline-xs font-headline font-bold text-on-surface">Anemal</span>
          <p className="text-label-md text-on-surface-variant">© 2024 Anemal. All rights reserved.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-lg">
          <a href="#" className="text-label-md text-on-surface-variant hover:text-secondary transition-colors">{t('login.privacy')}</a>
          <a href="#" className="text-label-md text-on-surface-variant hover:text-secondary transition-colors">{t('login.terms')}</a>
          <a href="#" className="text-label-md text-on-surface-variant hover:text-secondary transition-colors">Clinic Support</a>
          <div className="flex items-center gap-xs">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span className="text-label-md text-on-surface-variant">System Status</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
