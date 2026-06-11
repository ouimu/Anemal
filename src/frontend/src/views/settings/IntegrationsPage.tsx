import React, { useState, useEffect } from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { useAuthStore } from '../../store/authStore'
import {
  useIntegrationsSettings,
  useUpdateIntegrations,
  useTestIntegrations,
  type IntegrationsInput,
} from '../../hooks/useIntegrationsSettings'

interface IntegrationsForm {
  labApiUrl: string
  labApiKey: string
}

const MASK_PREFIX = '••••'

export default function IntegrationsPage(): React.ReactElement {
  const { data, isLoading } = useIntegrationsSettings()
  const update = useUpdateIntegrations()
  const testIntegrations = useTestIntegrations()
  const userId = useAuthStore(s => s.userId)

  const [form, setForm] = useState<IntegrationsForm>({ labApiUrl: '', labApiKey: '' })
  const [saved, setSaved] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [testLoading, setTestLoading] = useState<'lab' | null>(null)
  const [testResult, setTestResult] = useState<{ success: boolean; detail?: string } | null>(null)

  useEffect(() => {
    if (!data) return
    setForm({
      labApiUrl: data.labApiUrl ?? '',
      labApiKey: data.labApiKey ?? '',
    })
  }, [data])

  async function handleTestLab(): Promise<void> {
    setTestLoading('lab')
    setTestResult(null)
    try {
      const res = await testIntegrations.mutateAsync()
      setTestResult({ success: res.success, detail: res.detail })
    } catch (e) {
      setTestResult({ success: false, detail: e instanceof Error ? e.message : String(e) })
    } finally {
      setTestLoading(null)
    }
  }

  async function handleSave(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const payload: IntegrationsInput = { labApiUrl: form.labApiUrl }
    if (!form.labApiKey.startsWith(MASK_PREFIX)) payload.labApiKey = form.labApiKey
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
    <form onSubmit={handleSave} className="max-w-2xl mx-auto p-xl flex flex-col gap-lg">
      <h1 className="text-headline-md font-headline text-on-surface">Integrations</h1>

      {/* Encryption banner */}
      <div className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-on-surface flex items-center gap-sm">
        <MaterialIcon name="lock" size={18} />
        API keys are encrypted before storage
      </div>

      {/* Success banner */}
      {saved && (
        <div className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-secondary flex items-center gap-sm">
          <MaterialIcon name="check_circle" size={18} />
          Changes saved successfully
        </div>
      )}

      {/* Error banner */}
      {update.error && (
        <div className="px-md py-sm bg-error/10 border border-error/30 rounded-xl text-body-md text-error">
          Failed to save: {(update.error as Error).message}
        </div>
      )}

      {/* Test result banner */}
      {testResult && (
        <div className={`px-md py-sm rounded-xl text-body-md flex items-center gap-sm border
          ${testResult.success
            ? 'bg-surface-container-low border-outline-variant text-secondary'
            : 'bg-error/10 border-error/30 text-error'}`}>
          <MaterialIcon name={testResult.success ? 'check_circle' : 'error'} size={18} />
          Test connection: {testResult.detail ?? (testResult.success ? 'Connected successfully' : 'Connection failed')}
        </div>
      )}

      {/* Lab API card */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md">
        <h2 className="text-title-md font-medium text-on-surface">Lab API</h2>

        {/* Lab API Base URL */}
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant">Lab API Base URL</label>
          <input
            type="url"
            value={form.labApiUrl}
            onChange={e => setForm(p => ({ ...p, labApiUrl: e.target.value }))}
            placeholder="https://lab.example.com/api"
            className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
          />
        </div>

        {/* Lab API Key — masked */}
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant">Lab API Key</label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={form.labApiKey}
              onChange={e => setForm(p => ({ ...p, labApiKey: e.target.value }))}
              placeholder="Paste your Lab API key"
              className="min-h-[44px] px-md pr-14 border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(v => !v)}
              className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface"
              aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
            >
              <MaterialIcon name={showApiKey ? 'visibility_off' : 'visibility'} size={20} />
            </button>
          </div>
        </div>

        {/* Test Connection button */}
        <button
          type="button"
          onClick={handleTestLab}
          disabled={testLoading === 'lab'}
          className="min-h-[44px] min-w-[44px] px-lg border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50 transition-colors self-start"
        >
          {testLoading === 'lab' ? 'Testing…' : 'Test Connection'}
        </button>
      </div>

      {/* X-ray / DICOM Viewer placeholder */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex items-center gap-md opacity-60">
        <MaterialIcon name="radiology" size={28} className="text-on-surface-variant flex-shrink-0" />
        <div>
          <p className="text-body-md font-medium text-on-surface">X-ray / DICOM Viewer</p>
          <p className="text-label-md text-on-surface-variant">Coming soon — Phase 4</p>
        </div>
      </div>

      {/* Accounting Software placeholder */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex items-center gap-md opacity-60">
        <MaterialIcon name="receipt_long" size={28} className="text-on-surface-variant flex-shrink-0" />
        <div>
          <p className="text-body-md font-medium text-on-surface">Accounting Software</p>
          <p className="text-label-md text-on-surface-variant">Coming soon — Phase 4</p>
        </div>
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
