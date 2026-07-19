// Avatar dropdown (top-right) — quick access to language + appearance.
// State lives in uiStore (shared with the Preferences page); App.tsx applies it
// to <html>. Tokens only · all targets ≥44px · keyboard + click-outside close.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useUiStore, type Language } from '../store/uiStore'
import { useLogout } from '../hooks/useAuth'
import { useSavePreferences } from '../hooks/usePersonalPreferences'
import { useT } from '../i18n'
import MaterialIcon from './MaterialIcon'

export default function ProfileMenu() {
  const t = useT()
  const name = useAuthStore(s => s.name)
  const role = useAuthStore(s => s.role)
  const logout = useLogout()
  const theme = useUiStore(s => s.theme)
  const language = useUiStore(s => s.language)
  const toggleTheme = useUiStore(s => s.toggleTheme)
  const setLanguage = useUiStore(s => s.setLanguage)
  const { mutate: savePrefs } = useSavePreferences()

  // Apply instantly via uiStore, then persist to the server (cross-device sync).
  const onToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    toggleTheme()
    savePrefs({ theme: next })
  }
  const onSetLanguage = (lang: Language) => {
    setLanguage(lang)
    savePrefs({ language: lang })
  }

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const isDark = theme === 'dark'

  const langBtn = (lang: Language, label: string) => {
    const active = language === lang
    return (
      <button
        type="button"
        onClick={() => onSetLanguage(lang)}
        aria-pressed={active}
        className={`flex-1 min-h-[44px] px-md rounded-lg text-body-sm font-medium transition-colors
          ${active
            ? 'bg-primary text-primary-on'
            : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="relative" ref={rootRef}>
      {/* Avatar trigger (now a real button) */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('menu.account')}
        title={name ?? ''}
        className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full bg-primary text-primary-on flex items-center justify-center text-label-md font-bold select-none flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
      >
        {(name ?? 'U').charAt(0).toUpperCase()}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-sm w-72 bg-surface border border-outline-variant rounded-xl shadow-lvl3 p-sm z-50 flex flex-col gap-xs"
        >
          {/* Account header */}
          <div className="flex items-center gap-sm px-sm py-sm">
            <div className="w-10 h-10 rounded-full bg-primary text-primary-on flex items-center justify-center text-label-md font-bold flex-shrink-0 select-none">
              {(name ?? 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-body-sm font-medium text-on-surface truncate">{name ?? t('menu.account')}</p>
              <p className="text-label-md text-on-surface-variant capitalize">{role}</p>
            </div>
          </div>

          <div className="h-px bg-outline-variant mx-sm" />

          {/* Language toggle */}
          <div className="px-sm pt-sm">
            <p className="text-label-md text-on-surface-variant uppercase tracking-[0.5px] mb-xs flex items-center gap-xs">
              <MaterialIcon name="translate" size={16} /> {t('menu.language')}
            </p>
            <div className="flex items-center gap-xs">
              {langBtn('en', t('menu.english'))}
              {langBtn('th', t('menu.thai'))}
            </div>
          </div>

          {/* Appearance / dark mode toggle */}
          <div className="px-sm pt-sm pb-xs">
            <p className="text-label-md text-on-surface-variant uppercase tracking-[0.5px] mb-xs flex items-center gap-xs">
              <MaterialIcon name="contrast" size={16} /> {t('menu.appearance')}
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={isDark}
              onClick={onToggleTheme}
              className="w-full min-h-[44px] flex items-center justify-between px-md rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors"
            >
              <span className="flex items-center gap-sm text-body-sm text-on-surface">
                <MaterialIcon name={isDark ? 'dark_mode' : 'light_mode'} size={20} />
                {isDark ? t('menu.darkMode') : t('menu.lightMode')}
              </span>
              {/* switch track */}
              <span
                aria-hidden="true"
                className={`relative inline-flex items-center w-12 h-7 rounded-full transition-colors flex-shrink-0
                  ${isDark ? 'bg-primary' : 'bg-outline-variant'}`}
              >
                <span
                  className={`inline-block w-5 h-5 rounded-full bg-surface shadow transform transition-transform
                    ${isDark ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </span>
            </button>
          </div>

          <div className="h-px bg-outline-variant mx-sm" />

          {/* My Preferences (change password, notifications) */}
          <Link
            to="/preferences"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="w-full min-h-[44px] flex items-center gap-sm px-md rounded-lg text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <MaterialIcon name="manage_accounts" size={18} />
            {t('nav.myPreferences')}
          </Link>

          <div className="h-px bg-outline-variant mx-sm" />

          {/* Sign out */}
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); logout() }}
            className="w-full min-h-[44px] flex items-center gap-sm px-md rounded-lg text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <MaterialIcon name="logout" size={18} />
            {t('menu.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}
