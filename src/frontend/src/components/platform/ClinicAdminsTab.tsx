/**
 * ClinicAdminsTab — CustomerDetailView's "Clinic Admins" tab (CO-7..CO-10).
 *
 * Bounded platform→clinic-plane exception (ADR-0015): lists/creates/
 * deactivates/resets passwords for clinic_admin-role users of one tenant
 * only. No role picker (Q-8 — role is always clinic_admin). No rename
 * action (G-2 — happens clinic-side after first login). No reactivate
 * action (G-1 — recovery is creating a new clinic_admin).
 */
import { useState } from 'react'
import {
  useTenantAdminUsers,
  useCreateTenantAdminUser,
  useDeactivateTenantAdminUser,
  useResetTenantAdminUserPassword,
  type TenantAdminUser,
  type CreateTenantAdminUserPayload,
} from '../../hooks/usePlatformCustomers'
import Dialog from '../Dialog'
import { usePasswordField } from './PasswordField'
import MaterialIcon from '../MaterialIcon'

const EMPTY_FORM: CreateTenantAdminUserPayload = { name: '', username: '', email: '', phone: '', password: '' }

/** Maps create-admin error responses to a user-facing message, including the 403 permission-denied case that was previously swallowed into a generic "try again". */
function createErrorMessage(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: { code?: string } } })?.response
  if (response?.status === 403) return "You don't have permission to create clinic admins. Ask a platform super admin."
  const code = response?.data?.code
  if (code === 'QUOTA_EXCEEDED') return 'This tenant is at its user quota limit.'
  if (code === 'USERNAME_CONFLICT') return 'That username is already in use for this tenant.'
  return 'Failed to create clinic admin. Please try again.'
}

/** Display-once credentials panel shown after create/reset (brainstorm §3.5). */
function CredentialsPanel({ username, password, onDismiss }: { username: string; password: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(password)
    setCopied(true)
  }
  return (
    <div className="bg-surface-container-low border border-secondary rounded-lg p-md space-y-sm">
      <div className="flex items-center gap-sm text-secondary">
        <MaterialIcon name="key" size={18} />
        <p className="text-label-md font-medium">This password will not be shown again.</p>
      </div>
      <dl className="text-body-sm space-y-xs">
        <div><dt className="inline text-on-surface-variant">Username: </dt><dd className="inline font-code text-on-surface">{username}</dd></div>
        <div><dt className="inline text-on-surface-variant">Password: </dt><dd className="inline font-code text-on-surface">{password}</dd></div>
      </dl>
      <div className="flex gap-sm">
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-xs min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <MaterialIcon name="content_copy" size={16} />
          {copied ? 'Copied' : 'Copy password'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-[44px] px-md bg-primary text-on-primary rounded text-body-sm font-medium hover:opacity-90 transition-opacity"
        >
          Done
        </button>
      </div>
    </div>
  )
}

/** Per-row reset-password dialog — reuses PasswordField for typed-or-generate (CO-10, matches create's UX). */
function ResetPasswordDialog({ user, password, onPasswordChange, onConfirm, onCancel, isPending, error }: {
  user: TenantAdminUser; password: string; onPasswordChange: (v: string) => void
  onConfirm: () => void; onCancel: () => void; isPending: boolean
  error: { response?: { data?: { code?: string } } } | null
}) {
  const errorCode = error?.response?.data?.code
  const { field, toggleButton } = usePasswordField({ id: 'ca-reset-password', value: password, onChange: onPasswordChange })
  return (
    <Dialog title="Reset password" open onClose={onCancel} width="max-w-md">
      <div className="space-y-md">
        <p className="text-body-sm text-on-surface">
          Set a new password for <strong>{user.username}</strong>. Type one or generate a new one.
        </p>
        {field}
        {errorCode && (
          <p className="text-label-md text-error">
            {errorCode === 'WEAK_PASSWORD'
              ? 'Password must be at least 8 characters.'
              : 'Failed to reset password. Please try again.'}
          </p>
        )}
        <div className="flex items-center justify-between gap-sm">
          {toggleButton}
          <div className="flex gap-sm">
            <button type="button" onClick={onCancel} className="min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors">
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isPending}
              className="min-h-[44px] px-md bg-primary text-on-primary rounded text-body-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Reset password
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

/** Per-row deactivate confirmation dialog (Q-9 — states there is no undo). */
function DeactivateConfirmDialog({ user, onConfirm, onCancel, isPending, error }: {
  user: TenantAdminUser; onConfirm: () => void; onCancel: () => void; isPending: boolean
  error: { response?: { data?: { code?: string } } } | null
}) {
  const errorCode = error?.response?.data?.code
  return (
    <Dialog title="Deactivate clinic admin?" open onClose={onCancel} width="max-w-md">
      <div className="space-y-md">
        <p className="text-body-sm text-on-surface">
          Deactivating <strong>{user.username}</strong> immediately blocks their login.
          There is <strong>no reactivate action</strong> — the only way to recover is
          creating a new clinic admin from this tab.
        </p>
        {errorCode && (
          <p className="text-label-md text-error">
            {errorCode === 'ALREADY_DEACTIVATED'
              ? 'This admin was already deactivated (possibly by another session). Refresh the list.'
              : 'Failed to deactivate. Please try again.'}
          </p>
        )}
        <div className="flex justify-end gap-sm">
          <button type="button" onClick={onCancel} className="min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="min-h-[44px] px-md bg-error text-on-error rounded text-body-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Deactivate
          </button>
        </div>
      </div>
    </Dialog>
  )
}

export default function ClinicAdminsTab({ id }: { id: number }) {
  const { data: admins, isLoading, isError } = useTenantAdminUsers(id)
  const create   = useCreateTenantAdminUser(id)
  const deactivate = useDeactivateTenantAdminUser(id)
  const reset    = useResetTenantAdminUserPassword(id)

  const [createOpen, setCreateOpen]   = useState(false)
  const [form, setForm]               = useState<CreateTenantAdminUserPayload>(EMPTY_FORM)
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<TenantAdminUser | null>(null)
  const [resetTarget, setResetTarget]   = useState<TenantAdminUser | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const passwordField = usePasswordField({ id: 'ca-password', value: form.password ?? '', onChange: (v) => setForm((f) => ({ ...f, password: v })) })

  const openCreate  = () => { setForm(EMPTY_FORM); create.reset(); setCreateOpen(true) }
  const closeCreate = () => setCreateOpen(false)

  const openReset  = (user: TenantAdminUser) => { setResetPassword(''); reset.reset(); setResetTarget(user) }
  const closeReset = () => setResetTarget(null)

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: CreateTenantAdminUserPayload = {
      name: form.name,
      username: form.username,
      email: form.email || undefined,
      phone: form.phone || undefined,
      password: form.password || undefined,
    }
    create.mutate(payload, {
      onSuccess: (data) => {
        setCreateOpen(false)
        setCredentials({ username: data.username, password: data.password })
      },
    })
  }

  const handleDeactivateConfirm = () => {
    if (!deactivateTarget) return
    deactivate.mutate(deactivateTarget.id, { onSuccess: () => setDeactivateTarget(null) })
  }

  const handleResetConfirm = () => {
    if (!resetTarget) return
    reset.mutate({ userId: resetTarget.id, password: resetPassword || undefined }, {
      onSuccess: (data) => {
        setResetTarget(null)
        setCredentials({ username: data.username, password: data.password })
      },
    })
  }

  if (isLoading) {
    return <div className="p-lg text-on-surface-variant text-body-sm">Loading clinic admins…</div>
  }
  if (isError) {
    return (
      <div className="p-lg text-error text-body-sm flex items-center gap-sm">
        <MaterialIcon name="error_outline" size={18} />
        Failed to load clinic admins.
      </div>
    )
  }

  return (
    <div className="space-y-lg">
      {credentials && (
        <CredentialsPanel username={credentials.username} password={credentials.password} onDismiss={() => setCredentials(null)} />
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-headline-xs font-headline font-bold text-on-surface">Clinic Admins</h3>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-sm bg-primary text-on-primary px-md min-h-[44px] rounded text-body-sm font-medium hover:opacity-90 transition-opacity"
        >
          <MaterialIcon name="add" size={18} />
          Create
        </button>
      </div>

      <div className="bg-surface rounded-lg shadow-lvl1 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Username</th>
              <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Name</th>
              <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Contact</th>
              <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Status</th>
              <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Created</th>
              <th className="px-md py-sm" />
            </tr>
          </thead>
          <tbody>
            {(admins ?? []).map((u) => (
              <tr key={u.id} className="border-b border-outline-variant">
                <td className="px-md py-sm text-body-sm font-code text-on-surface-variant">{u.username}</td>
                <td className="px-md py-sm text-body-md text-on-surface font-medium">{u.name}</td>
                <td className="px-md py-sm text-body-sm text-on-surface-variant">{u.email ?? u.phone ?? '—'}</td>
                <td className="px-md py-sm text-body-sm">
                  {u.isActive
                    ? <span className="text-secondary">Active</span>
                    : <span className="text-on-surface-variant">Deactivated</span>}
                </td>
                <td className="px-md py-sm text-body-sm text-on-surface-variant">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="px-md py-sm">
                  <div className="flex items-center gap-sm justify-end">
                    <button
                      type="button"
                      onClick={() => openReset(u)}
                      className="min-h-[44px] px-sm text-body-sm text-secondary hover:underline disabled:opacity-50"
                    >
                      Reset password
                    </button>
                    {u.isActive && (
                      <button
                        type="button"
                        onClick={() => { deactivate.reset(); setDeactivateTarget(u) }}
                        className="min-h-[44px] px-sm text-body-sm text-error hover:underline"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(admins ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-md py-xl text-center text-on-surface-variant text-body-sm">
                  No clinic admins yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog title="Create Clinic Admin" open={createOpen} onClose={closeCreate}>
        <form onSubmit={handleCreateSubmit} className="space-y-md">
          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="ca-name">
              Name <span className="text-error">*</span>
            </label>
            <input
              id="ca-name" type="text" required value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="ca-username">
              Username <span className="text-error">*</span>
            </label>
            <input
              id="ca-username" type="text" required value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="ca-email">Email</label>
            <input
              id="ca-email" type="email" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="ca-phone">Phone</label>
            <input
              id="ca-phone" type="tel" value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>
          {!form.email && !form.phone && (
            <p className="text-label-md text-error">At least one of email or phone is required.</p>
          )}
          {passwordField.field}

          {create.error && (
            <p className="text-label-md text-error">{createErrorMessage(create.error)}</p>
          )}

          <div className="flex items-center justify-between gap-sm pt-xs">
            {passwordField.toggleButton}
            <div className="flex gap-sm">
              <button type="button" onClick={closeCreate} className="min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={create.isPending || (!form.email && !form.phone)}
                className="min-h-[44px] px-md bg-primary text-on-primary rounded text-body-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-sm"
              >
                {create.isPending && <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </form>
      </Dialog>

      {deactivateTarget && (
        <DeactivateConfirmDialog
          user={deactivateTarget}
          onConfirm={handleDeactivateConfirm}
          onCancel={() => setDeactivateTarget(null)}
          isPending={deactivate.isPending}
          error={deactivate.error as { response?: { data?: { code?: string } } } | null}
        />
      )}

      {resetTarget && (
        <ResetPasswordDialog
          user={resetTarget}
          password={resetPassword}
          onPasswordChange={setResetPassword}
          onConfirm={handleResetConfirm}
          onCancel={closeReset}
          isPending={reset.isPending}
          error={reset.error as { response?: { data?: { code?: string } } } | null}
        />
      )}
    </div>
  )
}
