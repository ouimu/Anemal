import React, { useState, useEffect } from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { useAuthStore } from '../../store/authStore'
import {
  useNotificationsSettings,
  useUpdateNotifications,
  useTestNotifications,
  type NotificationsInput,
} from '../../hooks/useNotificationsSettings'
import { getErrorMessage } from '../../utils/errorMessage'

// Reminder on/off flags (sms/lineRemindersEnabled) deliberately live on the
// appointment settings page, not here — this page owns provider credentials only.
interface NotificationsForm {
  lineOaToken: string
  smsProvider: 'thaibulksms' | 'thsms' | ''
  smsApiKey: string
  smsSenderName: string
}

const EMPTY_FORM: NotificationsForm = {
  lineOaToken: '',
  smsProvider: '',
  smsApiKey: '',
  smsSenderName: '',
}

export default function NotificationsPage() {
  const { data, isLoading } = useNotificationsSettings()
  const update = useUpdateNotifications()
  const testNotifications = useTestNotifications()
  const userId = useAuthStore(s => s.userId)

  const [form, setForm] = useState<NotificationsForm>(EMPTY_FORM)
  const [saved, setSaved] = useState(false)
  const [showLineToken, setShowLineToken] = useState(false)
  const [showSmsApiKey, setShowSmsApiKey] = useState(false)
  const [testResult, setTestResult] = useState<{
    channel: 'line' | 'sms'
    status: string
    message: string
  } | null>(null)
  const [testLoading, setTestLoading] = useState<'line' | 'sms' | null>(null)

  useEffect(() => {
    if (!data) return
    setForm({
      lineOaToken: data.lineOaToken ?? '',
      smsProvider: (data.smsProvider ?? '') as 'thaibulksms' | 'thsms' | '',
      smsApiKey: data.smsApiKey ?? '',
      smsSenderName: data.smsSenderName ?? '',
    })
  }, [data])

  async function handleTest(channel: 'line' | 'sms') {
    setTestLoading(channel)
    setTestResult(null)
    try {
      const res = await testNotifications.mutateAsync({ channel })
      setTestResult({ channel, status: res.status, message: res.message })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setTestResult({ channel, status: 'error', message: msg })
    } finally {
      setTestLoading(null)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const MASK_PREFIX = '••••'
    const payload: NotificationsInput = {
      smsProvider:   form.smsProvider,
      smsSenderName: form.smsSenderName,
    }
    if (!form.lineOaToken.startsWith(MASK_PREFIX)) payload.lineOaToken = form.lineOaToken
    if (!form.smsApiKey.startsWith(MASK_PREFIX))   payload.smsApiKey   = form.smsApiKey
    try {
      await update.mutateAsync(payload)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      // error displayed via update.error
    }
  }

  const lastUpdated = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    : null
  const byYou = data?.updatedBy != null && data.updatedBy === userId

  if (isLoading) return (
    <div className="p-xl flex items-center gap-sm text-on-surface-variant">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-body-md">Loading…</span>
    </div>
  )

  return (
    <form onSubmit={handleSave} className="max-w-5xl mx-auto p-6 flex flex-col gap-lg">
      <h1 className="text-headline-md font-headline text-on-surface">Notifications</h1>

      {/* Encryption warning banner */}
      <div className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-on-surface flex items-center gap-sm">
        <MaterialIcon name="lock" size={18} />
        API keys are encrypted before storage
      </div>

      {/* Success banner */}
      {saved && (
        <div className="mb-md px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-secondary flex items-center gap-sm">
          <MaterialIcon name="check_circle" size={18} />
          Changes saved successfully
        </div>
      )}

      {/* Error banner */}
      {update.error && (
        <div className="mb-md px-md py-sm bg-error/10 border border-error/30 rounded-xl text-body-md text-error">
          Failed to save: {getErrorMessage(update.error, 'Please try again.')}
        </div>
      )}

      {/* Test result banner */}
      {testResult && (
        <div className={`px-md py-sm rounded-xl text-body-md flex items-center gap-sm border
          ${testResult.status === 'success'
            ? 'bg-surface-container-low border-outline-variant text-secondary'
            : 'bg-error/10 border-error/30 text-error'}`}>
          <MaterialIcon
            name={testResult.status === 'success' ? 'check_circle' : 'error'}
            size={18}
          />
          {testResult.channel === 'line' ? 'LINE' : 'SMS'}: {testResult.message}
        </div>
      )}

      {/* LINE OA section */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md">
        <h2 className="text-title-md font-medium text-on-surface">LINE OA</h2>

        {/* LINE OA Token */}
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant">LINE OA Channel Access Token</label>
          <div className="relative">
            <input
              type={showLineToken ? 'text' : 'password'}
              value={form.lineOaToken}
              onChange={e => setForm(p => ({ ...p, lineOaToken: e.target.value }))}
              placeholder="Paste your LINE OA token"
              className="min-h-[44px] px-md pr-14 border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
            />
            <button
              type="button"
              onClick={() => setShowLineToken(v => !v)}
              className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface"
              aria-label={showLineToken ? 'Hide token' : 'Show token'}
            >
              <MaterialIcon name={showLineToken ? 'visibility_off' : 'visibility'} size={20} />
            </button>
          </div>
        </div>

        {/* Test LINE button */}
        <button
          type="button"
          onClick={() => handleTest('line')}
          disabled={testLoading === 'line'}
          className="min-h-[44px] min-w-[44px] px-lg border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50 transition-colors self-start"
        >
          {testLoading === 'line' ? 'Testing…' : 'Send Test Message'}
        </button>
      </div>

      {/* SMS section */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md">
        <h2 className="text-title-md font-medium text-on-surface">SMS</h2>

        {/* SMS Provider */}
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant">SMS Provider</label>
          <select
            value={form.smsProvider}
            onChange={e => setForm(p => ({
              ...p,
              smsProvider: e.target.value as 'thaibulksms' | 'thsms' | '',
            }))}
            className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
          >
            <option value="">Disabled</option>
            <option value="thaibulksms">ThaiBulkSMS</option>
            <option value="thsms">THSMS</option>
          </select>
        </div>

        {/* SMS API Key */}
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant">SMS API Key</label>
          <div className="relative">
            <input
              type={showSmsApiKey ? 'text' : 'password'}
              value={form.smsApiKey}
              onChange={e => setForm(p => ({ ...p, smsApiKey: e.target.value }))}
              placeholder="Paste your SMS API key"
              className="min-h-[44px] px-md pr-14 border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
            />
            <button
              type="button"
              onClick={() => setShowSmsApiKey(v => !v)}
              className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface"
              aria-label={showSmsApiKey ? 'Hide API key' : 'Show API key'}
            >
              <MaterialIcon name={showSmsApiKey ? 'visibility_off' : 'visibility'} size={20} />
            </button>
          </div>
        </div>

        {/* SMS Sender Name */}
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant">Sender Name</label>
          <input
            type="text"
            value={form.smsSenderName}
            onChange={e => setForm(p => ({ ...p, smsSenderName: e.target.value }))}
            placeholder="e.g. ClinicName"
            className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
          />
        </div>

        {/* Test SMS button */}
        <button
          type="button"
          onClick={() => handleTest('sms')}
          disabled={testLoading === 'sms'}
          className="min-h-[44px] min-w-[44px] px-lg border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50 transition-colors self-start"
        >
          {testLoading === 'sms' ? 'Testing…' : 'Send Test Message'}
        </button>
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 bg-background pt-sm pb-md flex items-center justify-between border-t border-outline-variant">
        <p className="text-label-md text-on-surface-variant">
          {lastUpdated
            ? `Last updated: ${lastUpdated}${byYou ? ' · by you' : ''}`
            : 'Never saved'}
        </p>
        <button
          type="submit"
          disabled={update.isPending}
          className="min-h-[44px] min-w-[44px] px-xl bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
