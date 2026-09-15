import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Dialog from '../../components/Dialog'
import MaterialIcon from '../../components/MaterialIcon'
import { useStorageConfig, useUpdateStorageConfig, useGoogleAuthorize, useOneDriveAuthorize, type StorageConfigInput } from '../../hooks/useStorageConfig'
import { getErrorMessage } from '../../utils/errorMessage'

function getErrorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { code?: string } } })?.response?.data?.code
}

// Maps the OAuth callback's ?error= query param (design §"Error Handling") to
// copy a non-technical clinic admin can act on — every callback failure path
// redirects here with one of these codes, never a silent no-op.
const GOOGLE_OAUTH_ERROR_MESSAGES: Record<string, string> = {
  google_consent_denied:  'Google sign-in was cancelled — try again if you want to connect Google Drive.',
  google_state_invalid:   'That Google sign-in link was invalid or expired — try connecting again.',
  google_state_replayed:  'That Google sign-in link was already used — try connecting again.',
  google_not_authorized:  'Your account no longer has permission to connect Google Drive — ask an admin to try again.',
  google_not_configured:  'Google Drive connection is not configured on this server yet.',
  google_connect_failed:  'Could not connect to Google Drive — please try again.',
}

const ONEDRIVE_OAUTH_ERROR_MESSAGES: Record<string, string> = {
  onedrive_consent_denied:   'Microsoft sign-in was cancelled — try again if you want to connect OneDrive.',
  onedrive_consent_required: 'Your Microsoft administrator needs to approve Anemal before this account can connect — ask your IT admin, then try again.',
  onedrive_state_invalid:    'That Microsoft sign-in link was invalid or expired — try connecting again.',
  onedrive_state_replayed:   'That Microsoft sign-in link was already used — try connecting again.',
  onedrive_not_authorized:   'Your account no longer has permission to connect OneDrive — ask an admin to try again.',
  onedrive_not_configured:   'OneDrive connection is not configured on this server yet.',
  onedrive_connect_failed:   'Could not connect to OneDrive — please try again.',
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = { ...GOOGLE_OAUTH_ERROR_MESSAGES, ...ONEDRIVE_OAUTH_ERROR_MESSAGES }

interface StorageForm {
  provider: 'local' | 'custom_path' | 'google_drive' | 'onedrive'
  smbHost: string
  smbShare: string
  smbUsername: string
  smbPassword: string
}

const EMPTY_FORM: StorageForm = { provider: 'local', smbHost: '', smbShare: '', smbUsername: '', smbPassword: '' }

export default function StoragePage(): React.ReactElement {
  const { data, isLoading } = useStorageConfig()
  const update = useUpdateStorageConfig()
  const googleAuthorize = useGoogleAuthorize()
  const onedriveAuthorize = useOneDriveAuthorize()
  const [searchParams, setSearchParams] = useSearchParams()
  const oauthErrorCode = searchParams.get('error')

  const [form, setForm] = useState<StorageForm>(EMPTY_FORM)
  const [editingPassword, setEditingPassword] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingSwitchAway, setPendingSwitchAway] = useState<'local' | 'custom_path' | null>(null)

  useEffect(() => {
    if (!data) return
    setForm({
      provider: data.provider,
      smbHost: data.smbHost ?? '',
      smbShare: data.smbShare ?? '',
      smbUsername: data.smbUsername ?? '',
      smbPassword: '',
    })
    // "Connected — password saved" only means something for an actually-saved
    // custom_path config — otherwise (never configured, or configured as
    // google_drive) there is no SMB password on file to describe as saved.
    setEditingPassword(!(data.provider === 'custom_path' && data.configured))
  }, [data])

  function buildPayload(provider: 'local' | 'custom_path', confirmBaseChange?: boolean): StorageConfigInput {
    if (provider === 'local') return { provider: 'local', confirmBaseChange }
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
    if (form.provider === 'google_drive' || form.provider === 'onedrive') return // cloud providers connect via OAuth, not this form's Save
    try {
      await update.mutateAsync(buildPayload(form.provider))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      if (getErrorCode(err) === 'STORAGE_SWITCH_CONFIRMATION_REQUIRED') { setPendingSwitchAway(form.provider); setConfirmOpen(true) }
    }
  }

  async function handleConnectGoogle(): Promise<void> {
    const { url } = await googleAuthorize.mutateAsync()
    window.location.href = url // leaves the app for Google's consent screen — full-page navigation, no popup
  }

  async function handleDisconnectGoogle(): Promise<void> {
    setPendingSwitchAway('local')
    setConfirmOpen(true)
  }

  async function handleConnectOneDrive(): Promise<void> {
    const { url } = await onedriveAuthorize.mutateAsync()
    window.location.href = url // leaves the app for Microsoft's consent screen — full-page navigation, no popup
  }

  async function handleDisconnectOneDrive(): Promise<void> {
    setPendingSwitchAway('local')
    setConfirmOpen(true)
  }

  async function handleConfirmSwitch(): Promise<void> {
    setConfirmOpen(false)
    const provider = pendingSwitchAway ?? 'local'
    try {
      await update.mutateAsync(buildPayload(provider, true))
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

      {oauthErrorCode && (
        <div className="px-md py-sm bg-error/10 border border-error/30 rounded-xl text-body-md text-error flex items-center justify-between gap-sm">
          <span>{OAUTH_ERROR_MESSAGES[oauthErrorCode] ?? (oauthErrorCode.startsWith('onedrive_') ? 'Could not connect to OneDrive — please try again.' : 'Could not connect to Google Drive — please try again.')}</span>
          <button type="button" onClick={() => setSearchParams({}, { replace: true })}
            className="min-h-[44px] min-w-[44px] px-sm text-error hover:opacity-70" aria-label="Dismiss">
            <MaterialIcon name="close" size={18} />
          </button>
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
            <input type="radio" name="storage-provider" checked={form.provider === 'local'}
              onChange={() => setForm(p => ({ ...p, provider: 'local' }))} className="w-5 h-5" />
            <span className="text-body-md text-on-surface">Local (default)</span>
          </label>
          <label className="flex items-center gap-sm min-h-[44px] cursor-pointer">
            <input type="radio" name="storage-provider" checked={form.provider === 'custom_path'}
              onChange={() => setForm(p => ({ ...p, provider: 'custom_path' }))} className="w-5 h-5" />
            <span className="text-body-md text-on-surface">Network share</span>
          </label>
          <label className="flex items-center gap-sm min-h-[44px] cursor-pointer">
            <input type="radio" name="storage-provider" checked={form.provider === 'google_drive'}
              onChange={() => setForm(p => ({ ...p, provider: 'google_drive' }))} className="w-5 h-5" />
            <span className="text-body-md text-on-surface">Google Drive</span>
          </label>
          <label className="flex items-center gap-sm min-h-[44px] cursor-pointer">
            <input type="radio" name="storage-provider" checked={form.provider === 'onedrive'}
              onChange={() => setForm(p => ({ ...p, provider: 'onedrive' }))} className="w-5 h-5" />
            <span className="text-body-md text-on-surface">Microsoft OneDrive</span>
          </label>
        </div>

        {form.provider === 'custom_path' && (
          <div className="flex flex-col gap-md pl-lg border-l-2 border-outline-variant">
            <div className="flex flex-col gap-xs">
              <label htmlFor="smb-host" className="text-label-md text-on-surface-variant">Host / IP address</label>
              <input id="smb-host" type="text" value={form.smbHost}
                onChange={e => setForm(p => ({ ...p, smbHost: e.target.value }))} placeholder="192.168.1.10"
                className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full" />
              <p className="text-label-md text-on-surface-variant">
                Evaluated on the clinic server, not your PC — use the share's network address, not a locally mapped drive letter.
              </p>
              {fieldError('smbHost') && <p className="text-label-md text-error">{fieldError('smbHost')}</p>}
            </div>
            <div className="flex flex-col gap-xs">
              <label htmlFor="smb-share" className="text-label-md text-on-surface-variant">Share name</label>
              <input id="smb-share" type="text" value={form.smbShare}
                onChange={e => setForm(p => ({ ...p, smbShare: e.target.value }))} placeholder="vetfiles"
                className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full" />
            </div>
            <div className="flex flex-col gap-xs">
              <label htmlFor="smb-username" className="text-label-md text-on-surface-variant">Username</label>
              <input id="smb-username" type="text" value={form.smbUsername}
                onChange={e => setForm(p => ({ ...p, smbUsername: e.target.value }))}
                className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full" />
              {fieldError('smbUsername') && <p className="text-label-md text-error">{fieldError('smbUsername')}</p>}
            </div>
            <div className="flex flex-col gap-xs">
              <label htmlFor="smb-password" className="text-label-md text-on-surface-variant">Password</label>
              {!editingPassword ? (
                <div className="flex items-center gap-sm">
                  <span className="min-h-[44px] px-md flex items-center border border-outline-variant rounded-xl text-body-md text-on-surface-variant bg-surface-container-low flex-1">
                    Connected — password saved
                  </span>
                  <button type="button" onClick={() => setEditingPassword(true)}
                    className="min-h-[44px] min-w-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low">
                    Change
                  </button>
                </div>
              ) : (
                <input id="smb-password" type="password" value={form.smbPassword}
                  onChange={e => setForm(p => ({ ...p, smbPassword: e.target.value }))}
                  className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full" />
              )}
            </div>
          </div>
        )}

        {form.provider === 'google_drive' && (
          <div className="flex flex-col gap-md pl-lg border-l-2 border-outline-variant">
            {/* BA finding G-3 — data-custody note, parity with the network-share/local switch-confirmation copy. */}
            <p className="text-body-md text-on-surface-variant">
              Files are stored in <strong>this Google account's</strong> Drive. If this account is lost or
              access is revoked, the clinic loses access to those files until reconnected.
            </p>
            {data?.provider === 'google_drive' && data.configured ? (
              <div className="flex items-center gap-sm">
                <span className={`w-2.5 h-2.5 rounded-full ${data.connected ? 'bg-secondary' : 'bg-error'}`} aria-hidden="true" />
                <span className="text-body-md text-on-surface">
                  {data.connected ? 'Connected' : 'Not connected — reconnect required'}
                </span>
                <button type="button" onClick={handleDisconnectGoogle}
                  className="ml-auto min-h-[44px] px-lg border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low">
                  Disconnect
                </button>
              </div>
            ) : (
              <button type="button" onClick={handleConnectGoogle} disabled={googleAuthorize.isPending}
                className="min-h-[44px] px-lg bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50 self-start">
                {googleAuthorize.isPending ? 'Connecting…' : 'Connect with Google'}
              </button>
            )}
          </div>
        )}

        {form.provider === 'onedrive' && (
          <div className="flex flex-col gap-md pl-lg border-l-2 border-outline-variant">
            <p className="text-body-md text-on-surface-variant">
              Files are stored in <strong>this Microsoft account's</strong> OneDrive. If this account is lost or
              access is removed, the clinic loses access to those files until reconnected.
            </p>
            <p className="text-body-md text-on-surface-variant">
              Work or school Microsoft accounts may require your organization's administrator to approve
              Anemal's access once before this will work.
            </p>
            {data?.provider === 'onedrive' && data.configured ? (
              <div className="flex flex-col gap-sm">
                <div className="flex items-center gap-sm">
                  <span className={`w-2.5 h-2.5 rounded-full ${data.connected ? 'bg-secondary' : 'bg-error'}`} aria-hidden="true" />
                  <span className="text-body-md text-on-surface">
                    {data.connected ? 'Connected' : 'Not connected — reconnect required'}
                  </span>
                  <button type="button" onClick={handleDisconnectOneDrive}
                    className="ml-auto min-h-[44px] px-lg border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low">
                    Disconnect
                  </button>
                </div>
                <p className="text-label-md text-on-surface-variant">
                  Disconnecting removes Anemal's access keys immediately, but the Anemal entry stays listed in
                  this Microsoft account's app permissions until removed there manually.
                </p>
              </div>
            ) : (
              <button type="button" onClick={handleConnectOneDrive} disabled={onedriveAuthorize.isPending}
                className="min-h-[44px] px-lg bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50 self-start">
                {onedriveAuthorize.isPending ? 'Connecting…' : 'Connect with Microsoft'}
              </button>
            )}
          </div>
        )}

        {data?.duplicateAccountWarning && (
          <div className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-on-surface-variant">
            This account is already connected to another clinic on Anemal — we recommend each clinic use a
            separate account (branches of the same clinic sharing one account is fine).
          </div>
        )}
      </div>

      {form.provider !== 'google_drive' && form.provider !== 'onedrive' && (
        <div className="sticky bottom-0 bg-background pt-sm pb-md flex items-center justify-end border-t border-outline-variant">
          <button type="submit" disabled={update.isPending}
            className="min-h-[44px] min-w-[44px] px-xl bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {update.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      <Dialog
        title="Change storage location?"
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        dismissal="explicit"
        width="max-w-md"
        footer={
          <div className="flex justify-end gap-sm">
            <button type="button" onClick={() => setConfirmOpen(false)}
              className="min-h-[44px] px-lg border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low">
              Cancel
            </button>
            <button type="button" onClick={handleConfirmSwitch}
              className="min-h-[44px] px-lg bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90">
              Confirm
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-md">
          <p className="text-body-md text-on-surface-variant">
            Files already uploaded will stay at their current location and won't be visible at the new
            location until moved there manually. Backing them up is now your clinic's responsibility.
            {data?.provider === 'google_drive' && ' This also disconnects the currently connected Google account.'}
            {data?.provider === 'onedrive' && ' This also disconnects the currently connected Microsoft account.'}
          </p>
          <p className="text-body-md text-on-surface-variant">
            Switching providers does not automatically move your existing files. The app won't see them until
            you switch back — nothing is deleted, and switching back restores visibility at any time.
          </p>
          <p className="text-body-md text-on-surface-variant">
            If a file is deleted while a different provider than the one storing it is active, the physical file
            at the old provider is not removed and can no longer be reached through the app.
          </p>
        </div>
      </Dialog>
    </form>
  )
}
