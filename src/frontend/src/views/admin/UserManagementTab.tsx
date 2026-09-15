// @uiux-agent spec: user list, role badges, add/edit/deactivate modal — 44px tap targets
import { useState, useEffect, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAuthStore } from '../../store/authStore'
import Can from '../../components/Can'
import { useClinicRolesQuery, isGrantable, isAdminLevelRole, SEALED_ROLE_KEY } from '../../hooks/useUserRoles'
import { useAdminSettings, useUpdateSettings } from '../../hooks/useAdmin'
import { useT } from '../../i18n'
import { describeSaveError } from '../../utils/errorMessages'
import MaterialIcon from '../../components/MaterialIcon'
import BranchSwitcher from '../../components/BranchSwitcher'
import Dialog from '../../components/Dialog'

interface User {
  id: number; name: string; username: string; email: string | null
  role: { id: number; name: string; key: string; isSystem: boolean }
  isPrimaryAdmin: boolean; isActive: boolean; createdAt: string; branchId: number | null
}
interface Branch { id: number; name: string }

const ROLE_COLORS: Record<string, string> = {
  clinic_admin: 'bg-error-container text-error-on-container',
  doctor:       'bg-primary-fixed text-primary',
  clinic_staff: 'bg-secondary-container text-secondary-on-container',
}
const ROLE_COLOR_FALLBACK = 'bg-surface-container text-on-surface-variant'

const INITIALS = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
const AVATAR_BG: Record<string, string> = {
  clinic_admin: 'bg-error-container text-error-on-container',
  doctor:       'bg-primary-fixed text-primary',
  clinic_staff: 'bg-secondary-container text-secondary-on-container',
}
const AVATAR_BG_FALLBACK = 'bg-surface-container text-on-surface-variant'

function Modal({ user, onClose, isPrimaryAdmin }: { user: Partial<User> & { isNew?: boolean }; onClose: () => void; isPrimaryAdmin: boolean }) {
  const t = useT()
  const qc = useQueryClient()
  const isNew = !!user.isNew
  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['admin', 'branches'],
    queryFn: () => api.get('/api/branches').then(r => r.data.data),
  })
  const [form, setForm] = useState({
    name: user.name ?? '', username: user.username ?? '', email: user.email ?? '',
    roleId: user.role?.id ?? 0, password: '', isActive: user.isActive ?? true,
    branchIds: [] as number[],
  })
  const [selfDemoteConfirm, setSelfDemoteConfirm] = useState<{ pendingRoleId: number } | null>(null)

  // Load the user's currently assigned branches when editing
  useEffect(() => {
    if (isNew || !user.id) { setForm(p => ({ ...p, branchIds: [] })); return }
    api.get<{ success: boolean; data: Branch[] }>(`/users/${user.id}/branches`)
      .then(res => setForm(p => ({ ...p, branchIds: res.data.data.map(b => b.id) })))
      .catch(() => {})
  }, [user.id, isNew])

  const save = useMutation({
    mutationFn: () => isNew
      ? api.post('/users', { name: form.name, username: form.username, email: form.email || undefined, password: form.password, roleId: form.roleId })
      : api.put(`/users/${user.id}`, { name: form.name, roleId: form.roleId, isActive: form.isActive }),
    onSuccess: async (res) => {
      const uid = isNew ? (res.data as { data: { id: number } }).data.id : user.id!
      await api.patch(`/users/${uid}/branch`, { branchIds: form.branchIds }).catch(() => {})
      qc.invalidateQueries({ queryKey: ['admin', 'users'] }); onClose()
    },
  })

  const { data: allRoles = [] } = useClinicRolesQuery()
  const authPermissions = useAuthStore(s => s.permissions)
  const hasAssignRole = useAuthStore(s => s.hasPermission('staff.assign_role'))
  const callerPermSet = new Set(authPermissions)
  const grantableRoles = allRoles.filter(r => isGrantable(r, callerPermSet))
  const listableRoles = grantableRoles.filter(r => !(isNew && r.key === SEALED_ROLE_KEY))

  function handleRoleChange(newRoleId: number) {
    if (isSelf) {
      const newRole = allRoles.find(r => r.id === newRoleId)
      const currentRole = allRoles.find(r => r.id === form.roleId)
      if (currentRole && isAdminLevelRole(currentRole) && newRole && !isAdminLevelRole(newRole)) {
        setSelfDemoteConfirm({ pendingRoleId: newRoleId })
        return
      }
    }
    setForm(p => ({ ...p, roleId: newRoleId }))
  }

  const currentUserId = useAuthStore(s => s.userId)
  const isSelf = !isNew && user.id === currentUserId
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const resetPw = useMutation({
    mutationFn: () => api.patch(`/users/${user.id}/password`, { newPassword: resetPasswordValue }),
    onSuccess: () => setResetPasswordValue(''),
  })

  const inputCls = 'min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm max-h-[90vh] flex flex-col">
        <h3 className="font-semibold text-on-surface px-6 pt-6 pb-4 flex-shrink-0">{isNew ? 'Add user' : 'Edit user'}</h3>
        <div className="space-y-3 px-6 pb-1 overflow-y-auto min-h-0">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-on-surface-variant">{t('admin.users.fullName')}</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} />
          </div>
          {isNew && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-on-surface-variant">Username</label>
                <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                  placeholder="3-20 chars, letters/digits/_" className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-on-surface-variant">Email (optional)</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-on-surface-variant">{t('admin.users.password')}</label>
                <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} className={inputCls} />
              </div>
            </>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="user-role-select" className="text-xs text-on-surface-variant">{t('admin.users.role')}</label>
            <Can perm="staff.assign_role">
              <select
                id="user-role-select"
                aria-label={t('admin.users.role')}
                value={form.roleId}
                disabled={!hasAssignRole}
                onChange={e => handleRoleChange(Number(e.target.value))}
                className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-surface"
              >
                <option value={0} disabled>{t('common.select')}</option>
                {listableRoles.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </Can>
          </div>
          {selfDemoteConfirm && (
            <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-primary/30 p-4">
              <div className="bg-surface rounded-xl shadow-xl w-full max-w-sm p-6 space-y-3">
                <h3 className="text-sm font-semibold text-on-surface text-center">{t('roles.selfDemotionTitle')}</h3>
                <p className="text-xs text-on-surface-variant text-center">{t('roles.selfDemotionDesc')}</p>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setSelfDemoteConfirm(null)}
                    className="flex-1 min-h-[44px] border border-outline-variant rounded-lg text-xs font-semibold text-on-surface">
                    {t('roles.keepRole')}
                  </button>
                  <button type="button" onClick={() => { setForm(p => ({ ...p, roleId: selfDemoteConfirm.pendingRoleId })); setSelfDemoteConfirm(null) }}
                    className="flex-1 min-h-[44px] bg-error text-on-primary rounded-lg text-xs font-semibold">
                    {t('roles.removeAnyway')}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-on-surface-variant">
              {t('admin.users.assignedBranches')}<span className="text-error"> *</span>
            </label>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto border border-outline-variant rounded-lg p-2">
              {branches.map(b => (
                <label key={b.id} className="flex items-center gap-2 min-h-[44px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.branchIds.includes(b.id)}
                    onChange={e => setForm(p => ({
                      ...p,
                      branchIds: e.target.checked
                        ? [...p.branchIds, b.id]
                        : p.branchIds.filter(id => id !== b.id),
                    }))}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm text-on-surface">{b.name}</span>
                </label>
              ))}
            </div>
            {form.branchIds.length === 0 && (
              <p className="text-xs text-error-on-container">{t('admin.users.branchRequired')}</p>
            )}
          </div>
          {!isNew && (
            <label className={`flex items-center gap-2 min-h-[44px] ${isPrimaryAdmin ? '' : 'cursor-pointer'}`}>
              <input
                type="checkbox" checked={form.isActive} disabled={isPrimaryAdmin}
                aria-label={t('admin.users.activeAccount')}
                onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} className="w-4 h-4"
              />
              <span className="text-sm text-on-surface">{t('admin.users.activeAccount')}</span>
              {isPrimaryAdmin && <span className="text-xs text-on-surface-variant">Primary admin — cannot be deactivated</span>}
            </label>
          )}
          {!isNew && (
            <Can perm="staff.manage">
              {isSelf ? (
                <p className="text-xs text-on-surface-variant">
                  Change your own password in My Preferences (profile menu).
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  <label htmlFor="admin-reset-password" className="text-xs text-on-surface-variant">Reset password</label>
                  <input
                    id="admin-reset-password" type="password" autoComplete="new-password"
                    value={resetPasswordValue}
                    onChange={e => setResetPasswordValue(e.target.value)}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => resetPw.mutate()}
                    disabled={resetPw.isPending || resetPasswordValue.length === 0}
                    className="min-h-[44px] px-4 self-start border border-outline-variant rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50"
                  >
                    {resetPw.isPending ? 'Resetting…' : 'Reset password'}
                  </button>
                  {resetPw.isSuccess && <p className="text-xs text-secondary">Password reset.</p>}
                  {resetPw.isError && <p className="text-xs text-error-on-container">{describeSaveError(resetPw.error)}</p>}
                </div>
              )}
            </Can>
          )}
        </div>
        <div className="flex-shrink-0 px-6 pb-6 pt-3">
          {save.isError && <p className="text-xs text-error-on-container mb-2">{describeSaveError(save.error)}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 min-h-[44px] border border-outline-variant rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-low">{t('common.cancel')}</button>
            <button onClick={() => save.mutate()} disabled={save.isPending}
              className="flex-1 min-h-[44px] bg-primary text-primary-on rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-primary/90">
              {save.isPending ? t('common.saving') : isNew ? t('admin.users.addUser') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DeactivateConfirmDialog({ user, onCancel, onConfirmed }: { user: User; onCancel: () => void; onConfirmed: () => void }) {
  const qc = useQueryClient()
  const deactivate = useMutation({
    mutationFn: () => api.delete(`/users/${user.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      onConfirmed()
    },
  })
  return (
    <Dialog title="Confirm deactivate" open onClose={onCancel} dismissal="explicit" width="max-w-sm">
      <p className="text-body-sm text-on-surface mb-4">
        Deactivate {user.name}? They will no longer be able to log in. You can restore them later.
      </p>
      {deactivate.isError && <p className="text-label-md text-error-on-container mb-2">{describeSaveError(deactivate.error)}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 min-h-[44px] border border-outline-variant rounded-lg text-body-sm text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
        <button
          onClick={() => deactivate.mutate()}
          disabled={deactivate.isPending}
          className="flex-1 min-h-[44px] bg-error text-error-on rounded-lg text-body-sm font-semibold disabled:opacity-50 hover:bg-error/90"
        >
          {deactivate.isPending ? 'Deactivating…' : 'Deactivate'}
        </button>
      </div>
    </Dialog>
  )
}

// Idle-timeout (session security policy) relocated here from Appointment Settings —
// it governs when any user is auto-logged-out, so it sits with user management.
// Persists via the shared /admin/settings partial update (only idleTimeoutMinutes is sent).
function SecurityCard() {
  const { data, isLoading } = useAdminSettings()
  const update = useUpdateSettings()
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState<number>(15)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (data) setIdleTimeoutMinutes(data.idleTimeoutMinutes)
  }, [data])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    // Clamp to the backend-accepted range (Zod min5/max120) — an empty field is Number('')=0.
    const clamped = Math.min(120, Math.max(5, Number(idleTimeoutMinutes) || 5))
    setIdleTimeoutMinutes(clamped)
    setError(null)
    try {
      await update.mutateAsync({ idleTimeoutMinutes: clamped })
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(describeSaveError(err))
    }
  }

  if (isLoading) return null

  return (
    <section>
      <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Security</h3>
      <form onSubmit={handleSave} className="bg-surface border border-outline-variant rounded-xl p-5 flex flex-col gap-3">
        <div className="flex flex-col gap-1 max-w-xs">
          <label htmlFor="idleTimeoutMinutes" className="text-xs text-on-surface-variant">
            Idle timeout (minutes)
          </label>
          <input
            id="idleTimeoutMinutes" type="number" min={5} max={120}
            value={idleTimeoutMinutes}
            onChange={e => setIdleTimeoutMinutes(Number(e.target.value))}
            className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <p className="text-xs text-on-surface-variant mt-1">
            Automatically log out any user after this many minutes of inactivity. 5–120 minutes.
          </p>
        </div>
        {error && <p className="text-xs text-error-on-container">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit" disabled={update.isPending}
            className="min-h-[44px] px-6 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-on text-sm font-semibold rounded-lg transition-colors"
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
          {saved && <span className="text-sm text-secondary-on-container">✓ Saved</span>}
        </div>
      </form>
    </section>
  )
}

export default function UserManagementTab() {
  const t = useT()
  const qc = useQueryClient()
  const branchId = useAuthStore(s => s.branchId)
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['admin', 'users', branchId],
    queryFn: () => api.get('/users').then(r => r.data.data),
  })
  const [modal, setModal] = useState<(Partial<User> & { isNew?: boolean }) | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<User | null>(null)
  const currentUserId = useAuthStore(s => s.userId)

  const [restoreError, setRestoreError] = useState<string | null>(null)
  const restore = useMutation({
    mutationFn: (userId: number) => api.put(`/users/${userId}`, { isActive: true }),
    onSuccess: () => { setRestoreError(null); qc.invalidateQueries({ queryKey: ['admin', 'users'] }) },
    onError: (err: unknown) => setRestoreError(describeSaveError(err)),
  })

  if (isLoading) return <p className="text-sm text-on-surface-variant py-8 text-center">{t('common.loading')}</p>

  const active   = users.filter(u => u.isActive)
  const inactive = users.filter(u => !u.isActive)
  const primaryAdminId = users.find(u => u.isPrimaryAdmin)?.id ?? null

  return (
    <>
      {modal && <Modal user={modal} onClose={() => setModal(null)} isPrimaryAdmin={modal.id === primaryAdminId} />}
      {confirmDeactivate && (
        <DeactivateConfirmDialog
          user={confirmDeactivate}
          onCancel={() => setConfirmDeactivate(null)}
          onConfirmed={() => setConfirmDeactivate(null)}
        />
      )}
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-end">
          <BranchSwitcher />
        </div>
        {/* Active users */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Active users ({active.length})</h3>
            <button onClick={() => setModal({ isNew: true })}
              className="min-h-[44px] px-4 flex items-center gap-2 border border-outline-variant rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-low">
              + {t('admin.users.addUser')}
            </button>
          </div>
          <div className="bg-surface border border-outline-variant rounded-xl divide-y divide-outline-variant">
            {active.map(user => {
              const isPrimaryAdmin = user.id === primaryAdminId
              return (
                <div key={user.id} className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${AVATAR_BG[user.role.key] ?? AVATAR_BG_FALLBACK}`}>
                    {INITIALS(user.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">
                      {user.name} {user.id === currentUserId && <span className="text-xs text-on-surface-variant">(you)</span>}
                    </p>
                    <p className="text-xs text-on-surface-variant truncate font-code">@{user.username}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[user.role.key] ?? ROLE_COLOR_FALLBACK}`}>{user.role.name}</span>
                  <Can perm="staff.manage">
                    {isPrimaryAdmin ? (
                      <button
                        disabled
                        aria-label="Primary admin — cannot be deactivated"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-on-surface-variant opacity-50 cursor-not-allowed"
                      >
                        <MaterialIcon name="lock" size={20} />
                      </button>
                    ) : (
                      <button onClick={() => setConfirmDeactivate(user)}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-outline-variant rounded-lg text-xs text-error-on-container hover:bg-surface-container-low">
                        Deactivate
                      </button>
                    )}
                  </Can>
                  <button onClick={() => setModal(user)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-outline-variant rounded-lg text-xs text-on-surface-variant hover:bg-surface-container-low">
                    Edit
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        {/* Inactive users */}
        {inactive.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Deactivated ({inactive.length})</h3>
            {restoreError && <p className="text-xs text-error-on-container mb-2">{restoreError}</p>}
            <div className="bg-surface border border-outline-variant rounded-xl divide-y divide-outline-variant opacity-60">
              {inactive.map(user => (
                <div key={user.id} className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
                  <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-xs font-semibold text-on-surface-variant flex-shrink-0">
                    {INITIALS(user.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-on-surface-variant truncate line-through">{user.name}</p>
                    <p className="text-xs text-outline-variant truncate font-code">@{user.username}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-surface-container text-on-surface-variant">inactive</span>
                  <Can perm="staff.manage">
                    <button onClick={() => restore.mutate(user.id)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-outline-variant rounded-lg text-xs text-on-surface-variant hover:bg-surface-container-low">
                      Restore
                    </button>
                  </Can>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Security (idle timeout) — below the user list */}
        <Can perm="clinic.profile.edit">
          <SecurityCard />
        </Can>
      </div>
    </>
  )
}
