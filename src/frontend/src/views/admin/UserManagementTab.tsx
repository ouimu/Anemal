// @uiux-agent spec: user list, role badges, add/edit/deactivate modal — 44px tap targets
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAuthStore } from '../../store/authStore'
import Can from '../../components/Can'
import RolePicker from '../../components/roles/RolePicker'
import { useUserRolesQuery } from '../../hooks/useUserRoles'
import { useT } from '../../i18n'

interface User { id: number; name: string; email: string; role: string; isActive: boolean; createdAt: string }

const ROLE_COLORS: Record<string, string> = {
  admin:  'bg-error-container text-error-on-container',
  doctor: 'bg-primary-fixed text-primary',
  staff:  'bg-secondary-container text-secondary-on-container',
}

const INITIALS = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
const AVATAR_BG: Record<string, string> = {
  admin: 'bg-error-container text-error-on-container', doctor: 'bg-primary-fixed text-primary', staff: 'bg-secondary-container text-secondary-on-container',
}

function Modal({ user, onClose }: { user: Partial<User> & { isNew?: boolean }; onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const isNew = !!user.isNew
  const editUserId = user.id ?? 0
  const { data: userRolesData, refetch: refetchUserRoles } = useUserRolesQuery(isNew ? 0 : editUserId)
  const userRoles = userRolesData ?? []
  const [form, setForm] = useState({ name: user.name ?? '', email: user.email ?? '', role: user.role ?? 'staff', password: '', isActive: user.isActive ?? true })

  const save = useMutation({
    mutationFn: () => isNew
      ? api.post('/users', { ...form })
      : api.put(`/users/${user.id}`, { name: form.name, role: form.role, isActive: form.isActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); onClose() },
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h3 className="font-semibold text-on-surface mb-4">{isNew ? 'Add user' : 'Edit user'}</h3>
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-on-surface-variant">{t('admin.users.fullName')}</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"/>
          </div>
          {isNew && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-on-surface-variant">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"/>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-on-surface-variant">{t('admin.users.password')}</label>
                <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"/>
              </div>
            </>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-on-surface-variant">{t('admin.users.role')}</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-surface">
              <option value="doctor">{t('admin.users.doctor')}</option>
              <option value="staff">{t('admin.users.staff')}</option>
              {!isNew && <option value="admin">{t('admin.users.admin')}</option>}
            </select>
          </div>
          {!isNew && (
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} className="w-4 h-4"/>
              <span className="text-sm text-on-surface">{t('admin.users.activeAccount')}</span>
            </label>
          )}
          {!isNew && (
            <>
              <hr className="border-outline-variant my-4" />
              <Can perm="staff.assign_role">
                <RolePicker
                  userId={editUserId}
                  currentRoles={userRoles}
                  onRolesChanged={() => { void refetchUserRoles() }}
                />
              </Can>
            </>
          )}
        </div>
        {save.isError && <p className="text-xs text-error-on-container mt-2">Save failed — check all fields.</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 min-h-[44px] border border-outline-variant rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-low">{t('common.cancel')}</button>
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="flex-1 min-h-[44px] bg-primary text-primary-on rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-primary/90">
            {save.isPending ? t('common.saving') : isNew ? t('admin.users.addUser') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function UserManagementTab() {
  const t = useT()
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  })
  const [modal, setModal] = useState<(Partial<User> & { isNew?: boolean }) | null>(null)
  const currentUserId = useAuthStore(s => s.userId)

  if (isLoading) return <p className="text-sm text-on-surface-variant py-8 text-center">{t('common.loading')}</p>

  const active   = users.filter(u => u.isActive)
  const inactive = users.filter(u => !u.isActive)

  return (
    <>
      {modal && <Modal user={modal} onClose={() => setModal(null)}/>}
      <div className="space-y-6">
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
            {active.map(user => (
              <div key={user.id} className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${AVATAR_BG[user.role] ?? 'bg-surface-container text-on-surface-variant'}`}>
                  {INITIALS(user.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">
                    {user.name} {user.id === currentUserId && <span className="text-xs text-on-surface-variant">(you)</span>}
                  </p>
                  <p className="text-xs text-on-surface-variant truncate">{user.email}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[user.role] ?? ''}`}>{user.role}</span>
                <button onClick={() => setModal(user)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-outline-variant rounded-lg text-xs text-on-surface-variant hover:bg-surface-container-low">
                  Edit
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Inactive users */}
        {inactive.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Deactivated ({inactive.length})</h3>
            <div className="bg-surface border border-outline-variant rounded-xl divide-y divide-outline-variant opacity-60">
              {inactive.map(user => (
                <div key={user.id} className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
                  <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-xs font-semibold text-on-surface-variant flex-shrink-0">
                    {INITIALS(user.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-on-surface-variant truncate line-through">{user.name}</p>
                    <p className="text-xs text-outline-variant truncate">{user.email}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-surface-container text-on-surface-variant">inactive</span>
                  <button onClick={() => setModal(user)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-outline-variant rounded-lg text-xs text-on-surface-variant hover:bg-surface-container-low">
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
