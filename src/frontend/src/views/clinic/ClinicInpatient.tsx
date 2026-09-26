import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'
import { VitalStepper } from '../../components/VitalStepper'
import { useT } from '../../i18n'
import { useUiStore } from '../../store/uiStore'
import { formatDate, formatDateTime } from '../../i18n/dateFormat'
import { speciesLabel } from '../../i18n/speciesLabel'

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
  heartRateBpm: number | null
  respRateRpm: number | null
  feedingStatus: string | null
  medicationGiven: string | null
  notes: string | null
}

// One row of `DailyInpatientCare` as returned nested under `careLogs` by
// `GET /api/hospitalizations/:id`, already sorted newest-first server-side.
// `performedBy` is a `User.id` (any staff role, not necessarily a Doctor).
// `performedByUser` is the server-resolved name (ADR-0013 D4) — render it
// when present; fall back to "Staff #<id>" then "—". Never resolve a name
// client-side from the doctors-picker map (that map is keyed by
// doctorInCharge, a different population — see grill finding 1).
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
  performedByUser?: { id: number; name: string } | null
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

// R-1: `hospit.status` stays this raw English value everywhere (STATUS_COLORS,
// the isAdmitted/canDelete checks, the discharge/delete payloads) — only the
// *display* label is translated, via `statusLabel()` below. A status with no
// key (X-1: a future/unknown status) renders raw, exactly as before.
const STATUS_LABEL_KEYS: Record<string, string> = {
  admitted:   'clinic.inpatient.statusAdmitted',
  stable:     'clinic.inpatient.statusStable',
  attention:  'clinic.inpatient.statusAttention',
  critical:   'clinic.inpatient.statusCritical',
  discharged: 'clinic.inpatient.statusDischarged',
}
function statusLabel(t: (key: string) => string, status: string): string {
  const key = STATUS_LABEL_KEYS[status]
  return key ? t(key) : status
}

const TIME_SLOTS = ['08:00', '12:00', '16:00', '20:00']

// Controlled feeding-status vocabulary (BA D1). '__other__' is a UI-only sentinel —
// never sent as a literal feedingStatus value; see buildPayload/step3 for the
// draft-preserving "Other" text-input handling (grill finding F1).
// R-1: `feedingStatus` (state, the POSTed care-record field, and the Care
// History "Feeding:" line) stays this raw English value — only the select's
// display label is translated, via `feedingLabel()` below. A legacy/free-text
// value with no key (e.g. history fixture `'Ate well'`) renders raw (X-1).
const FEEDING_OPTIONS = ['', 'Ate all', 'Ate some', 'Refused', 'NPO', 'Assisted feeding', '__other__'] as const
const FEEDING_LABEL_KEYS: Record<string, string> = {
  '':                 'clinic.inpatient.feedingNotAssessed',
  'Ate all':          'clinic.inpatient.feedingAteAll',
  'Ate some':         'clinic.inpatient.feedingAteSome',
  'Refused':          'clinic.inpatient.feedingRefused',
  'NPO':              'clinic.inpatient.feedingNpo',
  'Assisted feeding': 'clinic.inpatient.feedingAssisted',
  '__other__':        'common.other',
}
function feedingLabel(t: (key: string) => string, value: string): string {
  const key = FEEDING_LABEL_KEYS[value]
  return key ? t(key) : value
}

function doctorName(doctors: Doctor[], id: number | null, t: (key: string) => string): string {
  if (id == null) return t('clinic.inpatient.unassignedDoctor')
  return doctors.find(d => d.id === id)?.name ?? t('clinic.inpatient.unassignedDoctor')
}

const inputCls = 'bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary'
const textareaCls = 'bg-surface-container-low rounded-lg px-md py-sm min-h-[80px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary resize-none'

// ─── Care Modal ───────────────────────────────────────────────────────────────
/**
 * Normalizes optional `CareEntry` string fields before POST — blank/whitespace-only
 * strings become `null` rather than `''`, for a consistent nullable contract across
 * all 4 optional fields (grill finding F3). `temperatureC`/`heartRateBpm`/
 * `respRateRpm` are already `number | null` from `VitalStepper`'s own commit logic.
 */
function buildPayload(entry: CareEntry): CareEntry {
  return {
    ...entry,
    feedingStatus: entry.feedingStatus?.trim() || null,
    medicationGiven: entry.medicationGiven?.trim() || null,
    notes: entry.notes?.trim() || null,
  }
}

function CareModal({ hospit, onClose, onSaved }: {
  hospit: Hospitalization
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const [step, setStep] = useState(1)
  const [entry, setEntry] = useState<CareEntry>({
    timeSlot: TIME_SLOTS[0],
    temperatureC: null,
    heartRateBpm: null,
    respRateRpm: null,
    feedingStatus: null,
    medicationGiven: null,
    notes: null,
  })
  const [feedingOther, setFeedingOther] = useState('')
  // UI-only: tracks whether "Other" is the active select choice, independent of
  // entry.feedingStatus (which goes null when "Other" is chosen but the draft
  // text is still blank) — otherwise a blank "Other" selection would silently
  // revert the select to "Not assessed" (grill finding F1).
  const [feedingOtherMode, setFeedingOtherMode] = useState(false)
  const [error, setError] = useState('')

  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: (data: CareEntry) => api.post(`/api/hospitalizations/${hospit.id}/care`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inpatient-active'] })
      qc.invalidateQueries({ queryKey: ['hospitalization', hospit.id] })
      onSaved()
    },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('clinic.inpatient.failedSaveCareRecord'))
    },
  })

  function handleSave() {
    setError('')
    mut.mutate(buildPayload(entry))
  }

  function step1() {
    return (
      <div className="flex flex-col gap-md">
        <p className="text-body-md text-on-surface-variant mb-sm">{t('clinic.inpatient.selectCareTimeSlot')}</p>
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

  function step2() {
    return (
      <div className="grid grid-cols-1 gap-md">
        <VitalStepper
          label={t('clinic.inpatient.temperature')} unit="°C" value={entry.temperatureC}
          onChange={v => setEntry(e => ({ ...e, temperatureC: v }))}
          step={0.1} max={999.9}
        />
        <VitalStepper
          label={t('clinic.inpatient.heartRate')} unit={t('clinic.inpatient.unitBpm')} value={entry.heartRateBpm}
          onChange={v => setEntry(e => ({ ...e, heartRateBpm: v }))}
          step={1} min={1} max={3000}
        />
        <VitalStepper
          label={t('clinic.inpatient.respRate')} unit={t('clinic.inpatient.unitRpm')} value={entry.respRateRpm}
          onChange={v => setEntry(e => ({ ...e, respRateRpm: v }))}
          step={1} min={1} max={3000}
        />
      </div>
    )
  }

  const selectedFeedingValue = feedingOtherMode ? '__other__' : (entry.feedingStatus ?? '')

  function step3() {
    return (
      <div className="flex flex-col gap-lg">
        <div className="flex flex-col gap-xs">
          <label htmlFor="feeding-status" className="text-label-md text-on-surface-variant">{t('clinic.inpatient.feedingStatusLabel')}</label>
          <select
            id="feeding-status"
            className={inputCls}
            value={selectedFeedingValue}
            onChange={e => {
              const v = e.target.value
              if (v === '__other__') {
                setFeedingOtherMode(true)
                setEntry(en => ({ ...en, feedingStatus: feedingOther || null }))
              } else {
                setFeedingOtherMode(false)
                setEntry(en => ({ ...en, feedingStatus: v === '' ? null : v }))
              }
            }}
          >
            {FEEDING_OPTIONS.map(v => <option key={v} value={v}>{feedingLabel(t, v)}</option>)}
          </select>
          {feedingOtherMode && (
            <input
              id="feeding-other"
              maxLength={255}
              value={feedingOther}
              onChange={e => {
                setFeedingOther(e.target.value)
                setEntry(en => ({ ...en, feedingStatus: e.target.value || null }))
              }}
              placeholder={t('clinic.inpatient.describeFeedingStatus')}
              aria-label={t('clinic.inpatient.describeFeedingStatus')}
              className={inputCls}
            />
          )}
        </div>

        <div className="flex flex-col gap-xs">
          <label htmlFor="medication-given" className="text-label-md text-on-surface-variant">{t('clinic.inpatient.medicationNoteOptional')}</label>
          <p className="text-label-md text-on-surface-variant">{t('clinic.inpatient.medicationDisclaimer')}</p>
          <textarea
            id="medication-given"
            value={entry.medicationGiven ?? ''}
            onChange={e => setEntry(en => ({ ...en, medicationGiven: e.target.value }))}
            rows={3}
            placeholder={t('clinic.inpatient.medicationPlaceholder')}
            className={textareaCls}
          />
        </div>

        <div className="flex flex-col gap-xs">
          <label htmlFor="care-notes" className="text-label-md text-on-surface-variant">{t('clinic.inpatient.careNotesOptional')}</label>
          <textarea
            id="care-notes"
            value={entry.notes ?? ''}
            onChange={e => setEntry(en => ({ ...en, notes: e.target.value }))}
            rows={3}
            placeholder={t('clinic.inpatient.careNotesPlaceholder')}
            className={textareaCls}
          />
        </div>

        {error && <p className="text-error text-body-sm">{error}</p>}
      </div>
    )
  }

  const steps = [step1, step2, step3]
  const titles = [
    t('clinic.inpatient.stepSelectTimeSlot'),
    t('clinic.inpatient.stepRecordVitals'),
    t('clinic.inpatient.stepCareNotes'),
  ]

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-md" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl shadow-xl w-full max-w-xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-xl pt-xl pb-md border-b border-outline-variant">
          <div>
            <p className="text-label-md text-on-surface-variant">{t('clinic.inpatient.logCareRecordTitle').replace('{name}', hospit.pet.name)}</p>
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
        <div className="px-xl py-lg flex-1 max-h-[min(80vh,640px)] overflow-y-auto">
          {steps[step - 1]()}
        </div>

        {/* Footer */}
        <div className="flex gap-sm px-xl pb-xl">
          {step > 1 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex-1 min-h-[44px] rounded-xl border border-outline-variant bg-surface text-on-surface hover:bg-surface-container text-body-md font-medium transition-colors"
            >{t('common.back')}</button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-on text-body-md font-medium hover:opacity-90 transition-opacity"
            >{t('common.next')}</button>
          ) : (
            <button
              onClick={handleSave}
              disabled={mut.isPending}
              className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-on text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >{mut.isPending ? t('common.saving') : t('clinic.inpatient.saveCareRecord')}</button>
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
  const t = useT()
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
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('clinic.inpatient.failedAdmitPatient'))
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
          <h3 className="text-headline-sm font-headline font-bold text-on-surface">{t('clinic.inpatient.admitToInpatient')}</h3>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant transition-colors">
            <MaterialIcon name="close" size={20} />
          </button>
        </div>
        {error && <p className="text-error text-body-sm mb-md">{error}</p>}
        <form onSubmit={submit} className="flex flex-col gap-md">
          <input required className={inputCls} placeholder={t('clinic.inpatient.reasonForAdmission')} value={form.reason} onChange={set('reason')} />
          <input className={inputCls} placeholder={t('clinic.inpatient.cageNumberOptional')} value={form.cageNo} onChange={set('cageNo')} />
          <select className={inputCls} value={form.doctorInCharge} onChange={set('doctorInCharge')}>
            <option value="">{t('clinic.inpatient.doctorInChargeOptional')}</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input type="number" step="0.01" min="0" max="99999999.99" className={inputCls} placeholder={t('clinic.inpatient.dailyRate')} value={form.dailyRate} onChange={set('dailyRate')} />
          <textarea className={textareaCls} placeholder={t('clinic.inpatient.notesOptional')} value={form.notes} onChange={set('notes')} rows={3} />
          <div className="flex gap-md pt-sm">
            <button type="button" onClick={onClose} className="flex-1 min-h-[44px] rounded-xl border border-outline-variant text-body-sm font-semibold hover:bg-surface-container-low transition-colors">{t('common.cancel')}</button>
            <button type="submit" disabled={mut.isPending || !form.reason.trim()} className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-on text-body-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{mut.isPending ? t('clinic.inpatient.admittingEllipsis') : t('clinic.inpatient.admitPatient')}</button>
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
  const t = useT()
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
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('clinic.inpatient.failedSaveChanges'))
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
          <h3 className="text-headline-sm font-headline font-bold text-on-surface">{t('clinic.inpatient.editAdmissionTitle').replace('{name}', hospit.pet.name)}</h3>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant transition-colors">
            <MaterialIcon name="close" size={20} />
          </button>
        </div>
        {error && <p className="text-error text-body-sm mb-md">{error}</p>}
        <form onSubmit={submit} className="flex flex-col gap-md">
          <input required className={inputCls} placeholder={t('clinic.inpatient.reasonForAdmission')} value={form.reason} onChange={set('reason')} />
          <input className={inputCls} placeholder={t('clinic.inpatient.cageNumberOptional')} value={form.cageNo} onChange={set('cageNo')} />
          <select className={inputCls} value={form.doctorInCharge} onChange={set('doctorInCharge')}>
            <option value="">{t('clinic.inpatient.doctorInChargeOptional')}</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input type="number" step="0.01" min="0" max="99999999.99" className={inputCls} placeholder={t('clinic.inpatient.dailyRate')} value={form.dailyRate} onChange={set('dailyRate')} />
          <textarea className={textareaCls} placeholder={t('clinic.inpatient.notesOptional')} value={form.notes} onChange={set('notes')} rows={3} />
          <div className="flex gap-md pt-sm">
            <button type="button" onClick={onClose} className="flex-1 min-h-[44px] rounded-xl border border-outline-variant text-body-sm font-semibold hover:bg-surface-container-low transition-colors">{t('common.cancel')}</button>
            <button type="submit" disabled={mut.isPending} className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-on text-body-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{mut.isPending ? t('common.saving') : t('clinic.inpatient.saveChanges')}</button>
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
  const t = useT()
  const language = useUiStore(s => s.language)
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
            <p className="text-headline-sm font-headline font-bold text-on-surface">{t('clinic.inpatient.careHistory')}</p>
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
              {t('clinic.inpatient.failedLoadCareHistory')}
            </div>
          )}
          {!isLoading && !isError && logs.length === 0 && (
            <p className="text-body-md text-on-surface-variant text-center py-xl">{t('clinic.inpatient.noCareHistoryYet')}</p>
          )}
          {!isLoading && !isError && logs.length > 0 && (
            <div className="flex flex-col gap-sm">
              {logs.map(log => (
                <div key={log.id} className="rounded-xl border border-outline-variant p-md flex flex-col gap-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-label-md font-semibold text-on-surface">{formatDateTime(log.recordedAt, language)}</span>
                    <span className="px-sm py-xs rounded-full bg-surface-container-low text-label-sm text-on-surface-variant">{log.timeSlot}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-sm text-body-sm text-on-surface-variant">
                    <span>{t('clinic.inpatient.tempShort')} {log.temperatureC != null ? `${Number(log.temperatureC).toFixed(1)}°C` : '—'}</span>
                    <span>{t('clinic.inpatient.hrShort')} {log.heartRateBpm != null ? `${log.heartRateBpm} ${t('clinic.inpatient.unitBpm')}` : '—'}</span>
                    <span>{t('clinic.inpatient.respShort')} {log.respRateRpm != null ? `${log.respRateRpm} ${t('clinic.inpatient.unitRpm')}` : '—'}</span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant">{t('clinic.inpatient.feedingShort')} {log.feedingStatus ? feedingLabel(t, log.feedingStatus) : '—'}</p>
                  <p className="text-body-sm text-on-surface-variant">{t('clinic.inpatient.medicationShort')} {log.medicationGiven || '—'}</p>
                  <p className="text-body-sm text-on-surface">{log.notes || '—'}</p>
                  <p className="text-label-sm text-on-surface-variant">
                    {t('clinic.inpatient.byPrefix')} {log.performedByUser?.name ?? (log.performedBy != null ? t('common.staffNumber').replace('{id}', String(log.performedBy)) : '—')}
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
          >{t('common.close')}</button>
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
  const t = useT()
  const language = useUiStore(s => s.language)
  const statusColor = STATUS_COLORS[hospit.status] ?? STATUS_COLORS.admitted
  const isAdmitted = hospit.status === 'admitted'
  const canDelete = isAdmitted && hospit._count.careLogs === 0

  return (
    <div className="bg-surface rounded-2xl border border-outline-variant shadow-sm flex flex-col gap-sm p-lg hover:shadow-md transition-shadow">
      {/* Status badge + cage number */}
      <div className="flex items-center justify-between">
        <span className={`px-sm py-xs rounded-full text-label-md font-medium ${statusColor}`}>{statusLabel(t, hospit.status)}</span>
        <span className="text-label-md text-on-surface-variant font-mono">{t('clinic.inpatient.cageNo').replace('{no}', hospit.cageNo ?? '—')}</span>
      </div>

      {/* Pet info */}
      <div className="flex items-center gap-md">
        <div className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center flex-shrink-0">
          <MaterialIcon name="pets" size={20} className="text-on-surface-variant" />
        </div>
        <div className="min-w-0">
          <p className="text-body-lg font-semibold text-on-surface truncate">{hospit.pet.name}</p>
          <p className="text-label-md text-on-surface-variant capitalize">{speciesLabel(t, hospit.pet.species)}</p>
        </div>
      </div>

      {/* Doctor + admit date */}
      <div className="flex flex-col gap-xs text-label-md text-on-surface-variant">
        <div className="flex items-center gap-xs">
          <MaterialIcon name="stethoscope" size={14} />
          <span>{doctorName(doctors, hospit.doctorInCharge, t)}</span>
        </div>
        <div className="flex items-center gap-xs">
          <MaterialIcon name="calendar_today" size={14} />
          <span>{t('clinic.inpatient.admittedDate').replace('{date}', formatDate(hospit.admittedAt, language))}</span>
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
          className="flex-1 min-h-[44px] px-sm whitespace-nowrap flex items-center justify-center gap-xs rounded-xl bg-primary text-primary-on text-body-sm font-medium hover:opacity-90 transition-opacity"
        >
          <MaterialIcon name="medical_services" size={16} />
          {t('clinic.inpatient.logCare')}
        </button>
        <button
          onClick={onDischarge}
          className="flex-1 min-h-[44px] px-sm whitespace-nowrap flex items-center justify-center gap-xs rounded-xl border border-outline-variant bg-surface text-on-surface text-body-sm font-medium hover:bg-surface-container transition-colors"
        >
          <MaterialIcon name="logout" size={16} />
          {t('clinic.inpatient.discharge')}
        </button>
        <button
          onClick={onHistory}
          aria-label={t('clinic.inpatient.viewCareHistoryAria')}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-outline-variant bg-surface text-on-surface hover:bg-surface-container transition-colors"
        >
          <MaterialIcon name="history" size={16} />
        </button>
        {isAdmitted && (
          <button
            onClick={onEdit}
            aria-label={t('clinic.inpatient.editAdmissionAria')}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <MaterialIcon name="edit" size={16} />
          </button>
        )}
        {canDelete && (
          <button
            onClick={onDelete}
            aria-label={t('clinic.inpatient.deleteAdmissionAria')}
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
// Which single modal (if any) is open, and for which record — a discriminated
// union rather than 3 independent nullable states, so only one modal can ever
// be "the open one" structurally (Lane B fix: previously nothing cleared one
// modal's state when another opened, so two could render stacked at once).
type InpatientModalState =
  | { kind: 'care'; hospit: Hospitalization }
  | { kind: 'edit'; hospit: Hospitalization }
  | { kind: 'history'; hospit: Hospitalization }

export default function ClinicInpatient() {
  const t = useT()
  const [activeModal, setActiveModal] = useState<InpatientModalState | null>(null)
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
    if (!window.confirm(t('clinic.inpatient.confirmDischarge').replace('{name}', hospit.pet.name))) return
    discharge.mutate(hospit.id)
  }

  function handleDelete(hospit: Hospitalization) {
    if (!window.confirm(t('clinic.inpatient.confirmDeleteAdmission').replace('{name}', hospit.pet.name))) return
    remove.mutate(hospit.id)
  }

  const list = data ?? []
  const activeAdmissionsText = (list.length === 1
    ? t('clinic.inpatient.activeAdmissionsOne')
    : t('clinic.inpatient.activeAdmissionsOther')
  ).replace('{n}', String(list.length))

  return (
    <div className="p-lg flex flex-col gap-lg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-headline-md font-headline font-bold text-on-surface">{t('clinic.inpatient.boardTitle')}</h1>
          <p className="text-body-md text-on-surface-variant">
            {isLoading ? t('common.loading') : activeAdmissionsText}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-outline-variant bg-surface hover:bg-surface-container text-on-surface-variant transition-colors"
          title={t('common.refresh')}
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
          {t('clinic.inpatient.failedLoadInpatientData')}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && list.length === 0 && (
        <div className="flex flex-col items-center justify-center py-xl gap-md text-on-surface-variant">
          <MaterialIcon name="local_hospital" size={48} className="text-outline" />
          <p className="text-body-lg font-medium text-on-surface">{t('clinic.inpatient.noActiveAdmissions')}</p>
          <p className="text-body-md">{t('clinic.inpatient.allDischargedOrNoneToday')}</p>
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
              onCare={() => setActiveModal({ kind: 'care', hospit: h })}
              onDischarge={() => handleDischarge(h)}
              onEdit={() => setActiveModal({ kind: 'edit', hospit: h })}
              onDelete={() => handleDelete(h)}
              onHistory={() => setActiveModal({ kind: 'history', hospit: h })}
            />
          ))}
        </div>
      )}

      {/* Care modal */}
      {activeModal?.kind === 'care' && (
        <CareModal
          hospit={activeModal.hospit}
          onClose={() => setActiveModal(null)}
          onSaved={() => setActiveModal(null)}
        />
      )}

      {/* Edit modal */}
      {activeModal?.kind === 'edit' && (
        <EditModal
          hospit={activeModal.hospit}
          doctors={doctors}
          onClose={() => setActiveModal(null)}
          onSaved={() => setActiveModal(null)}
        />
      )}

      {/* Care history modal */}
      {activeModal?.kind === 'history' && (
        <CareHistoryModal
          hospit={activeModal.hospit}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  )
}
