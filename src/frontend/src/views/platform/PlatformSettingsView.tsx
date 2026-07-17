/**
 * PlatformSettingsView — /platform/settings
 * Form for platform-wide settings: maintenance mode, trial days, SMTP.
 */
import React, { useEffect, useState } from 'react'
import {
  usePlatformSettings,
  useUpdatePlatformSettings,
  type PlatformSettings,
} from '../../hooks/usePlatformSettings'
import MaterialIcon from '../../components/MaterialIcon'
import { getErrorMessage } from '../../utils/errorMessage'

export default function PlatformSettingsView() {
  const { data, isLoading, isError } = usePlatformSettings()
  const updateMutation               = useUpdatePlatformSettings()

  // Form state mirrors PlatformSettings fields
  const [appName,         setAppName]         = useState('')
  const [baseUrl,         setBaseUrl]          = useState('')
  const [maintenanceMode, setMaintenanceMode]  = useState(false)
  const [trialDays,       setTrialDays]        = useState(14)
  const [smtpHost,        setSmtpHost]         = useState('')
  const [smtpPort,        setSmtpPort]         = useState<number | ''>(587)
  const [smtpUser,        setSmtpUser]         = useState('')
  const [smtpFrom,        setSmtpFrom]         = useState('')

  // Populate form when data loads
  useEffect(() => {
    if (!data) return
    setAppName(data.appName)
    setBaseUrl(data.baseUrl)
    setMaintenanceMode(data.maintenanceMode)
    setTrialDays(data.trialDays)
    setSmtpHost(data.smtpHost ?? '')
    setSmtpPort(data.smtpPort ?? '')
    setSmtpUser(data.smtpUser ?? '')
    setSmtpFrom(data.smtpFrom ?? '')
  }, [data])

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Partial<PlatformSettings> = {
      appName,
      baseUrl,
      maintenanceMode,
      trialDays,
      smtpHost:  smtpHost  || null,
      smtpPort:  smtpPort !== '' ? smtpPort : null,
      smtpUser:  smtpUser  || null,
      smtpFrom:  smtpFrom  || null,
    }
    updateMutation.mutate(payload)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-2xl text-on-surface-variant">
        <span className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin mr-sm" />
        Loading settings…
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-lg text-error flex items-center gap-sm">
        <MaterialIcon name="error_outline" size={20} />
        Failed to load settings.
      </div>
    )
  }

  return (
    <div className="p-lg space-y-lg">
      <div>
        <h1 className="text-headline-md font-headline font-bold text-on-surface">Platform Settings</h1>
        <p className="text-body-sm text-on-surface-variant mt-xs">
          Global configuration for the SaaS platform
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-lg">
        {/* ── General ───────────────────────────────────────────────────── */}
        <section className="bg-surface rounded-lg shadow-lvl1 p-lg space-y-md">
          <h2 className="text-headline-xs font-headline font-bold text-on-surface">General</h2>

          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="app-name">
                App Name
              </label>
              <input
                id="app-name"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
              />
            </div>
            <div>
              <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="base-url">
                Base URL
              </label>
              <input
                id="base-url"
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
                placeholder="https://anemal.app"
              />
            </div>
          </div>

          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="trial-days">
              Default Trial Days
            </label>
            <input
              id="trial-days"
              type="number"
              min={1}
              max={365}
              value={trialDays}
              onChange={(e) => setTrialDays(Number(e.target.value))}
              className="w-40 min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>
        </section>

        {/* ── Maintenance Mode ───────────────────────────────────────────── */}
        <section className="bg-surface rounded-lg shadow-lvl1 p-lg">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-headline-xs font-headline font-bold text-on-surface">Maintenance Mode</h2>
              <p className="text-body-sm text-on-surface-variant mt-xs">
                When on, clinic users see a maintenance notice. Platform console remains accessible.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !maintenanceMode
                setMaintenanceMode(next)
                updateMutation.mutate({ maintenanceMode: next })
              }}
              className={`relative min-w-[52px] h-7 rounded-full transition-colors ${maintenanceMode ? 'bg-error' : 'bg-outline'}`}
              aria-checked={maintenanceMode}
              role="switch"
              aria-label="Maintenance mode toggle"
            >
              <span
                className={`absolute top-0.5 w-6 h-6 rounded-full bg-surface shadow transition-transform ${maintenanceMode ? 'translate-x-6' : 'translate-x-0.5'}`}
              />
            </button>
          </div>
          {maintenanceMode && (
            <div className="mt-md flex items-center gap-sm p-md bg-error/10 rounded border border-error/20">
              <MaterialIcon name="warning" size={18} className="text-error" />
              <span className="text-body-sm text-error font-medium">
                Maintenance mode is ON — all clinic logins are blocked
              </span>
            </div>
          )}
        </section>

        {/* ── SMTP ──────────────────────────────────────────────────────── */}
        <section className="bg-surface rounded-lg shadow-lvl1 p-lg space-y-md">
          <h2 className="text-headline-xs font-headline font-bold text-on-surface">SMTP (Platform Email)</h2>

          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="smtp-host">
                SMTP Host
              </label>
              <input
                id="smtp-host"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
                placeholder="smtp.sendgrid.net"
              />
            </div>
            <div>
              <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="smtp-port">
                Port
              </label>
              <input
                id="smtp-port"
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
                placeholder="587"
              />
            </div>
            <div>
              <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="smtp-user">
                Username
              </label>
              <input
                id="smtp-user"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
              />
            </div>
            <div>
              <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="smtp-from">
                From Address
              </label>
              <input
                id="smtp-from"
                type="email"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
                placeholder="no-reply@anemal.app"
              />
            </div>
          </div>
        </section>

        {/* ── Save bar ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-md">
          {updateMutation.isSuccess && (
            <span className="text-body-sm text-success flex items-center gap-xs">
              <MaterialIcon name="check_circle" size={16} />
              Saved
            </span>
          )}
          {updateMutation.error && (
            <span className="text-body-sm text-error">{getErrorMessage(updateMutation.error, 'Save failed. Please try again.')}</span>
          )}
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="flex items-center gap-sm min-h-[44px] px-md bg-primary text-on-primary rounded text-body-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {updateMutation.isPending && (
              <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
            )}
            <MaterialIcon name="save" size={18} />
            Save Settings
          </button>
        </div>
      </form>
    </div>
  )
}
