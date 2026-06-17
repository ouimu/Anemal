import React, { useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'
import { usePhotoUpload } from '../../hooks/usePhotoUpload'
import { useT } from '../../i18n'

// ─── Types ───────────────────────────────────────────────────────────────────
interface Owner { id: number; firstName: string; lastName: string; phone: string; email?: string; lineId?: string; address?: string; pets: Pet[] }
interface MedicalRecordSummary { id: number; createdAt: string; assessment?: string }
interface Pet   { id: number; ownerId: number; name: string; species: string; breed?: string; color?: string; birthDate?: string; gender?: string; weightKg?: number; microchipId?: string; photoUrl?: string; allergies?: string; underlyingConditions?: string; isActive: boolean; owner?: Owner; vaccinations?: Vaccination[]; medicalRecords?: MedicalRecordSummary[] }
interface Vaccination { id: number; vaccineName: string; administeredAt: string; nextDueAt?: string; batchNo?: string; notes?: string }

// ─── Species chip colors ──────────────────────────────────────────────────────
const speciesColor: Record<string, string> = {
  canine: 'bg-secondary-container text-secondary-on-container',
  feline: 'bg-primary-fixed text-on-surface',
}
function speciesChip(s: string) {
  const key = s.toLowerCase()
  return speciesColor[key] ?? 'bg-surface-container-high text-on-surface-variant'
}

function ageFromDate(d?: string) {
  if (!d) return null
  const years = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
  return years < 1 ? '< 1 yr' : `${years} yr${years > 1 ? 's' : ''}`
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0]}${lastName[0]}`.toUpperCase()
}

// ─── Modal: Add Owner ─────────────────────────────────────────────────────────
function AddOwnerModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const t = useT()
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '', lineId: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.post('/api/owners', { ...form, email: form.email || null, address: form.address || null, lineId: form.lineId || null })
      onSuccess()
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-lg">
      <div className="bg-surface rounded-xl shadow-lg w-full max-w-md p-xl">
        <h3 className="text-headline-sm font-headline font-bold text-primary mb-lg">New Owner</h3>
        {error && <p className="text-error text-body-sm mb-md">{error}</p>}
        <form onSubmit={submit} className="flex flex-col gap-md">
          <div className="flex gap-md">
            <input required className="flex-1 bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.firstName')} value={form.firstName} onChange={set('firstName')} />
            <input required className="flex-1 bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.lastName')} value={form.lastName} onChange={set('lastName')} />
          </div>
          <input required className="bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.phone')} value={form.phone} onChange={set('phone')} />
          <input type="email" className="bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.emailOptional')} value={form.email} onChange={set('email')} />
          <input className="bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.addressOptional')} value={form.address} onChange={set('address')} />
          <div className="flex gap-md pt-sm">
            <button type="button" onClick={onClose} className="flex-1 min-h-[44px] rounded-lg border border-outline-variant text-body-sm font-semibold hover:bg-surface-container-low transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 min-h-[44px] rounded-lg bg-primary text-primary-on text-body-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{saving ? 'Saving…' : 'Save Owner'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal: Add Pet ───────────────────────────────────────────────────────────
function AddPetModal({ ownerId, ownerName, onClose, onSuccess }: { ownerId: number; ownerName: string; onClose: () => void; onSuccess: () => void }) {
  const t = useT()
  const [form, setForm] = useState({ name: '', species: 'canine', breed: '', color: '', gender: '', birthDate: '', microchipId: '', allergies: '', underlyingConditions: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile]       = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { uploadPhoto, isUploading, uploadError } = usePhotoUpload()

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      let photoUrl: string | null = null
      if (photoFile) {
        photoUrl = await uploadPhoto(photoFile)
      }
      await api.post('/api/pets', {
        ownerId,
        name: form.name,
        species: form.species,
        breed: form.breed || null,
        color: form.color || null,
        gender: form.gender || null,
        birthDate: form.birthDate || null,
        microchipId: form.microchipId || null,
        allergies: form.allergies || null,
        underlyingConditions: form.underlyingConditions || null,
        photoUrl,
      })
      onSuccess()
    } catch (err: unknown) {
      if (!uploadError) {
        setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save')
      }
    } finally { setSaving(false) }
  }

  const busy = saving || isUploading

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-lg">
      <div className="bg-surface rounded-xl shadow-lg w-full max-w-md p-xl overflow-y-auto max-h-[90vh]">
        <h3 className="text-headline-sm font-headline font-bold text-primary mb-xs">New Pet</h3>
        <p className="text-body-sm text-on-surface-variant mb-lg">Owner: {ownerName}</p>
        {(error || uploadError) && <p className="text-error text-body-sm mb-md">{error || uploadError}</p>}
        <form onSubmit={submit} className="flex flex-col gap-md">
          {/* Photo upload */}
          <div className="flex items-center gap-md">
            <div className="w-16 h-16 rounded-xl bg-surface-container-high flex items-center justify-center overflow-hidden flex-shrink-0 border border-outline-variant">
              {photoPreview
                ? <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                : <MaterialIcon name="pets" size={28} className="text-on-surface-variant" />
              }
            </div>
            <div className="flex flex-col gap-xs flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-sm bg-surface-container-low border border-outline-variant rounded-lg px-md py-sm min-h-[44px] text-body-sm font-medium hover:bg-surface-container transition-colors"
              >
                <MaterialIcon name="photo_camera" size={18} className="text-on-surface-variant" />
                {photoFile ? 'Change photo' : 'Add photo (optional)'}
              </button>
              {isUploading && <p className="text-body-sm text-on-surface-variant">Uploading…</p>}
            </div>
          </div>

          <input required className="bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.petName')} value={form.name} onChange={set('name')} />
          <div className="flex gap-md">
            <select className="flex-1 bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" value={form.species} onChange={set('species')}>
              <option value="canine">Canine</option>
              <option value="feline">Feline</option>
              <option value="avian">Avian</option>
              <option value="other">Other</option>
            </select>
            <select className="flex-1 bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" value={form.gender} onChange={set('gender')}>
              <option value="">Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div className="flex gap-md">
            <input className="flex-1 bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.breedOptional')} value={form.breed} onChange={set('breed')} />
            <input className="flex-1 bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.colorOptional')} value={form.color} onChange={set('color')} />
          </div>
          <input type="date" className="bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" value={form.birthDate} onChange={set('birthDate')} />
          <input className="bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.microchipOptional')} value={form.microchipId} onChange={set('microchipId')} />
          <textarea className="bg-surface-container-low rounded-lg px-md py-sm min-h-[80px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary resize-none" placeholder={t('clinic.pets.allergiesOptional')} value={form.allergies} onChange={set('allergies')} />
          <textarea className="bg-surface-container-low rounded-lg px-md py-sm min-h-[80px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary resize-none" placeholder={t('clinic.pets.conditionsOptional')} value={form.underlyingConditions} onChange={set('underlyingConditions')} />
          <div className="flex gap-md pt-sm">
            <button type="button" onClick={onClose} className="flex-1 min-h-[44px] rounded-lg border border-outline-variant text-body-sm font-semibold hover:bg-surface-container-low transition-colors">Cancel</button>
            <button type="submit" disabled={busy} className="flex-1 min-h-[44px] rounded-lg bg-primary text-primary-on text-body-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{busy ? 'Saving…' : 'Save Pet'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal: Add Vaccination ───────────────────────────────────────────────────
function AddVaccinationModal({ petId, onClose, onSuccess }: { petId: number; onClose: () => void; onSuccess: () => void }) {
  const t = useT()
  const [form, setForm] = useState({ vaccineName: '', administeredAt: '', nextDueAt: '', batchNo: '', notes: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.post('/api/vaccinations', { petId, ...form, nextDueAt: form.nextDueAt || null, batchNo: form.batchNo || null, notes: form.notes || null })
      onSuccess()
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-lg">
      <div className="bg-surface rounded-xl shadow-lg w-full max-w-md p-xl">
        <h3 className="text-headline-sm font-headline font-bold text-primary mb-lg">Record Vaccination</h3>
        {error && <p className="text-error text-body-sm mb-md">{error}</p>}
        <form onSubmit={submit} className="flex flex-col gap-md">
          <input required className="bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.vaccineName')} value={form.vaccineName} onChange={set('vaccineName')} />
          <label className="text-body-sm text-on-surface-variant">Date administered</label>
          <input required type="date" className="bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" value={form.administeredAt} onChange={set('administeredAt')} />
          <label className="text-body-sm text-on-surface-variant">Next due date (optional)</label>
          <input type="date" className="bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" value={form.nextDueAt} onChange={set('nextDueAt')} />
          <input className="bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.batchOptional')} value={form.batchNo} onChange={set('batchNo')} />
          <div className="flex gap-md pt-sm">
            <button type="button" onClick={onClose} className="flex-1 min-h-[44px] rounded-lg border border-outline-variant text-body-sm font-semibold hover:bg-surface-container-low transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 min-h-[44px] rounded-lg bg-primary text-primary-on text-body-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Pet Detail Tabs ──────────────────────────────────────────────────────────
const TABS = ['Overview', 'Medical', 'Vaccinations'] as const
type Tab = typeof TABS[number]

function PetDetail({ petId, onAddVaccination }: { petId: number; onAddVaccination: () => void }) {
  const [tab, setTab] = useState<Tab>('Overview')

  const { data, isLoading } = useQuery<{ data: Pet }>({
    queryKey: ['pet', petId],
    queryFn: () => api.get(`/api/pets/${petId}`).then(r => r.data),
  })

  const pet = data?.data
  if (isLoading) return <div className="flex-1 flex items-center justify-center text-on-surface-variant">Loading…</div>
  if (!pet) return null

  const owner = pet.owner

  return (
    <div className="flex-1 overflow-y-auto p-lg flex flex-col gap-lg">
      {/* Pet hero */}
      <div className="flex items-center gap-lg bg-surface rounded-xl border border-outline-variant p-lg">
        {pet.photoUrl
          ? <img src={pet.photoUrl} alt={pet.name} className="w-[120px] h-[120px] rounded-xl object-cover border border-outline-variant" />
          : <div className="w-[120px] h-[120px] rounded-xl bg-surface-container-high flex items-center justify-center"><MaterialIcon name="pets" size={48} className="text-on-surface-variant" /></div>
        }
        <div className="flex-1">
          <h3 className="text-headline-md font-headline font-bold text-primary">{pet.name}</h3>
          <div className="flex flex-wrap gap-sm mt-sm">
            <span className={`px-sm py-xs rounded-full text-label-md font-medium ${speciesChip(pet.species)}`}>{pet.species}</span>
            {pet.breed && <span className="px-sm py-xs rounded-full bg-surface-container text-on-surface-variant text-label-md">{pet.breed}</span>}
            {ageFromDate(pet.birthDate) && <span className="px-sm py-xs rounded-full bg-surface-container text-on-surface-variant text-label-md">{ageFromDate(pet.birthDate)}</span>}
            {pet.gender && <span className="px-sm py-xs rounded-full bg-surface-container text-on-surface-variant text-label-md capitalize">{pet.gender}</span>}
          </div>
          {pet.microchipId && <p className="text-body-sm text-on-surface-variant mt-sm"><MaterialIcon name="qr_code_scanner" size={14} className="inline mr-xs" />{pet.microchipId}</p>}
        </div>
      </div>

      {/* Owner card */}
      {owner && (
        <div className="bg-surface-container-low rounded-xl p-lg flex items-center gap-lg border border-outline-variant">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-on font-bold text-headline-xs">
            {initials(owner.firstName, owner.lastName)}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-body-md">{owner.firstName} {owner.lastName}</p>
            <p className="text-body-sm text-on-surface-variant">{owner.phone}</p>
            {owner.email && <p className="text-body-sm text-on-surface-variant">{owner.email}</p>}
          </div>
        </div>
      )}

      {/* Alerts */}
      {(pet.allergies || pet.underlyingConditions) && (
        <div className="bg-error-container rounded-xl p-lg border border-error/30">
          {pet.allergies && <p className="text-body-sm font-semibold text-error"><MaterialIcon name="warning" size={16} className="inline mr-xs" />Allergies: {pet.allergies}</p>}
          {pet.underlyingConditions && <p className="text-body-sm text-error mt-xs"><MaterialIcon name="medical_information" size={16} className="inline mr-xs" />Conditions: {pet.underlyingConditions}</p>}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-outline-variant">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-lg py-sm text-body-sm font-semibold min-h-[44px] transition-colors ${tab === t ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Overview' && (
        <div className="flex flex-col gap-md">
          {[
            { label: 'Weight', value: pet.weightKg ? `${pet.weightKg} kg` : '—' },
            { label: 'Color', value: pet.color ?? '—' },
            { label: 'Date of birth', value: pet.birthDate ? new Date(pet.birthDate).toLocaleDateString() : '—' },
          ].map(r => (
            <div key={r.label} className="flex justify-between items-center min-h-[48px] border-b border-outline-variant/50 py-sm">
              <span className="text-body-sm text-on-surface-variant">{r.label}</span>
              <span className="text-body-sm font-medium">{r.value}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'Medical' && (
        <div>
          {pet.medicalRecords?.length ? pet.medicalRecords.map(r => (
            <div key={r.id} className="flex justify-between items-center min-h-[48px] border-b border-outline-variant/50 py-sm">
              <span className="text-body-sm">{r.assessment ?? 'Visit'}</span>
              <span className="text-body-sm text-on-surface-variant">{new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
          )) : <p className="text-body-sm text-on-surface-variant py-lg">No medical records yet.</p>}
        </div>
      )}

      {tab === 'Vaccinations' && (
        <div>
          <div className="flex justify-end mb-md">
            <button onClick={onAddVaccination} className="flex items-center gap-sm bg-primary text-primary-on rounded-lg px-md py-sm min-h-[44px] text-body-sm font-semibold hover:bg-primary/90 transition-colors">
              <MaterialIcon name="add" size={18} />Add Vaccination
            </button>
          </div>
          {pet.vaccinations?.length ? pet.vaccinations.map(v => (
            <div key={v.id} className="flex justify-between items-center min-h-[48px] border-b border-outline-variant/50 py-sm">
              <div>
                <p className="text-body-sm font-medium">{v.vaccineName}</p>
                {v.nextDueAt && <p className="text-label-md text-on-surface-variant">Due: {new Date(v.nextDueAt).toLocaleDateString()}</p>}
              </div>
              <span className="text-body-sm text-on-surface-variant">{new Date(v.administeredAt).toLocaleDateString()}</span>
            </div>
          )) : <p className="text-body-sm text-on-surface-variant py-lg">No vaccination records yet.</p>}
        </div>
      )}
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────
export default function ClinicPets() {
  const t = useT()
  const qc = useQueryClient()
  const [search, setSearch]         = useState('')
  const [speciesFilter, setSpecies] = useState<string | null>(null)
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null)
  const [selectedOwnerId, setSelectedOwnerId] = useState<number | null>(null)
  const [modal, setModal] = useState<'addOwner' | 'addPet' | 'addVaccination' | null>(null)

  const { data: petsData, isLoading } = useQuery({
    queryKey: ['pets', search, speciesFilter],
    queryFn: () => api.get('/api/pets', { params: { q: search || undefined, species: speciesFilter || undefined, limit: 50 } }).then(r => r.data.data),
    staleTime: 30_000,
  })

  const pets: Pet[] = petsData?.pets ?? []

  const onSelectPet = useCallback((pet: Pet) => {
    setSelectedPetId(pet.id)
    setSelectedOwnerId(pet.ownerId)
  }, [])

  const closeModal = useCallback(() => setModal(null), [])
  const refreshAndClose = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['pets'] })
    if (selectedPetId) qc.invalidateQueries({ queryKey: ['pet', selectedPetId] })
    setModal(null)
  }, [qc, selectedPetId])

  const SPECIES_FILTERS = [
    { label: 'All', value: null },
    { label: 'Canine', value: 'canine' },
    { label: 'Feline', value: 'feline' },
    { label: 'Other', value: 'other' },
  ]

  const selectedPet = pets.find(p => p.id === selectedPetId)

  return (
    <div className="flex h-full">
      {/* ── Left panel ── */}
      <div className="w-72 flex-shrink-0 border-r border-outline-variant flex flex-col bg-surface overflow-hidden">
        {/* Search */}
        <div className="p-md border-b border-outline-variant">
          <div className="relative">
            <MaterialIcon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-surface-container-low rounded-full py-sm pl-10 pr-md text-body-sm border-none focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              placeholder="Search pets, owners, phone…"
            />
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-sm p-md border-b border-outline-variant overflow-x-auto">
          {SPECIES_FILTERS.map(f => (
            <button
              key={f.label}
              onClick={() => setSpecies(f.value)}
              className={`px-md py-xs rounded-full text-label-md font-medium whitespace-nowrap min-h-[36px] transition-colors ${speciesFilter === f.value ? 'bg-primary text-primary-on' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Add owner button */}
        <div className="p-md border-b border-outline-variant">
          <button onClick={() => setModal('addOwner')} className="w-full flex items-center justify-center gap-sm bg-surface border border-outline-variant rounded-lg px-md py-sm min-h-[44px] text-body-sm font-semibold hover:bg-surface-container-low transition-colors">
            <MaterialIcon name="person_add" size={18} />{t('clinic.pets.addOwner')}
          </button>
        </div>

        {/* List column headers */}
        <div className="flex items-center justify-between px-md py-xs border-b border-outline-variant bg-surface-container">
          <span className="text-label-md text-on-surface-variant font-medium">{t('clinic.pets.petName')}</span>
          <span className="text-label-md text-on-surface-variant">{t('clinic.pets.phone')}</span>
        </div>

        {/* Pet list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="p-lg text-body-sm text-on-surface-variant">Loading…</div>}
          {!isLoading && pets.length === 0 && <div className="p-lg text-body-sm text-on-surface-variant">No pets found.</div>}
          {pets.map(pet => (
            <button
              key={pet.id}
              onClick={() => onSelectPet(pet)}
              className={`w-full text-left flex items-center gap-md p-md border-b border-outline-variant/50 min-h-[72px] transition-colors ${selectedPetId === pet.id ? 'bg-surface-container-low border-l-4 border-primary' : 'hover:bg-surface-container-low border-l-4 border-transparent'}`}
            >
              <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0">
                {pet.photoUrl
                  ? <img src={pet.photoUrl} alt={pet.name} className="w-12 h-12 rounded-full object-cover" />
                  : <MaterialIcon name="pets" size={22} className="text-on-surface-variant" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-headline-xs font-bold truncate">{pet.name}</p>
                {pet.owner && <p className="text-body-sm text-on-surface-variant truncate">{pet.owner.firstName} {pet.owner.lastName}</p>}
                <span className={`inline-block mt-xs px-sm py-xs rounded-full text-label-md capitalize ${speciesChip(pet.species)}`}>{pet.species}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedPetId ? (
          <>
            {/* Header bar with "Add Pet" button for selected owner */}
            <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant bg-surface flex-shrink-0">
              <h2 className="text-headline-sm font-headline font-bold text-primary">Pet Profile</h2>
              {selectedOwnerId && (
                <button onClick={() => setModal('addPet')} className="flex items-center gap-sm bg-primary text-primary-on rounded-lg px-lg py-sm min-h-[44px] text-body-sm font-semibold hover:bg-primary/90 transition-colors">
                  <MaterialIcon name="add" size={18} />{t('clinic.pets.addPet')}
                </button>
              )}
            </div>
            <PetDetail petId={selectedPetId} onAddVaccination={() => setModal('addVaccination')} />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-xl text-on-surface-variant">
            <MaterialIcon name="pets" size={64} className="mb-lg opacity-20" />
            <p className="text-headline-sm font-headline font-bold mb-sm">Select a patient</p>
            <p className="text-body-md">Choose a pet from the list to view their profile and medical history.</p>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modal === 'addOwner' && (
        <AddOwnerModal onClose={closeModal} onSuccess={() => { qc.invalidateQueries({ queryKey: ['pets'] }); setModal(null) }} />
      )}
      {modal === 'addPet' && selectedOwnerId && selectedPet && (
        <AddPetModal
          ownerId={selectedOwnerId}
          ownerName={selectedPet.owner ? `${selectedPet.owner.firstName} ${selectedPet.owner.lastName}` : ''}
          onClose={closeModal}
          onSuccess={refreshAndClose}
        />
      )}
      {modal === 'addVaccination' && selectedPetId && (
        <AddVaccinationModal petId={selectedPetId} onClose={closeModal} onSuccess={refreshAndClose} />
      )}
    </div>
  )
}
