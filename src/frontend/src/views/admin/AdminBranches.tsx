import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'

interface Branch {
  id: number
  name: string
  phone: string | null
  email: string | null
  address: string | null
  isActive: boolean
}

interface Shift {
  id: number
  branchId: number
  doctorId: number
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface UserLite { id: number; name: string; role: string }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const inputCls =
  'w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors min-h-[44px]'

// ─── Branch form (create / edit) ──────────────────────────────────────────────
function BranchForm({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const isEdit = !!branch
  const [form, setForm] = useState({
    name: branch?.name ?? '',
    phone: branch?.phone ?? '',
    email: branch?.email ?? '',
    address: branch?.address ?? '',
  })
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: (body: object) =>
      isEdit ? api.put(`/api/branches/${branch!.id}`, body) : api.post('/api/branches', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); onClose() },
  })

  function submit() {
    if (!form.name.trim()) return
    mut.mutate({
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-md" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-xl pt-xl pb-md border-b border-outline-variant">
          <p className="text-headline-sm font-headline font-bold text-on-surface">{isEdit ? 'Edit Branch' : 'New Branch'}</p>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant">
            <MaterialIcon name="close" size={20} />
          </button>
        </div>
        <div className="px-xl py-lg flex flex-col gap-md">
          <div className="flex flex-col gap-xs">
            <label className="text-label-lg text-on-surface-variant">Branch name *</label>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Main Branch" />
          </div>
          <div className="flex flex-col gap-xs">
            <label className="text-label-lg text-on-surface-variant">Phone</label>
            <input className={inputCls} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="02-000-0000" />
          </div>
          <div className="flex flex-col gap-xs">
            <label className="text-label-lg text-on-surface-variant">Email</label>
            <input className={inputCls} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="branch@clinic.com" />
          </div>
          <div className="flex flex-col gap-xs">
            <label className="text-label-lg text-on-surface-variant">Address</label>
            <textarea className={`${inputCls} min-h-[72px] resize-none`} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={2} />
          </div>
          {mut.isError && <p className="text-body-sm text-error">{(mut.error as any)?.response?.data?.error ?? 'Could not save branch.'}</p>}
        </div>
        <div className="flex gap-sm px-xl pb-xl">
          <button onClick={onClose} className="flex-1 min-h-[44px] rounded-xl border border-outline-variant bg-surface text-on-surface hover:bg-surface-container text-body-md font-medium transition-colors">Cancel</button>
          <button onClick={submit} disabled={!form.name.trim() || mut.isPending}
            className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-on text-body-md font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
            {mut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Branch'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shifts panel ─────────────────────────────────────────────────────────────
function ShiftsPanel({ branch, doctors }: { branch: Branch; doctors: UserLite[] }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState({ doctorId: '', dayOfWeek: '1', startTime: '09:00', endTime: '17:00' })

  const { data: shifts = [] } = useQuery<Shift[]>({
    queryKey: ['shifts', branch.id],
    queryFn: () => api.get(`/api/branches/${branch.id}/shifts`).then(r => r.data.data),
  })

  const addShift = useMutation({
    mutationFn: (body: object) => api.post(`/api/branches/${branch.id}/shifts`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts', branch.id] }),
  })
  const delShift = useMutation({
    mutationFn: (id: number) => api.delete(`/api/branches/${branch.id}/shifts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts', branch.id] }),
  })

  const doctorName = (id: number) => doctors.find(d => d.id === id)?.name ?? `Doctor #${id}`

  function add() {
    if (!draft.doctorId) return
    addShift.mutate({
      doctorId: Number(draft.doctorId),
      dayOfWeek: Number(draft.dayOfWeek),
      startTime: draft.startTime,
      endTime: draft.endTime,
    })
  }

  return (
    <div className="bg-surface border border-outline-variant rounded-xl p-5">
      <h3 className="font-semibold text-on-surface text-body-md mb-3 flex items-center gap-xs">
        <MaterialIcon name="schedule" size={18} className="text-on-surface-variant" /> Doctor Shifts
      </h3>

      {/* Existing shifts */}
      {shifts.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant mb-4">No shifts configured for this branch yet.</p>
      ) : (
        <div className="flex flex-col gap-xs mb-4">
          {shifts.map(s => (
            <div key={s.id} className="flex items-center justify-between bg-surface-container-low rounded-lg px-md py-sm">
              <div className="flex items-center gap-md text-body-sm">
                <span className="font-medium text-on-surface w-32 truncate">{doctorName(s.doctorId)}</span>
                <span className="px-sm py-xs rounded-full bg-primary-fixed text-on-surface text-label-sm font-medium">{DAYS[s.dayOfWeek]}</span>
                <span className="text-on-surface-variant font-mono">{s.startTime}–{s.endTime}</span>
              </div>
              <button onClick={() => delShift.mutate(s.id)} className="min-h-[36px] min-w-[36px] flex items-center justify-center text-on-surface-variant hover:text-error rounded-lg transition-colors">
                <MaterialIcon name="delete" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add shift row */}
      <div className="border-t border-outline-variant pt-3 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
          <label className="text-label-md text-on-surface-variant">Doctor</label>
          <select value={draft.doctorId} onChange={e => setDraft(d => ({ ...d, doctorId: e.target.value }))}
            className="rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-sm min-h-[40px] focus:outline-none focus:border-primary">
            <option value="">Select…</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-label-md text-on-surface-variant">Day</label>
          <select value={draft.dayOfWeek} onChange={e => setDraft(d => ({ ...d, dayOfWeek: e.target.value }))}
            className="rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-sm min-h-[40px] focus:outline-none focus:border-primary">
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-label-md text-on-surface-variant">Start</label>
          <input type="time" value={draft.startTime} onChange={e => setDraft(d => ({ ...d, startTime: e.target.value }))}
            className="rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-sm min-h-[40px] focus:outline-none focus:border-primary" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-label-md text-on-surface-variant">End</label>
          <input type="time" value={draft.endTime} onChange={e => setDraft(d => ({ ...d, endTime: e.target.value }))}
            className="rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-sm min-h-[40px] focus:outline-none focus:border-primary" />
        </div>
        <button onClick={add} disabled={!draft.doctorId || addShift.isPending}
          className="min-h-[40px] px-md rounded-lg bg-primary text-primary-on text-body-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-xs">
          <MaterialIcon name="add" size={16} /> Add
        </button>
      </div>
      {addShift.isError && <p className="text-body-sm text-error mt-2">{(addShift.error as any)?.response?.data?.error ?? 'Could not add shift.'}</p>}
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function AdminBranches() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [formBranch, setFormBranch] = useState<Branch | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data: branches = [], isLoading } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => api.get('/api/branches').then(r => r.data.data),
  })

  const { data: users = [] } = useQuery<UserLite[]>({
    queryKey: ['admin', 'users-lite'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  })
  const doctors = users.filter(u => u.role === 'doctor')

  const selected = branches.find(b => b.id === selectedId) ?? null

  function openCreate() { setFormBranch(null); setShowForm(true) }
  function openEdit(b: Branch) { setFormBranch(b); setShowForm(true) }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-headline-sm font-headline font-bold text-primary">Branch Management</h2>
          <p className="text-body-sm text-on-surface-variant mt-1">{branches.length} branch{branches.length !== 1 ? 'es' : ''}</p>
        </div>
        <button onClick={openCreate}
          className="min-h-[44px] flex items-center gap-xs px-lg rounded-xl bg-primary text-primary-on text-body-sm font-medium hover:opacity-90 transition-opacity">
          <MaterialIcon name="add" size={18} /> New Branch
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Branch list */}
          <div className="lg:col-span-1 flex flex-col gap-2">
            {branches.map(b => (
              <button key={b.id} onClick={() => setSelectedId(b.id)}
                className={`text-left rounded-xl border p-4 transition-colors ${selectedId === b.id ? 'border-primary bg-surface-container-low' : 'border-outline-variant bg-surface hover:bg-surface-container-low'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-body-md font-semibold text-on-surface">{b.name}</p>
                  {!b.isActive && <span className="text-label-sm text-error">inactive</span>}
                </div>
                {b.phone && <p className="text-label-md text-on-surface-variant mt-1 flex items-center gap-xs"><MaterialIcon name="call" size={14} />{b.phone}</p>}
                {b.address && <p className="text-label-md text-on-surface-variant truncate">{b.address}</p>}
              </button>
            ))}
          </div>

          {/* Detail + shifts */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {selected ? (
              <>
                <div className="bg-surface border border-outline-variant rounded-xl p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-headline-xs font-headline font-bold text-on-surface">{selected.name}</h3>
                      <div className="mt-2 flex flex-col gap-1 text-body-sm text-on-surface-variant">
                        <span className="flex items-center gap-xs"><MaterialIcon name="call" size={16} />{selected.phone ?? '—'}</span>
                        <span className="flex items-center gap-xs"><MaterialIcon name="mail" size={16} />{selected.email ?? '—'}</span>
                        <span className="flex items-center gap-xs"><MaterialIcon name="location_on" size={16} />{selected.address ?? '—'}</span>
                      </div>
                    </div>
                    <button onClick={() => openEdit(selected)}
                      className="min-h-[44px] flex items-center gap-xs px-md rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container text-body-sm transition-colors">
                      <MaterialIcon name="edit" size={16} /> Edit
                    </button>
                  </div>
                </div>
                <ShiftsPanel branch={selected} doctors={doctors} />
              </>
            ) : (
              <div className="bg-surface border border-dashed border-outline-variant rounded-xl p-8 flex flex-col items-center justify-center text-on-surface-variant min-h-[200px]">
                <MaterialIcon name="apartment" size={40} className="text-outline mb-2" />
                <p className="text-body-md">Select a branch to view details and manage doctor shifts.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showForm && <BranchForm branch={formBranch} onClose={() => setShowForm(false)} />}
    </div>
  )
}
