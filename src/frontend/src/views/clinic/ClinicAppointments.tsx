import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Appointment {
  id: number
  petId: number
  doctorId: number
  scheduledAt: string
  durationMin: number
  reason?: string
  status: string
  room?: string
  notes?: string
  pet: { id: number; name: string; species: string; photoUrl?: string }
  doctor: { id: number; name: string }
}

interface Doctor { id: number; name: string; role: string }
interface SearchResult { petId: number; petName: string; species: string; ownerId: number; ownerName: string; phone: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  scheduled:   'bg-primary-fixed text-on-surface',
  arrived:     'bg-secondary-container text-secondary-on-container',
  in_progress: 'bg-warning/20 text-warning',
  completed:   'bg-success/20 text-success',
  cancelled:   'bg-surface-container-high text-on-surface-variant line-through',
  no_show:     'bg-error-container text-error',
}

const STATUS_OPTIONS = ['scheduled', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show']

function dateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function weekDays(from: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(from, i))
}

const HOURS = Array.from({ length: 24 }, (_, i) => i).filter(h => h >= 8 && h <= 20)

// ─── Booking form ─────────────────────────────────────────────────────────────
function BookingForm({ selectedDate, selectedHour, doctors, onClose, onSaved }: {
  selectedDate: string
  selectedHour?: number
  doctors: Doctor[]
  onClose: () => void
  onSaved: () => void
}) {
  const [petSearch, setPetSearch]   = useState('')
  const [selectedPet, setSelected] = useState<SearchResult | null>(null)
  const [doctorId, setDoctorId]     = useState<number>(doctors[0]?.id ?? 0)
  const [date, setDate]             = useState(selectedDate)
  const [time, setTime]             = useState(selectedHour ? `${String(selectedHour).padStart(2, '0')}:00` : '09:00')
  const [duration, setDuration]     = useState(30)
  const [reason, setReason]         = useState('')
  const [error, setError]           = useState('')
  const [saving, setSaving]         = useState(false)

  const { data: searchData } = useQuery({
    queryKey: ['search', petSearch],
    queryFn: () => api.get('/api/search', { params: { q: petSearch } }).then(r => r.data.data as SearchResult[]),
    enabled: petSearch.length >= 2,
    staleTime: 10_000,
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPet) { setError('Please select a pet'); return }
    if (!doctorId) { setError('Please select a doctor'); return }
    setSaving(true)
    setError('')
    try {
      await api.post('/api/appointments', {
        petId:       selectedPet.petId,
        doctorId,
        scheduledAt: new Date(`${date}T${time}:00`).toISOString(),
        durationMin: duration,
        reason:      reason || null,
      })
      onSaved()
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to book')
    } finally { setSaving(false) }
  }

  return (
    <div className="w-80 flex-shrink-0 border-l border-outline-variant bg-surface flex flex-col">
      <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant">
        <h3 className="text-headline-sm font-headline font-bold">Book Appointment</h3>
        <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-surface-container-low rounded-lg"><MaterialIcon name="close" size={20} /></button>
      </div>
      <form onSubmit={submit} className="flex-1 overflow-y-auto p-lg flex flex-col gap-md">
        {error && <p className="text-error text-body-sm bg-error-container rounded-lg px-md py-sm">{error}</p>}

        {/* Pet search */}
        <div>
          <label className="text-body-sm font-medium text-on-surface-variant mb-xs block">Patient</label>
          {selectedPet ? (
            <div className="flex items-center gap-sm bg-surface-container-low rounded-lg px-md py-sm min-h-[44px]">
              <MaterialIcon name="pets" size={16} className="text-secondary" />
              <span className="flex-1 text-body-sm font-medium">{selectedPet.petName}</span>
              <button type="button" onClick={() => { setSelected(null); setPetSearch('') }} className="text-on-surface-variant min-h-[32px] min-w-[32px] flex items-center justify-center"><MaterialIcon name="close" size={16} /></button>
            </div>
          ) : (
            <div className="relative">
              <MaterialIcon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                className="w-full bg-surface-container-low rounded-lg py-sm pl-9 pr-md min-h-[44px] text-body-sm border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Search pet or owner…"
                value={petSearch}
                onChange={e => setPetSearch(e.target.value)}
              />
              {searchData && searchData.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-surface border border-outline-variant rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                  {searchData.map(r => (
                    <button key={r.petId} type="button" onClick={() => { setSelected(r); setPetSearch('') }}
                      className="w-full text-left px-md py-sm text-body-sm hover:bg-surface-container-low min-h-[44px] flex flex-col justify-center">
                      <span className="font-medium">{r.petName}</span>
                      <span className="text-on-surface-variant">{r.ownerName} · {r.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Doctor */}
        <div>
          <label className="text-body-sm font-medium text-on-surface-variant mb-xs block">Doctor</label>
          <select className="w-full bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-sm border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" value={doctorId} onChange={e => setDoctorId(parseInt(e.target.value))}>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {/* Date & time */}
        <div className="flex gap-md">
          <div className="flex-1">
            <label className="text-body-sm font-medium text-on-surface-variant mb-xs block">Date</label>
            <input type="date" className="w-full bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-sm border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="text-body-sm font-medium text-on-surface-variant mb-xs block">Time</label>
            <select className="w-full bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-sm border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" value={time} onChange={e => setTime(e.target.value)}>
              {HOURS.flatMap(h => ['00', '30'].map(m => `${String(h).padStart(2, '0')}:${m}`)).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="text-body-sm font-medium text-on-surface-variant mb-xs block">Duration</label>
          <select className="w-full bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-sm border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" value={duration} onChange={e => setDuration(parseInt(e.target.value))}>
            {[15, 30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d} min</option>)}
          </select>
        </div>

        {/* Reason */}
        <div>
          <label className="text-body-sm font-medium text-on-surface-variant mb-xs block">Reason (optional)</label>
          <textarea className="w-full bg-surface-container-low rounded-lg px-md py-sm text-body-sm border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary min-h-[80px] resize-none" placeholder="Chief complaint or visit type…" value={reason} onChange={e => setReason(e.target.value)} />
        </div>

        <button type="submit" disabled={saving} className="w-full min-h-[44px] bg-primary text-primary-on rounded-lg text-body-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{saving ? 'Booking…' : 'Book Appointment'}</button>
      </form>
    </div>
  )
}

// ─── Appointment detail popover ───────────────────────────────────────────────
function AppointmentDetail({ appt, onClose, onStatusChange }: {
  appt: Appointment
  onClose: () => void
  onStatusChange: (id: number, status: string) => void
}) {
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-lg">
      <div className="bg-surface rounded-xl shadow-lg w-full max-w-sm p-xl">
        <div className="flex items-center justify-between mb-lg">
          <h3 className="text-headline-sm font-headline font-bold">{appt.pet.name}</h3>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-surface-container-low rounded-lg"><MaterialIcon name="close" size={20} /></button>
        </div>
        <div className="flex flex-col gap-sm mb-lg">
          <p className="text-body-sm"><span className="text-on-surface-variant">Doctor:</span> {appt.doctor.name}</p>
          <p className="text-body-sm"><span className="text-on-surface-variant">Time:</span> {formatTime(appt.scheduledAt)} · {appt.durationMin} min</p>
          {appt.reason && <p className="text-body-sm"><span className="text-on-surface-variant">Reason:</span> {appt.reason}</p>}
        </div>
        <p className="text-body-sm font-medium text-on-surface-variant mb-sm">Update Status</p>
        <div className="grid grid-cols-2 gap-sm">
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => { onStatusChange(appt.id, s); onClose() }}
              className={`min-h-[44px] rounded-lg text-body-sm font-medium capitalize transition-colors ${appt.status === s ? 'ring-2 ring-primary' : 'bg-surface-container-low hover:bg-surface-container'}`}>
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────
export default function ClinicAppointments() {
  const qc = useQueryClient()
  const [viewMode, setViewMode]         = useState<'day' | 'week'>('day')
  const [currentDate, setCurrentDate]   = useState(new Date())
  const [filterDoctorId, setFilterDoc]  = useState<number | null>(null)
  const [showForm, setShowForm]         = useState(false)
  const [selectedHour, setSelectedHour] = useState<number | undefined>()
  const [detailAppt, setDetailAppt]     = useState<Appointment | null>(null)

  const queryDate = viewMode === 'day' ? dateStr(currentDate) : dateStr(currentDate)

  const { data: apptData, isLoading } = useQuery({
    queryKey: ['appointments', queryDate, viewMode, filterDoctorId],
    queryFn: () => api.get('/api/appointments', {
      params: { date: queryDate, week: viewMode === 'week' ? 'true' : undefined, doctorId: filterDoctorId ?? undefined }
    }).then(r => r.data.data as Appointment[]),
    staleTime: 30_000,
  })

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data.data as Doctor[]),
    staleTime: 300_000,
  })

  const appointments = apptData ?? []
  const doctors = (usersData ?? []).filter((u: Doctor) => u.role === 'doctor')

  const mutateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.put(`/api/appointments/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  })

  const days = viewMode === 'week' ? weekDays(currentDate) : [currentDate]

  const apptsByDayAndHour = (day: Date, hour: number) =>
    appointments.filter(a => {
      const d = new Date(a.scheduledAt)
      return d.getDate() === day.getDate() && d.getMonth() === day.getMonth() && d.getHours() === hour
    })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-md px-lg py-md border-b border-outline-variant bg-surface flex-shrink-0 flex-wrap gap-y-sm">
        {/* Date nav */}
        <div className="flex items-center gap-sm">
          <button onClick={() => setCurrentDate(d => addDays(d, viewMode === 'week' ? -7 : -1))}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-surface-container-low rounded-lg">
            <MaterialIcon name="chevron_left" size={24} />
          </button>
          <span className="text-body-md font-semibold min-w-[160px] text-center">
            {viewMode === 'week'
              ? `${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(currentDate, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
            }
          </span>
          <button onClick={() => setCurrentDate(d => addDays(d, viewMode === 'week' ? 7 : 1))}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-surface-container-low rounded-lg">
            <MaterialIcon name="chevron_right" size={24} />
          </button>
          <button onClick={() => setCurrentDate(new Date())}
            className="px-md py-sm min-h-[44px] rounded-lg border border-outline-variant text-body-sm hover:bg-surface-container-low transition-colors">
            Today
          </button>
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg overflow-hidden border border-outline-variant">
          {(['day', 'week'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`px-lg py-sm min-h-[44px] text-body-sm font-medium capitalize transition-colors ${viewMode === m ? 'bg-primary text-primary-on' : 'hover:bg-surface-container-low'}`}>
              {m}
            </button>
          ))}
        </div>

        {/* Doctor filter */}
        <select
          className="bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-sm border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary"
          value={filterDoctorId ?? ''}
          onChange={e => setFilterDoc(e.target.value ? parseInt(e.target.value) : null)}
        >
          <option value="">All doctors</option>
          {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        <div className="flex-1" />

        <button
          onClick={() => { setShowForm(true); setSelectedHour(undefined) }}
          className="flex items-center gap-sm bg-primary text-primary-on rounded-lg px-lg py-sm min-h-[44px] text-body-sm font-semibold hover:bg-primary/90 transition-colors">
          <MaterialIcon name="add" size={18} />Book Appointment
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Calendar grid */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-on-surface-variant">Loading…</div>
          ) : (
            <div className="min-w-[600px]">
              {/* Day headers */}
              <div className={`grid sticky top-0 bg-surface z-10 border-b border-outline-variant`}
                style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}>
                <div className="h-12" />
                {days.map(d => (
                  <div key={d.toISOString()} className="h-12 flex items-center justify-center border-l border-outline-variant/50 text-body-sm font-semibold">
                    <span className={d.toDateString() === new Date().toDateString() ? 'text-secondary' : ''}>
                      {d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>

              {/* Time rows */}
              {HOURS.map(hour => (
                <div key={hour} className="grid border-b border-outline-variant/30"
                  style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)`, minHeight: 64 }}>
                  {/* Time label */}
                  <div className="flex items-start pt-sm px-sm text-label-md text-on-surface-variant border-r border-outline-variant/50">
                    {String(hour).padStart(2, '0')}:00
                  </div>
                  {/* Day columns */}
                  {days.map(day => {
                    const dayAppts = apptsByDayAndHour(day, hour)
                    return (
                      <div
                        key={day.toISOString()}
                        className="border-l border-outline-variant/30 p-xs min-h-[64px] hover:bg-surface-container-low/50 cursor-pointer transition-colors"
                        onClick={() => { setSelectedHour(hour); setShowForm(true) }}
                      >
                        {dayAppts.map(a => (
                          <div
                            key={a.id}
                            onClick={e => { e.stopPropagation(); setDetailAppt(a) }}
                            className={`rounded-lg px-sm py-xs text-body-sm font-medium mb-xs cursor-pointer hover:opacity-80 transition-opacity ${STATUS_COLORS[a.status] ?? 'bg-surface-container text-on-surface'}`}
                          >
                            <p className="font-semibold truncate">{a.pet.name}</p>
                            <p className="text-label-md opacity-80 truncate">{a.doctor.name} · {formatTime(a.scheduledAt)}</p>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Booking form panel */}
        {showForm && (
          <BookingForm
            selectedDate={dateStr(currentDate)}
            selectedHour={selectedHour}
            doctors={doctors}
            onClose={() => setShowForm(false)}
            onSaved={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['appointments'] }) }}
          />
        )}
      </div>

      {/* ── Appointment detail modal ── */}
      {detailAppt && (
        <AppointmentDetail
          appt={detailAppt}
          onClose={() => setDetailAppt(null)}
          onStatusChange={(id, status) => mutateStatus.mutate({ id, status })}
        />
      )}
    </div>
  )
}
