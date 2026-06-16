import { useState } from 'react'
import { useUiStore } from '../../store/uiStore'
import { useSavePreferences } from '../../hooks/usePersonalPreferences'
import { useT } from '../../i18n'
import MaterialIcon from '../../components/MaterialIcon'

// Notification prefs stay local; theme + language now live in uiStore (shared
// with the TopNav profile menu) so the two surfaces never diverge and apply app-wide.
const STORAGE_KEY = 'anemal_notification_prefs'

interface NotifPrefs {
  notifyAppointmentBooked: boolean
  notifyLabResult: boolean
}

const DEFAULT_NOTIFS: NotifPrefs = {
  notifyAppointmentBooked: true,
  notifyLabResult: true,
}

function loadNotifs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_NOTIFS, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return { ...DEFAULT_NOTIFS }
}

export default function PreferencesPage() {
  const t = useT()
  const theme = useUiStore(s => s.theme)
  const language = useUiStore(s => s.language)
  const toggleTheme = useUiStore(s => s.toggleTheme)
  const setLanguage = useUiStore(s => s.setLanguage)
  const { mutate: savePrefs } = useSavePreferences()

  const [notifs, setNotifs] = useState<NotifPrefs>(loadNotifs)
  const [saved, setSaved] = useState(false)

  const isDark = theme === 'dark'

  // Apply instantly via uiStore, then persist to the server (cross-device sync).
  const onToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    toggleTheme()
    savePrefs({ theme: next })
  }
  const onSelectLanguage = (lang: 'en' | 'th') => {
    setLanguage(lang)
    savePrefs({ language: lang })
  }

  function handleSave() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function setNotif<K extends keyof NotifPrefs>(key: K, value: NotifPrefs[K]) {
    setNotifs(p => ({ ...p, [key]: value }))
  }

  return (
    <div className="max-w-2xl mx-auto p-xl flex flex-col gap-lg">
      <h1 className="text-headline-md font-headline text-on-surface">{t('prefs.title')}</h1>

      {saved && (
        <div className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-secondary flex items-center gap-sm">
          <MaterialIcon name="check_circle" size={18} />
          {t('prefs.saved')}
        </div>
      )}

      {/* Appearance */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md">
        <h2 className="text-title-md font-medium text-on-surface">{t('prefs.appearance')}</h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-body-md text-on-surface">{t('menu.darkMode')}</p>
            <p className="text-body-sm text-on-surface-variant">{t('prefs.darkModeDesc')}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isDark}
            onClick={onToggleTheme}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors
              ${isDark
                ? 'bg-primary text-primary-on'
                : 'bg-surface-container-low text-on-surface-variant border border-outline-variant'}`}
            aria-label="Toggle dark mode"
          >
            <MaterialIcon name={isDark ? 'dark_mode' : 'light_mode'} size={24} />
          </button>
        </div>
      </div>

      {/* Language */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md">
        <h2 className="text-title-md font-medium text-on-surface">{t('prefs.language')}</h2>

        <div className="flex flex-col gap-xs">
          <label htmlFor="lang-select" className="text-label-md text-on-surface-variant">{t('prefs.displayLanguage')}</label>
          <select
            id="lang-select"
            value={language}
            onChange={e => onSelectLanguage(e.target.value as 'en' | 'th')}
            className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
          >
            <option value="en">English</option>
            <option value="th">ภาษาไทย</option>
          </select>
        </div>
      </div>

      {/* Personal Notifications */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md">
        <h2 className="text-title-md font-medium text-on-surface">{t('prefs.personalNotifications')}</h2>

        <div className="flex items-center justify-between min-h-[44px]">
          <span className="text-body-md text-on-surface">{t('prefs.notifyAppointment')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={notifs.notifyAppointmentBooked}
            onClick={() => setNotif('notifyAppointmentBooked', !notifs.notifyAppointmentBooked)}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ml-md flex-shrink-0
              ${notifs.notifyAppointmentBooked
                ? 'bg-primary text-primary-on'
                : 'bg-surface-container-low text-on-surface-variant border border-outline-variant'}`}
            aria-label="Toggle appointment notifications"
          >
            <MaterialIcon name={notifs.notifyAppointmentBooked ? 'toggle_on' : 'toggle_off'} size={24} />
          </button>
        </div>

        <div className="flex items-center justify-between min-h-[44px]">
          <span className="text-body-md text-on-surface">{t('prefs.notifyLab')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={notifs.notifyLabResult}
            onClick={() => setNotif('notifyLabResult', !notifs.notifyLabResult)}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ml-md flex-shrink-0
              ${notifs.notifyLabResult
                ? 'bg-primary text-primary-on'
                : 'bg-surface-container-low text-on-surface-variant border border-outline-variant'}`}
            aria-label="Toggle lab result notifications"
          >
            <MaterialIcon name={notifs.notifyLabResult ? 'toggle_on' : 'toggle_off'} size={24} />
          </button>
        </div>
      </div>

      {/* Sticky save bar (theme + language save instantly; this saves notifications) */}
      <div className="sticky bottom-0 bg-background pt-sm pb-md flex items-center justify-end border-t border-outline-variant">
        <button
          type="button"
          onClick={handleSave}
          className="min-h-[44px] min-w-[44px] px-xl bg-primary text-primary-on rounded-xl text-body-md font-medium hover:opacity-90 transition-opacity"
        >
          {t('prefs.save')}
        </button>
      </div>
    </div>
  )
}
