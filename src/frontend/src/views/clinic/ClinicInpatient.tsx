import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'

// ─── Types ────────────────────────────────────────────────────────────────────
// Field names match the real backend response shape (hospitalization.repository.ts
// findActive/findById) — see docs/superpowers/specs/2026-07-10-inpatient-crud-design.md §0
// for the field-mismatch bug this replaces (cageNumber/admitReason/assignedDoctorId/
// lastCareAt/doctor never existed on the API response). doctorInCharge is a bare
// FK-less Int — the doctor's name is resolved client-side from a doctors id→name map
// (§2.2), not a Prisma relation.
interface Hospitalization {
  id: number
  petId: number
  cageNo: string | null
  status: string
  reason: string
  admittedAt: string
  doctorInCharge: number | null
  dailyRate: number
  notes: string | null
  _count: { careLogs: number }
  pet: { id: number; name: string; species: string; photoUrl?: string }
}

interface Doctor { id: number; name: string }

interface CareEntry {
  timeSlot: string
  temperatureC: number | null
  notes: string
}

// One row of `DailyInpatientCare` as returned nested under `careLogs` by
// `GET /api/hospitalizations/:id`, already sorted newest-first server-side.
// `performedBy` is a `User.id` (any staff role, not necessarily a Doctor) —
// see grill finding 1: must render as "Staff #<id>", never a resolved name.
interface CareLog {
  id: number
  recordedAt: string
  timeSlot: string
  temperatureC: number | null
  heartRateBpm: number | null
  respRateRpm: number | null
  feedingStatus: string | null
  medicationGiven: string | null
  notes: string | null
  performedBy: number | null
}

interface AdmitEditForm {
  reason: string
  cageNo: string
  doctorInCharge: string
  dailyRate: string
  notes: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  admitted:    'bg-primary-fixed text-on-surface',
  stable:      'bg-success/20 text-success',
  attention:   'bg-warning/20 text-warning',
  critical:    'bg-error-container text-error',
  discharged:  'bg-surface-container-high text-on-surface-variant',
}

const STATUS_LABELS: Record<string, string> = {
  admitted:   'Admitted',
  stable:     'Stable',
  attention:  'Needs Attention',
  critical:   'Critical',
  discharged: 'Discharged',
}

const TIME_SLOTS = ['08:00', '12:00', '16:00', '20:00']

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function doctorName(doctors: Doctor[], id: number | null): string {
  if (id == null) return 'Unassigned'
  return doctors.find(d => d.id === id)?.name ?? 'Unassigned'
}

const inputCls = 'bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary'
const textareaCls = 'bg-surface-container-low rounded-lg px-md py-sm min-h-[80px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary resize-none'

// ─── Care Modal ───────────────────────────────────────────────────────────────
function CareModal({ hospit, onClose, onSaved }: {
  hospit: Hospitalization
  onClose: () => void
  onSaved: () => void
}) {
  const [step, setStep] = useState(1)
  const [entry, setEntry] = useState<CareEntry>({
    timeSlot: TIME_SLOTS[0],
    temperatureC: null,
    notes: '',
  })

  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: (data: CareEntry) => api.post(`/api/hospitalizations/${hospit.id}/care`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inpatient-active'] })
      qc.invalidateQueries({ queryKey: ['hospitalization', hospit.id] })
      onSaved()
    },
  })

  function step1() {
    return (
      <div className="flex flex-col gap-md">
        <p className="text-body-md text-on-surface-variant mb-sm">Select the care time slot:</p>
        <div className="grid grid-cols-2 gap-sm">
          {TIME_SLOTS.map(slot => (
            <button
              key={slot}
              onClick={() => setEntry(e => ({ ...e, timeSlot: slot }))}
              className={`min-h-[56px] rounded-xl border-2 text-body-lg font-medium transition-colors
                ${entry.timeSlot === slot
                  ? 'border-primary bg-primary-fixed text-primary font-bold'
                  : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-container'}`}
            >
              {slot}
            </button>
          ))}
        </div>
      </div>
    )
  }

  function Stepper({ label, value, onChange, step: s = 0.1, unit }: {
    label: string; value: number | null; onChange: (v: number) => void; step?: number; unit: string
  }) {
    const v = value ?? 0
    return (
      <div className="flex flex-col gap-xs">
        <p className="text-label-lg text-on-surface-variant">{label}</p>
        <div className="flex items-center gap-md">
          <button
            onClick={() => onChange(Math.max(0, Math.round((v - s) * 10) / 10))}
            className="min-h-[44px] min-w-[44px] rounded-xl border border-outline-variant bg-surface hover:bg-surface-container flex items-center justify-center text-headline-sm font-bold transition-colors"
          >−</button>
          <span className="text-headline-md font-headline font-bold text-on-surface min-w-[80px] text-center">
            {v > 0 ? v.toFixed(1) : '—'} <span className="text-body-sm font-normal text-on-surface-variant">{unit}</span>
          </span>
          <button
            onClick={() => onChange(Math.round((v + s) * 10) / 10)}
            className="min-h-[44px] min-w-[44px] rounded-xl border border-outline-variant bg-surface hover:bg-surface-container flex items-center justify-center text-headline-sm font-bold transition-colors"
          >+</button>
        </div>
      </div>
    )
  }

  function step2() {
    return (
      <div className="flex flex-col gap-xl">
        <Stepper
          label="Body Temperature"
          value={entry.temperatureC}
          onChange={v => setEntry(e => ({ ...e, temperatureC: v }))}
          unit="°C"
        />
      </div>
    )
  }

  function step3() {
    return (
      <div className="flex flex-col gap-sm">
        <p className="text-label-lg text-on-surface-variant">Care notes (optional)</p>
        <textarea
          value={entry.notes}
          onChange={e => setEntry(n => ({ ...n, notes: e.target.value }))}
          rows={4}
          placeholder="Medication given, observations, instructions…"
          className="w-full rounded-xl border border-outline-variant bg-surface px-lg py-md text-body-md text-on-surface placeholder:text-on-surface-variant resize-none focus:outline-none focus:border-primary transition-colors"
        />
      </div>
    )
  }

  const steps = [step1, step2, step3]
  const titles = ['Select Time Slot', 'Record Vitals', 'Care Notes']

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-md" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl shadow-xl w-full max-w-md flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-xl pt-xl pb-md border-b border-outline-variant">
          <div>
            <p className="text-label-md text-on-surface-variant">Log Care — {hospit.pet.name}</p>
            <p className="text-headline-sm font-headline font-bold text-on-surface">{titles[step - 1]}</p>
          </div>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant transition-colors">
            <MaterialIcon name="close" size={20} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-xs px-xl pt-md">
          {[1, 2, 3].map(n => (
            <div key={n} className={`h-1 flex-1 rounded-full transition-colors ${n <= step ? 'bg-primary' : 'bg-outline-variant'}`} />
          ))}
        </div>

        {/* Step content */}
        <div className="px-xl py-lg flex-1">
          {steps[step - 1]()}
        </div>

        {/* Footer */}
        <div className="flex gap-sm px-xl pb-xl">
          {step > 1 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex-1 min-h-[44px] rounded-xl border border-outline-variant bg-surface text-on-surface hover:bg-surface-container text-body-md font-medium transition-colors"
            >Back</button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-on text-body-md font-medium hover:opacity-90 transition-opacity"
            >Next</button>
          ) : (
            <button
              onClick={() => mut.mutate(entry)}
              disabled={mut.isPending}
              className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-on text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >{mut.isPending ? 'Saving…' : 'Save Care Record'}</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Admit Modal ──────────────────────────────────────────────────────────────
// Launched from ClinicPets.tsx PetDetail with petId pre-filled (B4) — mirrors
// EditModal's overlay/dialog structure, same field set plus the (fixed) petId.
export function AdmitModal({ petId, onClose, onSaved }: {
  petId: number
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<AdmitEditForm>({
    reason: '', cageNo: '', doctorInCharge: '', dailyRate: '0', notes: '',
  })
  const [error, setError] = useState('')

  const qc = useQueryClient()
  const { data: doctorsData } = useQuery({
    queryKey: ['appointments', 'doctors'],
    queryFn: () => api.get('/api/appointments/doctors').then(r => r.data.data as Doctor[]),
  })
  const doctors = doctorsData ?? []

  const mut = useMutation({
    mutationFn: (data: AdmitEditForm) => api.post('/api/hospitalizations', {
      petId,
      reason: data.reason,
      cageNo: data.cageNo || null,
      doctorInCharge: data.doctorInCharge ? Number(data.doctorInCharge) : null,
      dailyRate: data.dailyRate ? Number(data.dailyRate) : 0,
      notes: data.notes || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inpatient-active'] }); onSaved() },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to admit patient')
    },
  })

  const set = (k: keyof AdmitEditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    mut.mutate(form)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-md" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-lg">
          <h3 className="text-headline-sm font-headline font-bold text-on-surface">Admit to Inpatient</h3>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant transition-colors">
            <MaterialIcon name="close" size={20} />
          </button>
        </div>
        {error && <p className="text-error text-body-sm mb-md">{error}</p>}
        <form onSubmit={submit} className="flex flex-col gap-md">
          <input required className={inputCls} placeholder="Reason for admission" value={form.reason} onChange={set('reason')} />
          <input className={inputCls} placeholder="Cage number (optional)" value={form.cageNo} onChange={set('cageNo')} />
          <select className={inputCls} value={form.doctorInCharge} onChange={set('doctorInCharge')}>
            <option value="">Doctor in charge (optional)</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input type="number" step="0.01" min="0" max="99999999.99" className={inputCls} placeholder="Daily rate" value={form.dailyRate} onChange={set('dailyRate')} />
          <textarea className={textareaCls} placeholder="Notes (optional)" value={form.notes} onChange={set('notes')} rows={3} />
          <div className="flex gap-md pt-sm">
            <button type="button" onClick={onClose} className="flex-1 min-h-[44px] rounded-xl border border-outline-variant text-body-sm font-semibold hover:bg-surface-container-low transition-colors">Cancel</button>
            <button type="submit" disabled={mut.isPending || !form.reason.trim()} className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-on text-body-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{mut.isPending ? 'Admitting…' : 'Admit Patient'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
// Mirrors CareModal's overlay/dialog structure — single-step form (B2).
function EditModal({ hospit, doctors, onClose, onSaved }: {
  hospit: Hospitalization
  doctors: Doctor[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<AdmitEditForm>({
    reason: hospit.reason,
    cageNo: hospit.cageNo ?? '',
    doctorInCharge: hospit.doctorInCharge != null ? String(hospit.doctorInCharge) : '',
    dailyRate: String(hospit.dailyRate ?? 0),
    notes: hospit.notes ?? '',
  })
  const [error, setError] = useState('')

  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: (data: AdmitEditForm) => api.put(`/api/hospitalizations/${hospit.id}`, {
      reason: data.reason,
      cageNo: data.cageNo || null,
      doctorInCharge: data.doctorInCharge ? Number(data.doctorInCharge) : null,
      dailyRate: data.dailyRate ? Number(data.dailyRate) : 0,
      notes: data.notes || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inpatient-active'] }); onSaved() },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save changes')
    },
  })

  const set = (k: keyof AdmitEditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    mut.mutate(form)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-md" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-lg">
          <h3 className="text-headline-sm font-headline font-bold text-on-surface">Edit Admission — {hospit.pet.name}</h3>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant transition-colors">
            <MaterialIcon name="close" size={20} />
          </button>
        </div>
        {error && <p className="text-error text-body-sm mb-md">{error}</p>}
        <form onSubmit={submit} className="flex flex-col gap-md">
          <input required className={inputCls} placeholder="Reason for admission" value={form.reason} onChange={set('reason')} />
          <input className={inputCls} placeholder="Cage number (optional)" value={form.cageNo} onChange={set('cageNo')} />
          <select className={inputCls} value={form.doctorInCharge} onChange={set('doctorInCharge')}>
            <option value="">Doctor in charge (optional)</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input type="number" step="0.01" min="0" max="99999999.99" className={inputCls} placeholder="Daily rate" value={form.dailyRate} onChange={set('dailyRate')} />
          <textarea className={textareaCls} placeholder="Notes (optional)" value={form.notes} onChange={set('notes')} rows={3} />
          <div className="flex gap-md pt-sm">
            <button type="button" onClick={onClose} className="flex-1 min-h-[44px] rounded-xl border border-outline-variant text-body-sm font-semibold hover:bg-surface-container-low transition-colors">Cancel</button>
            <button type="submit" disabled={mut.isPending} className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-on text-body-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{mut.isPending ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Care History Modal ─────────────────────────────────────────────────────
// Read-only. Fetches the single hospitalization (which nests `careLogs`,
// already sorted newest-first server-side) via `GET /api/hospitalizations/:id`.
// Mirrors CareModal's overlay/dialog chrome and header structure.
function CareHistoryModal({ hospit, onClose }: { hospit: Hospitalization; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery<Hospitalization & { careLogs: CareLog[] }>({
    queryKey: ['hospitalization', hospit.id],
    queryFn: () => api.get(`/api/hospitalizations/${hospit.id}`).then(r => r.data.data),
  })
  const logs = data?.careLogs ?? []

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-md" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-xl pt-xl pb-md border-b border-outline-variant">
          <div>
            <p className="text-label-md text-on-surface-variant">{hospit.pet.name}</p>
            <p className="text-headline-sm font-headline font-bold text-on-surface">Care History</p>
          </div>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant transition-colors">
            <MaterialIcon name="close" size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-xl py-lg flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-xl">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {isError && (
            <div className="bg-error-container text-error rounded-xl p-lg text-body-md flex items-center gap-sm">
              <MaterialIcon name="error" size={20} />
              Failed to load care history.
            </div>
          )}
          {!isLoading && !isError && logs.length === 0 && (
            <p className="text-body-md text-on-surface-variant text-center py-xl">No care history recorded yet</p>
          )}
          {!isLoading && !isError && logs.length > 0 && (
            <div className="flex flex-col gap-sm">
              {logs.map(log => (
                <div key={log.id} className="rounded-xl border border-outline-variant p-md flex flex-col gap-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-label-md font-semibold text-on-surface">{formatDateTime(log.recordedAt)}</span>
                    <span className="px-sm py-xs rounded-full bg-surface-container-low text-label-sm text-on-surface-variant">{log.timeSlot}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-sm text-body-sm text-on-surface-variant">
                    <span>Temp: {log.temperatureC != null ? `${log.temperatureC}°C` : '—'}</span>
                    <span>HR: {log.heartRateBpm != null ? `${log.heartRateBpm} bpm` : '—'}</span>
                    <span>Resp: {log.respRateRpm != null ? `${log.respRateRpm} rpm` : '—'}</span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant">Feeding: {log.feedingStatus || '—'}</p>
                  <p className="text-body-sm text-on-surface-variant">Medication: {log.medicationGiven || '—'}</p>
                  <p className="text-body-sm text-on-surface">{log.notes || '—'}</p>
                  <p className="text-label-sm text-on-surface-variant">
                    By: {log.performedBy != null ? `Staff #${log.performedBy}` : '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-xl pb-xl">
          <button
            onClick={onClose}
            className="w-full min-h-[44px] rounded-xl border border-outline-variant bg-surface text-on-surface hover:bg-surface-container text-body-md font-medium transition-colors"
          >Close</button>
        </div>
      </div>
    </div>
  )
}

// ─── Cage Card ────────────────────────────────────────────────────────────────
function CageCard({ hospit, doctors, onCare, onDischarge, onEdit, onDelete, onHistory }: {
  hospit: Hospitalization
  doctors: Doctor[]
  onCare: () => void
  onDischarge: () => void
  onEdit: () => void
  onDelete: () => void
  onHistory: () => void
}) {
  const statusColor = STATUS_COLORS[hospit.status] ?? STATUS_COLORS.admitted
  const statusLabel = STATUS_LABELS[hospit.status] ?? hospit.status
  const isAdmitted = hospit.status === 'admitted'
  const canDelete = isAdmitted && hospit._count.careLogs === 0

  return (
    <div className="bg-surface rounded-2xl border border-outline-variant shadow-sm flex flex-col gap-sm p-lg hover:shadow-md transition-shadow">
      {/* Status badge + cage number */}
      <div className="flex items-center justify-between">
        <span className={`px-sm py-xs rounded-full text-label-md font-medium ${statusColor}`}>{statusLabel}</span>
        <span className="text-label-md text-on-surface-variant font-mono">Cage {hospit.cageNo ?? '—'}</span>
      </div>

      {/* Pet info */}
      <div className="flex items-center gap-md">
        <div className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center flex-shrink-0">
          <MaterialIcon name="pets" size={20} className="text-on-surface-variant" />
        </div>
        <div className="min-w-0">
          <p className="text-body-lg font-semibold text-on-surface truncate">{hospit.pet.name}</p>
          <p className="text-label-md text-on-surface-variant capitalize">{hospit.pet.species}</p>
        </div>
      </div>

      {/* Doctor + admit date */}
      <div className="flex flex-col gap-xs text-label-md text-on-surface-variant">
        <div className="flex items-center gap-xs">
          <MaterialIcon name="stethoscope" size={14} />
          <span>{doctorName(doctors, hospit.doctorInCharge)}</span>
        </div>
        <div className="flex items-center gap-xs">
          <MaterialIcon name="calendar_today" size={14} />
          <span>Admitted {formatDate(hospit.admittedAt)}</span>
        </div>
      </div>

      {/* Reason */}
      {hospit.reason && (
        <p className="text-body-sm text-on-surface-variant bg-surface-container-low rounded-lg px-sm py-xs line-clamp-2">
          {hospit.reason}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-sm mt-xs">
        <button
          onClick={onCare}
          className="flex-1 min-h-[44px] flex items-center justify-center gap-xs rounded-xl bg-primary text-primary-on text-body-sm font-medium hover:opacity-90 transition-opacity"
        >
          <MaterialIcon name="medical_services" size={16} />
          Log Care
        </button>
        <button
          onClick={onDischarge}
          className="flex-1 min-h-[44px] flex items-center justify-center gap-xs rounded-xl border border-outline-variant bg-surface text-on-surface text-body-sm font-medium hover:bg-surface-container transition-colors"
        >
          <MaterialIcon name="logout" size={16} />
          Discharge
        </button>
        <button
          onClick={onHistory}
          aria-label="View care history"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-outline-variant bg-surface text-on-surface hover:bg-surface-container transition-colors"
        >
          <MaterialIcon name="history" size={16} />
        </button>
        {isAdmitted && (
          <button
            onClick={onEdit}
            aria-label="Edit admission"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <MaterialIcon name="edit" size={16} />
          </button>
        )}
        {canDelete && (
          <button
            onClick={onDelete}
            aria-label="Delete admission"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-outline-variant bg-surface text-error hover:bg-error-container transition-colors"
          >
            <MaterialIcon name="delete" size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function ClinicInpatient() {
  const [careTarget, setCareTarget] = useState<Hospitalization | null>(null)
  const [editTarget, setEditTarget] = useState<Hospitalization | null>(null)
  const [historyTarget, setHistoryTarget] = useState<Hospitalization | null>(null)
  const qc = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery<Hospitalization[]>({
    queryKey: ['inpatient-active'],
    queryFn: () => api.get('/api/hospitalizations/active').then(r => r.data.data),
    refetchInterval: 60_000,
  })

  const { data: doctorsData } = useQuery({
    queryKey: ['appointments', 'doctors'],
    queryFn: () => api.get('/api/appointments/doctors').then(r => r.data.data as Doctor[]),
  })
  const doctors = doctorsData ?? []

  const discharge = useMutation({
    mutationFn: (id: number) => api.put(`/api/hospitalizations/${id}/discharge`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inpatient-active'] }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/hospitalizations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inpatient-active'] }),
  })

  function handleDischarge(hospit: Hospitalization) {
    if (!window.confirm(`Discharge ${hospit.pet.name}? This will generate the billing invoice.`)) return
    discharge.mutate(hospit.id)
  }

  function handleDelete(hospit: Hospitalization) {
    if (!window.confirm(`Delete this admission for ${hospit.pet.name}? This cannot be undone.`)) return
    remove.mutate(hospit.id)
  }

  const list = data ?? []

  return (
    <div className="p-lg flex flex-col gap-lg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-headline-md font-headline font-bold text-on-surface">Inpatient Board</h1>
          <p className="text-body-md text-on-surface-variant">
            {isLoading ? 'Loading…' : `${list.length} active admission${list.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-outline-variant bg-surface hover:bg-surface-container text-on-surface-variant transition-colors"
          title="Refresh"
        >
          <MaterialIcon name="refresh" size={20} />
        </button>
      </div>

      {/* States */}
      {isLoading && (
        <div className="flex justify-center py-xl">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {isError && (
        <div className="bg-error-container text-error rounded-xl p-lg text-body-md flex items-center gap-sm">
          <MaterialIcon name="error" size={20} />
          Failed to load inpatient data. Please refresh.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && list.length === 0 && (
        <div className="flex flex-col items-center justify-center py-xl gap-md text-on-surface-variant">
          <MaterialIcon name="local_hospital" size={48} className="text-outline" />
          <p className="text-body-lg font-medium text-on-surface">No active admissions</p>
          <p className="text-body-md">All patients have been discharged or no admissions today.</p>
        </div>
      )}

      {/* Cage grid */}
      {list.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-lg">
          {list.map(h => (
            <CageCard
              key={h.id}
              hospit={h}
              doctors={doctors}
              onCare={() => setCareTarget(h)}
              onDischarge={() => handleDischarge(h)}
              onEdit={() => setEditTarget(h)}
              onDelete={() => handleDelete(h)}
              onHistory={() => setHistoryTarget(h)}
            />
          ))}
        </div>
      )}

      {/* Care modal */}
      {careTarget && (
        <CareModal
          hospit={careTarget}
          onClose={() => setCareTarget(null)}
          onSaved={() => setCareTarget(null)}
        />
      )}

      {/* Edit modal */}
      {editTarget && (
        <EditModal
          hospit={editTarget}
          doctors={doctors}
          onClose={() => setEditTarget(null)}
          onSaved={() => setEditTarget(null)}
        />
      )}

      {/* Care history modal */}
      {historyTarget && (
        <CareHistoryModal
          hospit={historyTarget}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  )
}
