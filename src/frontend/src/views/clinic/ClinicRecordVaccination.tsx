import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'

interface VaccinePayload {
  petId:                  number
  vaccineName:            string
  administeredAt:         string
  nextDueAt:              string | null
  batchNo:                string | null
  notes:                  string | null
  administeredExternally: boolean
}

export default function ClinicRecordVaccination() {
  const navigate      = useNavigate()
  const queryClient   = useQueryClient()
  const [searchParams] = useSearchParams()

  const petId      = parseInt(searchParams.get('petId') ?? '0')
  const vaccine    = searchParams.get('vaccine') ?? ''
  const nextDueRaw = searchParams.get('nextDueAt')

  const suggested = new Date()
  suggested.setFullYear(suggested.getFullYear() + 1)

  const [form, setForm] = useState({
    administeredAt:         new Date().toISOString().slice(0, 10),
    nextDueAt:              nextDueRaw
      ? new Date(nextDueRaw).toISOString().slice(0, 10)
      : suggested.toISOString().slice(0, 10),
    batchNo:                '',
    notes:                  '',
    administeredExternally: false,
  })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (payload: VaccinePayload) =>
      api.post('/api/vaccinations', payload).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vaccinations', 'due-worklist'] })
      navigate('/clinic/vaccinations-due')
    },
    onError: (err: Error) => setError(err.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!petId) { setError('Invalid pet ID'); return }
    mutation.mutate({
      petId,
      vaccineName:            vaccine,
      administeredAt:         form.administeredAt,
      nextDueAt:              form.nextDueAt || null,
      batchNo:                form.batchNo || null,
      notes:                  form.notes || null,
      administeredExternally: form.administeredExternally,
    })
  }

  const inputCls = 'min-h-[44px] px-md rounded-lg border border-outline-variant bg-surface text-body-md text-on-surface focus:outline-none focus:border-primary'

  return (
    <div className="p-lg max-w-lg">
      <button onClick={() => navigate(-1)}
              className="flex items-center gap-xs text-on-surface-variant mb-md min-h-[44px] hover:text-primary">
        <MaterialIcon name="arrow_back" size={20} /> Back
      </button>

      <h2 className="text-headline-lg font-headline font-bold text-primary mb-lg">Record Vaccination</h2>

      <form onSubmit={handleSubmit} className="glass-card rounded-xl shadow-lvl1 p-lg flex flex-col gap-md">
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant font-medium">Pet ID</label>
          <input readOnly value={petId} className={`${inputCls} bg-surface-container`} />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant font-medium">Vaccine</label>
          <input readOnly value={vaccine} className={`${inputCls} bg-surface-container`} />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant font-medium">Date Administered</label>
          <input type="date" required value={form.administeredAt}
                 onChange={e => setForm(f => ({ ...f, administeredAt: e.target.value }))}
                 className={inputCls} />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant font-medium">Next Due Date</label>
          <input type="date" value={form.nextDueAt}
                 onChange={e => setForm(f => ({ ...f, nextDueAt: e.target.value }))}
                 className={inputCls} />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant font-medium">Batch No.</label>
          <input value={form.batchNo} placeholder="optional"
                 onChange={e => setForm(f => ({ ...f, batchNo: e.target.value }))}
                 className={inputCls} />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant font-medium">Notes</label>
          <textarea rows={3} value={form.notes} placeholder="optional"
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="px-md py-sm rounded-lg border border-outline-variant bg-surface text-body-md focus:outline-none focus:border-primary resize-none" />
        </div>

        <label className="flex items-center gap-md min-h-[44px] cursor-pointer">
          <input type="checkbox" checked={form.administeredExternally}
                 onChange={e => setForm(f => ({ ...f, administeredExternally: e.target.checked }))}
                 className="w-5 h-5 accent-primary" />
          <span className="text-body-md text-on-surface">Administered externally (not at this clinic)</span>
        </label>

        {error && (
          <p className="text-error text-body-sm bg-error-container rounded-lg px-md py-sm">{error}</p>
        )}

        <button type="submit" disabled={mutation.isPending}
                className="min-h-[44px] rounded-lg bg-primary text-primary-on font-semibold text-body-sm hover:bg-primary/90 transition-colors disabled:opacity-60">
          {mutation.isPending ? 'Saving…' : 'Record Vaccination'}
        </button>
      </form>
    </div>
  )
}
