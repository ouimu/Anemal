import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'

// ─── Types ────────────────────────────────────────────────────────────────────
interface GroomingBooking {
  id: number
  petId: number
  groomerId: number | null
  serviceType: string
  scheduledAt: string
  durationMin: number
  status: string
  specialInstructions?: string
  notes?: string
  pet: { id: number; name: string; species: string }
  groomer?: { id: number; name: string }
}

interface SearchResult {
  petId: number; petName: string; species: string; ownerId: number; ownerName: string; phone: string
}

interface StaffUser { id: number; name: string; role: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  scheduled:   'bg-primary-fixed text-on-surface',
  in_progress: 'bg-warning/20 text-warning',
  completed:   'bg-success/20 text-success',
  cancelled:   'bg-surface-container-high text-on-surface-variant line-through',
}

const STATUS_NEXT: Record<string, string> = {
  scheduled:   'in_progress',
  in_progress: 'completed',
}

const STATUS_LABELS: Record<string, string> = {
  scheduled:   'Scheduled',
  in_progress: 'In Progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
}

const SERVICE_TYPES = ['Bath & Dry', 'Full Groom', 'Trim & Tidy', 'Nail Trim', 'Teeth Cleaning']
const HOURS = Array.from({ length: 11 }, (_, i) => i + 8) // 08–18

function dateStr(d: Date) { return d.toISOString().split('T')[0] }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function formatDateLabel(d: Date) {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}
function bookingHour(iso: string) { return new Date(iso).getHours() }

// ─── Booking Modal ────────────────────────────────────────────────────────────
function BookingModal({ date, onClose, onSaved }: {
  date: string
  onClose: () => void
  onSaved: () => void
}) {
  const [petSearch, setPetSearch] = useState('')
  const [selectedPet, setSelectedPet] = useState<SearchResult | null>(null)
  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0])
  const [groomerId, setGroomerId] = useState<number | ''>('')
  const [hour, setHour] = useState(9)
  const [instructions, setInstructions] = useState('')

  const { data: searchResults = [] } = useQuery<SearchResult[]>({
    queryKey: ['owner-search', petSearch],
    queryFn: () => api.get(`/api/search?q=${encodeURIComponent(petSearch)}`).then(r => r.data.data),
    enabled: petSearch.length >= 2,
  })

  const { data: staff = [] } = useQuery<StaffUser[]>({
    queryKey: ['staff-list'],
    queryFn: () => api.get('/users?role=staff').then(r => r.data.data),
  })

  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: (body: object) => api.post('/api/grooming/bookings', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['grooming'] }); onSaved() },
  })

  function submit() {
    if (!selectedPet) return
    const scheduledAt = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`)
    mut.mutate({
      petId: selectedPet.petId,
      groomerId: groomerId || null,
      serviceType,
      scheduledAt: scheduledAt.toISOString(),
      specialInstructions: instructions || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-md" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-xl pt-xl pb-md border-b border-outline-variant sticky top-0 bg-surface z-10">
          <p className="text-headline-sm font-headline font-bold text-on-surface">New Grooming Booking</p>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant transition-colors">
            <MaterialIcon name="close" size={20} />
          </button>
        </div>

        <div className="px-xl py-lg flex flex-col gap-lg">
          {/* Pet search */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-lg text-on-surface-variant">Patient</label>
            {selectedPet ? (
              <div className="flex items-center justify-between bg-surface-container-low rounded-xl px-lg py-md">
                <div>
                  <p className="text-body-md font-medium text-on-surface">{selectedPet.petName}</p>
                  <p className="text-label-md text-on-surface-variant">{selectedPet.ownerName} · {selectedPet.phone}</p>
                </div>
                <button onClick={() => { setSelectedPet(null); setPetSearch('') }} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-on-surface-variant hover:text-error transition-colors">
                  <MaterialIcon name="close" size={16} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={petSearch}
                  onChange={e => setPetSearch(e.target.value)}
                  placeholder="Search by pet name, owner name, or phone…"
                  className="w-full rounded-xl border border-outline-variant bg-surface px-lg py-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
                />
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-xs bg-surface border border-outline-variant rounded-xl shadow-lg z-20 overflow-hidden">
                    {searchResults.map(r => (
                      <button
                        key={r.petId}
                        onClick={() => { setSelectedPet(r); setPetSearch('') }}
                        className="w-full text-left px-lg py-md hover:bg-surface-container transition-colors border-b border-outline-variant last:border-0"
                      >
                        <p className="text-body-md font-medium text-on-surface">{r.petName}</p>
                        <p className="text-label-md text-on-surface-variant">{r.ownerName} · {r.phone}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Service type */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-lg text-on-surface-variant">Service</label>
            <div className="flex flex-wrap gap-xs">
              {SERVICE_TYPES.map(s => (
                <button
                  key={s}
                  onClick={() => setServiceType(s)}
                  className={`px-md py-sm rounded-xl border-2 text-body-sm font-medium transition-colors min-h-[44px]
                    ${serviceType === s
                      ? 'border-primary bg-primary-fixed text-primary font-bold'
                      : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-container'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Groomer */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-lg text-on-surface-variant">Groomer (optional)</label>
            <select
              value={groomerId}
              onChange={e => setGroomerId(e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-xl border border-outline-variant bg-surface px-lg py-md text-body-md text-on-surface focus:outline-none focus:border-primary transition-colors min-h-[44px]"
            >
              <option value="">Any available groomer</option>
              {staff.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* Time slot */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-lg text-on-surface-variant">Time slot</label>
            <select
              value={hour}
              onChange={e => setHour(Number(e.target.value))}
              className="w-full rounded-xl border border-outline-variant bg-surface px-lg py-md text-body-md text-on-surface focus:outline-none focus:border-primary transition-colors min-h-[44px]"
            >
              {HOURS.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>

          {/* Special instructions */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-lg text-on-surface-variant">Special instructions (optional)</label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={2}
              placeholder="Allergies, temperament notes…"
              className="w-full rounded-xl border border-outline-variant bg-surface px-lg py-md text-body-md text-on-surface placeholder:text-on-surface-variant resize-none focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>

        <div className="flex gap-sm px-xl pb-xl sticky bottom-0 bg-surface pt-md border-t border-outline-variant">
          <button onClick={onClose} className="flex-1 min-h-[44px] rounded-xl border border-outline-variant bg-surface text-on-surface hover:bg-surface-container text-body-md font-medium transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!selectedPet || mut.isPending}
            className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-on text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {mut.isPending ? 'Booking…' : 'Book Appointment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Booking Card ─────────────────────────────────────────────────────────────
function BookingCard({ booking, onStatusChange }: {
  booking: GroomingBooking
  onStatusChange: (id: number, status: string) => void
}) {
  const nextStatus = STATUS_NEXT[booking.status]
  const statusColor = STATUS_COLORS[booking.status] ?? STATUS_COLORS.scheduled

  return (
    <div className="bg-surface border border-outline-variant rounded-xl px-md py-sm flex items-center gap-sm shadow-sm hover:shadow-md transition-shadow">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-xs mb-xs">
          <span className={`px-sm py-xs rounded-full text-label-sm font-medium ${statusColor}`}>
            {STATUS_LABELS[booking.status] ?? booking.status}
          </span>
          <span className="text-label-md text-on-surface-variant">{booking.serviceType}</span>
        </div>
        <p className="text-body-md font-semibold text-on-surface truncate">{booking.pet.name}</p>
        {booking.groomer && (
          <p className="text-label-md text-on-surface-variant truncate">{booking.groomer.name}</p>
        )}
      </div>
      {nextStatus && (
        <button
          onClick={() => onStatusChange(booking.id, nextStatus)}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-primary text-primary-on hover:opacity-90 transition-opacity flex-shrink-0"
          title={`Advance to ${STATUS_LABELS[nextStatus]}`}
        >
          <MaterialIcon name="play_arrow" size={18} />
        </button>
      )}
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function ClinicGrooming() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [showModal, setShowModal] = useState(false)
  const qc = useQueryClient()
  const dateKey = dateStr(selectedDate)

  const { data, isLoading, isError } = useQuery<GroomingBooking[]>({
    queryKey: ['grooming', dateKey],
    queryFn: () => api.get(`/api/grooming/bookings?date=${dateKey}`).then(r => r.data.data),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.put(`/api/grooming/bookings/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grooming', dateKey] }),
  })

  const bookingsByHour: Record<number, GroomingBooking[]> = {}
  for (const b of data ?? []) {
    const h = bookingHour(b.scheduledAt)
    if (!bookingsByHour[h]) bookingsByHour[h] = []
    bookingsByHour[h].push(b)
  }

  const totalToday = data?.length ?? 0

  return (
    <div className="p-lg flex flex-col gap-lg">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-sm">
        <div>
          <h1 className="text-headline-md font-headline font-bold text-on-surface">Grooming Queue</h1>
          <p className="text-body-md text-on-surface-variant">
            {isLoading ? 'Loading…' : `${totalToday} booking${totalToday !== 1 ? 's' : ''} today`}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="min-h-[44px] flex items-center gap-xs px-lg rounded-xl bg-primary text-primary-on text-body-sm font-medium hover:opacity-90 transition-opacity"
        >
          <MaterialIcon name="add" size={18} />
          New Booking
        </button>
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-sm bg-surface rounded-2xl border border-outline-variant px-lg py-sm self-start">
        <button
          onClick={() => setSelectedDate(d => addDays(d, -1))}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant transition-colors"
        >
          <MaterialIcon name="chevron_left" size={22} />
        </button>
        <span className="text-body-lg font-semibold text-on-surface min-w-[160px] text-center select-none">
          {formatDateLabel(selectedDate)}
        </span>
        <button
          onClick={() => setSelectedDate(d => addDays(d, 1))}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant transition-colors"
        >
          <MaterialIcon name="chevron_right" size={22} />
        </button>
        {dateKey !== dateStr(new Date()) && (
          <button
            onClick={() => setSelectedDate(new Date())}
            className="min-h-[44px] px-md rounded-xl border border-outline-variant bg-surface text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors"
          >Today</button>
        )}
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
          Failed to load grooming schedule.
        </div>
      )}

      {/* Timeline */}
      {!isLoading && !isError && (
        <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
          {HOURS.map((h, idx) => {
            const bookings = bookingsByHour[h] ?? []
            return (
              <div key={h} className={`flex gap-md px-lg py-sm min-h-[64px] ${idx < HOURS.length - 1 ? 'border-b border-outline-variant' : ''}`}>
                {/* Hour label */}
                <div className="w-12 flex-shrink-0 flex items-start pt-xs">
                  <span className="text-label-md text-on-surface-variant font-mono">{String(h).padStart(2, '0')}:00</span>
                </div>

                {/* Bookings or empty slot */}
                <div className="flex-1 flex flex-col gap-xs justify-center">
                  {bookings.length > 0 ? (
                    bookings.map(b => (
                      <BookingCard
                        key={b.id}
                        booking={b}
                        onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
                      />
                    ))
                  ) : (
                    <button
                      onClick={() => setShowModal(true)}
                      className="w-full min-h-[44px] flex items-center justify-center gap-xs rounded-xl border border-dashed border-outline-variant text-on-surface-variant hover:bg-surface-container-low transition-colors text-body-sm"
                    >
                      <MaterialIcon name="add" size={16} />
                      <span>Add booking</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Booking modal */}
      {showModal && (
        <BookingModal
          date={dateKey}
          onClose={() => setShowModal(false)}
          onSaved={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
