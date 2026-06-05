import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAuthStore } from '../../store/authStore'

interface User { id: number; name: string; email: string; role: string; isActive: boolean; createdAt: string }

const ROLES = ['admin', 'doctor', 'staff'] as const
const ROLE_STYLE: Record<string, string> = {
  admin:  'bg-error-container text-error-on-container border-error/40',
  doctor: 'bg-primary-fixed text-primary border-primary/30',
  staff:  'bg-secondary-container text-secondary-on-container border-secondary/40',
}

function UserModal({ user, onClose }: { user: Partial<User> & { isNew?: boolean }; onClose: () => void }) {
  const qc = useQueryClient()
  const isNew = !!user.isNew
  const [form, setForm] = useState({
    name: user.name ?? '', email: user.email ?? '',
    role: (user.role ?? 'staff') as string,
    password: '', isActive: user.isActive ?? true,
  })
  const [err, setErr] = useState('')

  const save = useMutation({
    mutationFn: () => isNew
      ? api.post('/users', { name: form.name, email: form.email, role: form.role, password: form.password })
      : api.put(`/users/${user.id}`, { name: form.name, role: form.role, isActive: form.isActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); onClose() },
    onError: (e: any) => setErr(e?.response?.data?.error ?? 'Failed to save'),
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-on-surface">{isNew ? 'Add user' : 'Edit user'}</h3>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface-variant text-xl">×</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-on-surface-variant font-medium block mb-1">Full name *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"/>
          </div>
          {isNew && <>
            <div>
              <label className="text-xs text-on-surface-variant font-medium block mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"/>
            </div>
            <div>
              <label className="text-xs text-on-surface-variant font-medium block mb-1">Password * (min 8 chars)</label>
              <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className="w-full min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"/>
            </div>
          </>}
          <div>
            <label className="text-xs text-on-surface-variant font-medium block mb-2">Role *</label>
            <div className="flex gap-2">
              {ROLES.map(r => (
                <button key={r} type="button" onClick={() => setForm(p => ({ ...p, role: r }))}
                  className={`flex-1 min-h-[44px] text-sm rounded-lg border capitalize font-medium transition-colors ${
                    form.role === r ? ROLE_STYLE[r] : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
            <p className="text-xs text-on-surface-variant mt-1">
              {form.role === 'admin' ? 'Full access: clinic profile, users, settings' :
               form.role === 'doctor' ? 'Clinical access: EMR, prescriptions, appointments' :
               'Operational access: bookings, billing, inventory'}
            </p>
          </div>
          {!isNew && (
            <label className="flex items-center gap-3 min-h-[44px] cursor-pointer bg-surface-container-low rounded-lg px-3">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                className="w-4 h-4"/>
              <div>
                <p className="text-sm font-medium text-on-surface">Active account</p>
                <p className="text-xs text-on-surface-variant">{form.isActive ? 'User can log in' : 'Login blocked'}</p>
              </div>
            </label>
          )}
        </div>
        {err && <p className="text-xs text-error-on-container bg-error-container rounded-lg px-3 py-2 mt-3">{err}</p>}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 min-h-[44px] border border-outline-variant rounded-xl text-sm text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="flex-1 min-h-[44px] bg-primary hover:bg-primary/90 text-primary-on rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
            {save.isPending ? 'Saving…' : isNew ? 'Add user' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminUsers() {
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  })
  const [modal, setModal] = useState<(Partial<User> & { isNew?: boolean }) | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'doctor' | 'staff'>('all')
  const currentUserId = useAuthStore(s => s.userId)

  const filtered = users.filter(u => {
    if (filter === 'active' && !u.isActive) return false
    if (filter === 'inactive' && u.isActive) return false
    if (roleFilter !== 'all' && u.role !== roleFilter) return false
    return true
  })

  return (
    <>
      {modal && <UserModal user={modal} onClose={() => setModal(null)}/>}
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-on-surface">Users & roles</h2>
            <p className="text-sm text-on-surface-variant mt-1">Manage who has access to this clinic</p>
          </div>
          <button onClick={() => setModal({ isNew: true })}
            className="min-h-[44px] px-5 bg-primary hover:bg-primary/90 text-primary-on text-sm font-semibold rounded-xl transition-colors">
            + Add user
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex gap-1 bg-surface-container rounded-lg p-1">
            {(['all', 'active', 'inactive'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`min-h-[36px] px-3 text-xs rounded-md capitalize transition-colors ${
                  filter === f ? 'bg-surface shadow-sm text-on-surface font-medium' : 'text-on-surface-variant hover:text-on-surface'
                }`}>{f}</button>
            ))}
          </div>
          <div className="flex gap-1 bg-surface-container rounded-lg p-1">
            {(['all', 'admin', 'doctor', 'staff'] as const).map(r => (
              <button key={r} onClick={() => setRoleFilter(r)}
                className={`min-h-[36px] px-3 text-xs rounded-md capitalize transition-colors ${
                  roleFilter === r ? 'bg-surface shadow-sm text-on-surface font-medium' : 'text-on-surface-variant hover:text-on-surface'
                }`}>{r}</button>
            ))}
          </div>
          <span className="ml-auto text-xs text-on-surface-variant self-center">{filtered.length} user{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* User list */}
        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_,i) => <div key={i} className="h-16 bg-surface-container rounded-xl animate-pulse"/>)}</div>
        ) : (
          <div className="bg-surface border border-outline-variant rounded-2xl overflow-hidden divide-y divide-outline-variant">
            {filtered.length === 0 && (
              <div className="py-12 text-center text-sm text-on-surface-variant">No users match the selected filters</div>
            )}
            {filtered.map(user => (
              <div key={user.id} className={`flex items-center gap-4 px-5 py-3 min-h-[64px] ${!user.isActive ? 'opacity-50' : ''}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${ROLE_STYLE[user.role] ?? 'bg-surface-container text-on-surface-variant'}`}>
                  {user.name.split(' ').map((w:string) => w[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-on-surface">
                      {user.name}
                      {user.id === currentUserId && <span className="ml-1 text-xs text-on-surface-variant">(you)</span>}
                    </p>
                    {!user.isActive && <span className="text-xs bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-full">inactive</span>}
                  </div>
                  <p className="text-xs text-on-surface-variant">{user.email}</p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full border capitalize font-medium ${ROLE_STYLE[user.role] ?? ''}`}>
                  {user.role}
                </span>
                <button onClick={() => setModal(user)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-outline-variant rounded-xl text-xs text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-4 transition-colors">
                  Edit
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Role legend */}
        <div className="mt-6 bg-surface-container-low border border-outline-variant rounded-xl p-4">
          <p className="text-xs font-semibold text-on-surface-variant mb-3">Role permissions</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { role: 'admin',  desc: 'Full access: clinic profile, all users, settings, subscription' },
              { role: 'doctor', desc: 'Clinical: EMR, prescriptions, appointments, patient records' },
              { role: 'staff',  desc: 'Operations: bookings, billing, inventory, owner records' },
            ].map(({ role, desc }) => (
              <div key={role} className="flex items-start gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full border capitalize font-medium flex-shrink-0 ${ROLE_STYLE[role]}`}>{role}</span>
                <p className="text-xs text-on-surface-variant">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
