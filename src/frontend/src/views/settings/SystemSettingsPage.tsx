import React, { useState, useEffect } from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { useAuthStore } from '../../store/authStore'
import {
  useSystemSettings,
  useUpdateSystemSetting,
  useTestSmtp,
} from '../../hooks/useSystemSettings'

interface PlatformForm {
  appName:         string
  baseUrl:         string
  maintenanceMode: boolean
  trialDays:       string
}

interface SmtpForm {
  smtpHost:     string
  smtpPort:     string
  smtpUser:     string
  smtpPassword: string
}

const MASK_PREFIX = '••••'

export default function SystemSettingsPage(): React.ReactElement {
  // All hooks must be called before any early return (Rules of Hooks)
  const { data, isLoading } = useSystemSettings()
  const updateSetting = useUpdateSystemSetting()
  const testSmtp = useTestSmtp()
  const role = useAuthStore(s => s.role)

  const [open, setOpen] = useState({ platform: false, smtp: false, flags: false })
  const [platform, setPlatform] = useState<PlatformForm>({
    appName: '', baseUrl: '', maintenanceMode: false, trialDays: '',
  })
  const [smtp, setSmtp] = useState<SmtpForm>({
    smtpHost: '', smtpPort: '587', smtpUser: '', smtpPassword: '',
  })
  const [platformSaved, setPlatformSaved] = useState(false)
  const [smtpSaved, setSmtpSaved]         = useState(false)
  const [showSmtpPass, setShowSmtpPass]   = useState(false)
  const [testLoading, setTestLoading]     = useState<'smtp' | null>(null)
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message?: string } | null>(null)

  function toggle(k: keyof typeof open): void {
    setOpen(p => ({ ...p, [k]: !p[k] }))
  }

  useEffect(() => {
    if (!data) return
    const get = (k: string): string => data.find(r => r.key === k)?.value ?? ''
    setPlatform({
      appName:         get('app_name'),
      baseUrl:         get('app_base_url'),
      maintenanceMode: get('maintenance_mode') === 'true',
      trialDays:       get('default_trial_days'),
    })
    setSmtp({
      smtpHost:     get('smtp_host'),
      smtpPort:     get('smtp_port') || '587',
      smtpUser:     get('smtp_user'),
      smtpPassword: get('smtp_password'),
    })
  }, [data])

  async function handleSavePlatform(): Promise<void> {
    const fields: Array<[string, string]> = [
      ['app_name',           platform.appName],
      ['app_base_url',       platform.baseUrl],
      ['maintenance_mode',   String(platform.maintenanceMode)],
      ['default_trial_days', platform.trialDays],
    ]
    try {
      for (const [key, value] of fields) {
        if (value.startsWith(MASK_PREFIX)) continue
        await updateSetting.mutateAsync({ key, value })
      }
      setPlatformSaved(true)
      setTimeout(() => setPlatformSaved(false), 2500)
    } catch {
      // error displayed via updateSetting.error
    }
  }

  async function handleSaveSmtp(): Promise<void> {
    const fields: Array<[string, string]> = [
      ['smtp_host',     smtp.smtpHost],
      ['smtp_port',     smtp.smtpPort],
      ['smtp_user',     smtp.smtpUser],
      ['smtp_password', smtp.smtpPassword],
    ]
    try {
      for (const [key, value] of fields) {
        if (value.startsWith(MASK_PREFIX)) continue
        await updateSetting.mutateAsync({ key, value })
      }
      setSmtpSaved(true)
      setTimeout(() => setSmtpSaved(false), 2500)
    } catch {
      // error displayed via updateSetting.error
    }
  }

  async function handleTestSmtp(): Promise<void> {
    setTestLoading('smtp')
    setSmtpTestResult(null)
    try {
      const res = await testSmtp.mutateAsync()
      setSmtpTestResult({ success: res.success, message: res.message })
    } catch (e) {
      setSmtpTestResult({ success: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setTestLoading(null)
    }
  }

  // Access guard — rendered after hooks to satisfy Rules of Hooks
  if (role !== 'superadmin') return (
    <div className="max-w-2xl mx-auto p-xl">
      <div className="bg-surface rounded-2xl border border-outline-variant p-xl flex flex-col items-center gap-md text-center">
        <MaterialIcon name="lock" size={40} className="text-on-surface-variant" />
        <h1 className="text-headline-sm font-headline text-on-surface">Access Denied</h1>
        <p className="text-body-md text-on-surface-variant">
          System Settings are only available to superadmin users.
        </p>
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto p-xl flex flex-col gap-lg">
      <h1 className="text-headline-md font-headline text-on-surface">System Settings</h1>

      {/* Loading spinner */}
      {isLoading && (
        <div className="p-xl flex items-center gap-sm text-on-surface-variant">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-body-md">Loading…</span>
        </div>
      )}

      {/* Accordion A — Platform Settings */}
      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <button
          type="button"
          onClick={() => toggle('platform')}
          className="w-full flex items-center justify-between px-lg min-h-[44px] hover:bg-surface-container-low transition-colors"
        >
          <div className="flex items-center gap-md">
            <MaterialIcon name="tune" size={22} className="text-on-surface-variant" />
            <span className="text-title-md font-medium text-on-surface">Platform Settings</span>
          </div>
          <MaterialIcon
            name={open.platform ? 'expand_less' : 'expand_more'}
            size={22}
            className="text-on-surface-variant"
          />
        </button>

        {open.platform && (
          <div className="px-lg pb-lg pt-md flex flex-col gap-md border-t border-outline-variant">
            {/* App Name */}
            <div className="flex flex-col gap-xs">
              <label className="text-label-md text-on-surface-variant">App Name</label>
              <input
                type="text"
                value={platform.appName}
                onChange={e => setPlatform(p => ({ ...p, appName: e.target.value }))}
                className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
              />
            </div>

            {/* Base URL */}
            <div className="flex flex-col gap-xs">
              <label className="text-label-md text-on-surface-variant">Base URL</label>
              <input
                type="url"
                value={platform.baseUrl}
                onChange={e => setPlatform(p => ({ ...p, baseUrl: e.target.value }))}
                className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
              />
            </div>

            {/* Maintenance Mode toggle */}
            <div className="flex items-center justify-between">
              <span className="text-body-md text-on-surface">Maintenance Mode</span>
              <button
                type="button"
                onClick={() => setPlatform(p => ({ ...p, maintenanceMode: !p.maintenanceMode }))}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors
                  ${platform.maintenanceMode
                    ? 'bg-primary text-surface'
                    : 'bg-surface-container-low text-on-surface-variant border border-outline-variant'}`}
                aria-label="Toggle maintenance mode"
                aria-pressed={platform.maintenanceMode}
              >
                <MaterialIcon name={platform.maintenanceMode ? 'toggle_on' : 'toggle_off'} size={24} />
              </button>
            </div>

            {/* Trial Days */}
            <div className="flex flex-col gap-xs">
              <label className="text-label-md text-on-surface-variant">Default Trial Days</label>
              <input
                type="number"
                min="0"
                value={platform.trialDays}
                onChange={e => setPlatform(p => ({ ...p, trialDays: e.target.value }))}
                className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
              />
            </div>

            {/* Platform saved banner */}
            {platformSaved && (
              <div className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-secondary flex items-center gap-sm">
                <MaterialIcon name="check_circle" size={18} />
                Changes saved successfully
              </div>
            )}

            {/* Platform error banner */}
            {updateSetting.error && (
              <div className="px-md py-sm bg-error/10 border border-error/30 rounded-xl text-body-md text-error">
                Failed to save: {(updateSetting.error as Error).message}
              </div>
            )}

            {/* Platform Save button */}
            <button
              type="button"
              onClick={handleSavePlatform}
              disabled={updateSetting.isPending}
              className="min-h-[44px] min-w-[44px] px-xl bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 disabled:opacity-50 self-end"
            >
              {updateSetting.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* Accordion B — Email / SMTP */}
      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <button
          type="button"
          onClick={() => toggle('smtp')}
          className="w-full flex items-center justify-between px-lg min-h-[44px] hover:bg-surface-container-low transition-colors"
        >
          <div className="flex items-center gap-md">
            <MaterialIcon name="mail" size={22} className="text-on-surface-variant" />
            <span className="text-title-md font-medium text-on-surface">Email / SMTP</span>
          </div>
          <MaterialIcon
            name={open.smtp ? 'expand_less' : 'expand_more'}
            size={22}
            className="text-on-surface-variant"
          />
        </button>

        {open.smtp && (
          <div className="px-lg pb-lg pt-md flex flex-col gap-md border-t border-outline-variant">
            {/* SMTP Host */}
            <div className="flex flex-col gap-xs">
              <label className="text-label-md text-on-surface-variant">SMTP Host</label>
              <input
                type="text"
                value={smtp.smtpHost}
                onChange={e => setSmtp(p => ({ ...p, smtpHost: e.target.value }))}
                placeholder="smtp.example.com"
                className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
              />
            </div>

            {/* SMTP Port */}
            <div className="flex flex-col gap-xs">
              <label className="text-label-md text-on-surface-variant">SMTP Port</label>
              <input
                type="number"
                value={smtp.smtpPort}
                onChange={e => setSmtp(p => ({ ...p, smtpPort: e.target.value }))}
                className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
              />
            </div>

            {/* SMTP User */}
            <div className="flex flex-col gap-xs">
              <label className="text-label-md text-on-surface-variant">SMTP User</label>
              <input
                type="text"
                value={smtp.smtpUser}
                onChange={e => setSmtp(p => ({ ...p, smtpUser: e.target.value }))}
                className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
              />
            </div>

            {/* SMTP Password — masked */}
            <div className="flex flex-col gap-xs">
              <label className="text-label-md text-on-surface-variant">SMTP Password</label>
              <div className="relative">
                <input
                  type={showSmtpPass ? 'text' : 'password'}
                  value={smtp.smtpPassword}
                  onChange={e => setSmtp(p => ({ ...p, smtpPassword: e.target.value }))}
                  placeholder="SMTP password"
                  className="min-h-[44px] px-md pr-14 border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
                />
                <button
                  type="button"
                  onClick={() => setShowSmtpPass(v => !v)}
                  className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface"
                  aria-label={showSmtpPass ? 'Hide password' : 'Show password'}
                >
                  <MaterialIcon name={showSmtpPass ? 'visibility_off' : 'visibility'} size={20} />
                </button>
              </div>
            </div>

            {/* Test SMTP button */}
            <button
              type="button"
              onClick={handleTestSmtp}
              disabled={testLoading === 'smtp'}
              className="min-h-[44px] min-w-[44px] px-lg border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50 transition-colors self-start"
            >
              {testLoading === 'smtp' ? 'Testing…' : 'Test SMTP Connection'}
            </button>

            {/* SMTP test result — directly below test button */}
            {smtpTestResult && (
              <div className={`px-md py-sm rounded-xl text-body-md flex items-center gap-sm border
                ${smtpTestResult.success
                  ? 'bg-surface-container-low border-outline-variant text-secondary'
                  : 'bg-error/10 border-error/30 text-error'}`}>
                <MaterialIcon name={smtpTestResult.success ? 'check_circle' : 'error'} size={18} />
                {smtpTestResult.message ?? (smtpTestResult.success ? 'SMTP connection successful' : 'SMTP connection failed')}
              </div>
            )}

            {/* SMTP saved banner */}
            {smtpSaved && (
              <div className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-secondary flex items-center gap-sm">
                <MaterialIcon name="check_circle" size={18} />
                Changes saved successfully
              </div>
            )}

            {/* SMTP error banner */}
            {updateSetting.error && (
              <div className="px-md py-sm bg-error/10 border border-error/30 rounded-xl text-body-md text-error">
                Failed to save: {(updateSetting.error as Error).message}
              </div>
            )}

            {/* SMTP Save button */}
            <button
              type="button"
              onClick={handleSaveSmtp}
              disabled={updateSetting.isPending}
              className="min-h-[44px] min-w-[44px] px-xl bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 disabled:opacity-50 self-end"
            >
              {updateSetting.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* Accordion C — Feature Flags */}
      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <button
          type="button"
          onClick={() => toggle('flags')}
          className="w-full flex items-center justify-between px-lg min-h-[44px] hover:bg-surface-container-low transition-colors"
        >
          <div className="flex items-center gap-md">
            <MaterialIcon name="flag" size={22} className="text-on-surface-variant" />
            <span className="text-title-md font-medium text-on-surface">Feature Flags</span>
          </div>
          <MaterialIcon
            name={open.flags ? 'expand_less' : 'expand_more'}
            size={22}
            className="text-on-surface-variant"
          />
        </button>

        {open.flags && (
          <div className="px-lg pb-lg pt-md border-t border-outline-variant">
            <div className="bg-surface-container-low rounded-xl border border-outline-variant p-lg flex items-center gap-md opacity-60">
              <MaterialIcon name="flag" size={28} className="text-on-surface-variant flex-shrink-0" />
              <div>
                <p className="text-body-md font-medium text-on-surface">Feature Flag Management</p>
                <p className="text-label-md text-on-surface-variant">Coming soon — Phase 4</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
