import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Hospitalization {
  id: number
  petId: number
  cageNumber: string
  status: string
  admitReason: string
  admittedAt: string
  lastCareAt: string | null
  assignedDoctorId: number
  pet: { id: number; name: string; species: string; photoUrl?: string }
  doctor: { id: number; name: string }
}

interface CareEntry {
  timeSlot: string
  temperature: number | null
  weight: number | null
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

function hoursAgo(iso: string | null): string {
  if (!iso) return 'No records yet'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
  if (diff < 1) return 'Less than 1 hour ago'
  if (diff === 1) return '1 hour ago'
  return `${diff} hours ago`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Care Modal ───────────────────────────────────────────────────────────────
function CareModal({ hospit, onClose, onSaved }: {
  hospit: Hospitalization
  onClose: () => void
  onSaved: () => void
}) {
  const [step, setStep] = useState(1)
  const [entry, setEntry] = useState<CareEntry>({
    timeSlot: TIME_SLOTS[0],
    temperature: null,
    weight: null,
    notes: '',
  })

  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: (data: CareEntry) => api.post(`/api/hospitalizations/${hospit.id}/care`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inpatient-active'] }); onSaved() },
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
          value={entry.temperature}
          onChange={v => setEntry(e => ({ ...e, temperature: v }))}
          unit="°C"
        />
        <Stepper
          label="Weight"
          value={entry.weight}
          onChange={v => setEntry(e => ({ ...e, weight: v }))}
          unit="kg"
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

// ─── Cage Card ────────────────────────────────────────────────────────────────
function CageCard({ hospit, onCare, onDischarge }: {
  hospit: Hospitalization
  onCare: () => void
  onDischarge: () => void
}) {
  const statusColor = STATUS_COLORS[hospit.status] ?? STATUS_COLORS.admitted
  const statusLabel = STATUS_LABELS[hospit.status] ?? hospit.status

  return (
    <div className="bg-surface rounded-2xl border border-outline-variant shadow-sm flex flex-col gap-sm p-lg hover:shadow-md transition-shadow">
      {/* Status badge + cage number */}
      <div className="flex items-center justify-between">
        <span className={`px-sm py-xs rounded-full text-label-md font-medium ${statusColor}`}>{statusLabel}</span>
        <span className="text-label-md text-on-surface-variant font-mono">Cage {hospit.cageNumber}</span>
      </div>

      {/* Pet info */}
      <div className="flex items-center gap-md">
        <div className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center flex-shrink-0">
          <MaterialIcon name={hospit.pet.species === 'cat' ? 'pets' : 'pets'} size={20} className="text-on-surface-variant" />
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
          <span>{hospit.doctor.name}</span>
        </div>
        <div className="flex items-center gap-xs">
          <MaterialIcon name="calendar_today" size={14} />
          <span>Admitted {formatDate(hospit.admittedAt)}</span>
        </div>
        <div className="flex items-center gap-xs">
          <MaterialIcon name="schedule" size={14} />
          <span>Last care: {hoursAgo(hospit.lastCareAt)}</span>
        </div>
      </div>

      {/* Reason */}
      {hospit.admitReason && (
        <p className="text-body-sm text-on-surface-variant bg-surface-container-low rounded-lg px-sm py-xs line-clamp-2">
          {hospit.admitReason}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-sm mt-xs">
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
      </div>
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function ClinicInpatient() {
  const [careTarget, setCareTarget] = useState<Hospitalization | null>(null)
  const qc = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery<Hospitalization[]>({
    queryKey: ['inpatient-active'],
    queryFn: () => api.get('/api/hospitalizations/active').then(r => r.data.data),
    refetchInterval: 60_000,
  })

  const discharge = useMutation({
    mutationFn: (id: number) => api.put(`/api/hospitalizations/${id}/discharge`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inpatient-active'] }),
  })

  function handleDischarge(hospit: Hospitalization) {
    if (!window.confirm(`Discharge ${hospit.pet.name}? This will generate the billing invoice.`)) return
    discharge.mutate(hospit.id)
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
              onCare={() => setCareTarget(h)}
              onDischarge={() => handleDischarge(h)}
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
    </div>
  )
}
