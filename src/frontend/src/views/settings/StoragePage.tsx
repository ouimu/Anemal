import React, { useState, useEffect } from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { useStorageConfig, useUpdateStorageConfig, type StorageConfigInput } from '../../hooks/useStorageConfig'
import { getErrorMessage } from '../../utils/errorMessage'

function getErrorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { code?: string } } })?.response?.data?.code
}

interface StorageForm {
  provider: 'local' | 'custom_path'
  smbHost: string
  smbShare: string
  smbUsername: string
  smbPassword: string
}

const EMPTY_FORM: StorageForm = { provider: 'local', smbHost: '', smbShare: '', smbUsername: '', smbPassword: '' }

export default function StoragePage(): React.ReactElement {
  const { data, isLoading } = useStorageConfig()
  const update = useUpdateStorageConfig()

  const [form, setForm] = useState<StorageForm>(EMPTY_FORM)
  const [editingPassword, setEditingPassword] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!data) return
    setForm({
      provider: data.provider,
      smbHost: data.smbHost ?? '',
      smbShare: data.smbShare ?? '',
      smbUsername: data.smbUsername ?? '',
      smbPassword: '',
    })
    setEditingPassword(!data.configured)
  }, [data])

  function buildPayload(confirmBaseChange?: boolean): StorageConfigInput {
    if (form.provider === 'local') return { provider: 'local', confirmBaseChange }
    const payload: StorageConfigInput = {
      provider: 'custom_path',
      smbHost: form.smbHost,
      smbShare: form.smbShare,
      smbUsername: form.smbUsername,
      confirmBaseChange,
    }
    if (editingPassword && form.smbPassword) payload.smbPassword = form.smbPassword
    return payload
  }

  async function handleSave(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    try {
      await update.mutateAsync(buildPayload())
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      if (getErrorCode(err) === 'STORAGE_SWITCH_CONFIRMATION_REQUIRED') setConfirmOpen(true)
    }
  }

  async function handleConfirmSwitch(): Promise<void> {
    setConfirmOpen(false)
    try {
      await update.mutateAsync(buildPayload(true))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      // error displayed via update.error below
    }
  }

  const errorCode = getErrorCode(update.error)
  const fieldError = (field: 'smbHost' | 'smbUsername'): string | null => {
    if (field === 'smbHost' && errorCode === 'SMB_HOST_UNREACHABLE') return 'Cannot reach this host — check the address and that the server can reach the share.'
    if (field === 'smbHost' && errorCode === 'SMB_SHARE_NOT_FOUND') return 'Share not found on that host — check the share name.'
    if (field === 'smbUsername' && errorCode === 'SMB_AUTH_REJECTED') return 'Username or password was rejected.'
    return null
  }
  const genericError = update.error && !errorCode?.startsWith('SMB_') && errorCode !== 'STORAGE_SWITCH_CONFIRMATION_REQUIRED'
    ? getErrorMessage(update.error, 'Please try again.')
    : null

  if (isLoading) return (
    <div className="p-xl flex items-center gap-sm text-on-surface-variant">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-body-md">Loading…</span>
    </div>
  )

  return (
    <form onSubmit={handleSave} className="max-w-5xl mx-auto p-6 flex flex-col gap-lg">
      <h1 className="text-headline-md font-headline text-on-surface">Storage</h1>

      {saved && (
        <div className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-secondary flex items-center gap-sm">
          <MaterialIcon name="check_circle" size={18} />
          Changes saved successfully
        </div>
      )}

      {genericError && (
        <div className="px-md py-sm bg-error/10 border border-error/30 rounded-xl text-body-md text-error">
          Failed to save: {genericError}
        </div>
      )}

      <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md">
        <h2 className="text-title-md font-medium text-on-surface">File storage location</h2>
        <p className="text-body-md text-on-surface-variant">
          Where pet photos and EMR attachments are saved. Files already uploaded stay at their current
          location and are not moved automatically when you switch.
        </p>

        <div className="flex flex-col gap-sm">
          <label className="flex items-center gap-sm min-h-[44px] cursor-pointer">
            <input
              type="radio"
              name="storage-provider"
              checked={form.provider === 'local'}
              onChange={() => setForm(p => ({ ...p, provider: 'local' }))}
              className="w-5 h-5"
            />
            <span className="text-body-md text-on-surface">Local (default)</span>
          </label>
          <label className="flex items-center gap-sm min-h-[44px] cursor-pointer">
            <input
              type="radio"
              name="storage-provider"
              checked={form.provider === 'custom_path'}
              onChange={() => setForm(p => ({ ...p, provider: 'custom_path' }))}
              className="w-5 h-5"
            />
            <span className="text-body-md text-on-surface">Network share</span>
          </label>
        </div>

        {form.provider === 'custom_path' && (
          <div className="flex flex-col gap-md pl-lg border-l-2 border-outline-variant">
            <div className="flex flex-col gap-xs">
              <label htmlFor="smb-host" className="text-label-md text-on-surface-variant">Host / IP address</label>
              <input
                id="smb-host"
                type="text"
                value={form.smbHost}
                onChange={e => setForm(p => ({ ...p, smbHost: e.target.value }))}
                placeholder="192.168.1.10"
                className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
              />
              <p className="text-label-md text-on-surface-variant">
                Evaluated on the clinic server, not your PC — use the share's network address, not a locally mapped drive letter.
              </p>
              {fieldError('smbHost') && <p className="text-label-md text-error">{fieldError('smbHost')}</p>}
            </div>

            <div className="flex flex-col gap-xs">
              <label htmlFor="smb-share" className="text-label-md text-on-surface-variant">Share name</label>
              <input
                id="smb-share"
                type="text"
                value={form.smbShare}
                onChange={e => setForm(p => ({ ...p, smbShare: e.target.value }))}
                placeholder="vetfiles"
                className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
              />
            </div>

            <div className="flex flex-col gap-xs">
              <label htmlFor="smb-username" className="text-label-md text-on-surface-variant">Username</label>
              <input
                id="smb-username"
                type="text"
                value={form.smbUsername}
                onChange={e => setForm(p => ({ ...p, smbUsername: e.target.value }))}
                className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
              />
              {fieldError('smbUsername') && <p className="text-label-md text-error">{fieldError('smbUsername')}</p>}
            </div>

            <div className="flex flex-col gap-xs">
              <label htmlFor="smb-password" className="text-label-md text-on-surface-variant">Password</label>
              {!editingPassword ? (
                <div className="flex items-center gap-sm">
                  <span className="min-h-[44px] px-md flex items-center border border-outline-variant rounded-xl text-body-md text-on-surface-variant bg-surface-container-low flex-1">
                    Connected — password saved
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingPassword(true)}
                    className="min-h-[44px] min-w-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <input
                  id="smb-password"
                  type="password"
                  value={form.smbPassword}
                  onChange={e => setForm(p => ({ ...p, smbPassword: e.target.value }))}
                  className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 bg-background pt-sm pb-md flex items-center justify-end border-t border-outline-variant">
        <button
          type="submit"
          disabled={update.isPending}
          className="min-h-[44px] min-w-[44px] px-xl bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-lg">
          <div className="bg-surface rounded-2xl p-lg max-w-md w-full flex flex-col gap-md">
            <h3 className="text-title-md font-medium text-on-surface">Change storage location?</h3>
            <p className="text-body-md text-on-surface-variant">
              Files already uploaded will stay at their current location and won't be visible at the new
              location until moved there manually. Backing them up is now your clinic's responsibility.
            </p>
            <div className="flex justify-end gap-sm">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="min-h-[44px] px-lg border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSwitch}
                className="min-h-[44px] px-lg bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
