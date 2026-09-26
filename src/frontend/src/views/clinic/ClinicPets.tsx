import React, { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'
import AuthedPetImage from '../../components/AuthedPetImage'
import { usePhotoUpload } from '../../hooks/usePhotoUpload'
import { getErrorMessage } from '../../utils/errorMessage'
import { useT } from '../../i18n'
import { useUiStore } from '../../store/uiStore'
import { formatDate } from '../../i18n/dateFormat'
import { speciesLabel } from '../../i18n/speciesLabel'
import Can from '../../components/Can'
import { useAuthStore } from '../../store/authStore'
import { AdmitModal } from './ClinicInpatient'

// ─── Types ───────────────────────────────────────────────────────────────────
interface Owner { id: number; firstName: string; lastName: string; phone: string; email?: string; lineId?: string; address?: string; idCardType?: string; idCardNumber?: string; isActive: boolean; pets: Pet[] }
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

// R-1 (ADR-0030): `pet.species`/`pet.gender` stay these raw English stored values
// everywhere (speciesChip's color lookup, form submit payloads) — only the
// *display* label is translated, via the shared `speciesLabel()` (i18n/speciesLabel.ts)
// and `genderLabel()` below. A value with no key (X-1: e.g. a future species/gender)
// renders raw, no crash.
const GENDER_LABEL_KEYS: Record<string, string> = {
  male: 'clinic.pets.genderMale',
  female: 'clinic.pets.genderFemale',
  unknown: 'clinic.pets.genderUnknown',
}
function genderLabel(t: (key: string) => string, gender: string): string {
  const key = GENDER_LABEL_KEYS[gender]
  return key ? t(key) : gender
}

function ageFromDate(d: string | undefined, t: (key: string) => string): string | null {
  if (!d) return null
  const years = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
  if (years < 1) return t('clinic.pets.ageUnderOneYear')
  const key = years === 1 ? 'clinic.pets.ageYearsOne' : 'clinic.pets.ageYearsOther'
  return t(key).replace('{n}', String(years))
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0]}${lastName[0]}`.toUpperCase()
}

function maskIdCard(idCardNumber: string) {
  const last4 = idCardNumber.slice(-4)
  return '•'.repeat(Math.max(idCardNumber.length - 4, 0)) + last4
}

// ─── Shared modal form styling ─────────────────────────────────────────────────
/** The 150-char input/select className repeated verbatim across all five modals below. */
const fieldClass = 'bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary'

// ─── Shared modal submit state ─────────────────────────────────────────────────
/**
 * Centralizes the `form`/`error`/`saving` state triple and the
 * submit-try/catch/finally mechanics repeated across ClinicPets' five
 * modals (arch audit §2.2). `submitFn` performs the request(s) for one
 * submit attempt; `onSuccess` runs only when `submitFn` resolves without
 * throwing. `formatError` lets a caller customize or suppress the message
 * for a given error. `EditPetModal` passes an override that suppresses
 * when `usePhotoUpload`'s `uploadError` is set — note that check reads a
 * stale closure (this render's `uploadError`, not the failing attempt's),
 * so it only ever suppresses a *later*, unrelated failure after a photo
 * failure already showed `uploadError`, not the photo failure itself. This
 * is a known pre-existing bug, pinned not fixed (see the call site and
 * ClinicPets.characterization.test.tsx); every other modal uses the
 * default extraction.
 */
function useModalSubmit(
  submitFn: () => Promise<void>,
  onSuccess: () => void,
  formatError: (err: unknown) => string | null = (err) => getErrorMessage(err, 'Failed to save'),
) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await submitFn()
      onSuccess()
    } catch (err) {
      const message = formatError(err)
      if (message !== null) setError(message)
    } finally {
      setSaving(false)
    }
  }

  return { error, saving, submit }
}

// ─── Modal: Add Owner ─────────────────────────────────────────────────────────
function AddOwnerModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const t = useT()
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '', lineId: '', idCardType: '', idCardNumber: '' })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const { error, saving, submit } = useModalSubmit(async () => {
    await api.post('/api/owners', {
      ...form,
      email: form.email || null,
      address: form.address || null,
      lineId: form.lineId || null,
      idCardType: form.idCardType || null,
      idCardNumber: form.idCardType ? form.idCardNumber : null,
    })
  }, onSuccess)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-lg">
      <div className="bg-surface rounded-xl shadow-lg w-full max-w-md p-xl">
        <h3 className="text-headline-sm font-headline font-bold text-primary mb-lg">{t('clinic.pets.newOwner')}</h3>
        {error && <p className="text-error text-body-sm mb-md">{error}</p>}
        <form onSubmit={submit} className="flex flex-col gap-md">
          <div className="flex gap-md">
            <input required className={`flex-1 min-w-0 ${fieldClass}`} placeholder={t('clinic.pets.firstName')} value={form.firstName} onChange={set('firstName')} />
            <input required className={`flex-1 min-w-0 ${fieldClass}`} placeholder={t('clinic.pets.lastName')} value={form.lastName} onChange={set('lastName')} />
          </div>
          <input required className={fieldClass} placeholder={t('clinic.pets.phone')} value={form.phone} onChange={set('phone')} />
          <input type="email" className={fieldClass} placeholder={t('clinic.pets.emailOptional')} value={form.email} onChange={set('email')} />
          <input className={fieldClass} placeholder={t('clinic.pets.addressOptional')} value={form.address} onChange={set('address')} />
          <label className="text-body-sm text-on-surface-variant" htmlFor="add-owner-idcard-type">{t('clinic.pets.idCardType')}</label>
          <select id="add-owner-idcard-type" aria-label={t('clinic.pets.idCardType')} className={fieldClass} value={form.idCardType} onChange={set('idCardType')}>
            <option value="">{t('clinic.pets.idCardTypeNone')}</option>
            <option value="thai_id">{t('clinic.pets.idCardTypeThai')}</option>
            <option value="passport">{t('clinic.pets.idCardTypePassport')}</option>
          </select>
          {form.idCardType === 'thai_id' && (
            <input
              className={fieldClass}
              placeholder={t('clinic.pets.idCardNumberThai')}
              value={form.idCardNumber}
              onChange={set('idCardNumber')}
              maxLength={13}
              inputMode="numeric"
            />
          )}
          {form.idCardType === 'passport' && (
            <input
              className={fieldClass}
              placeholder={t('clinic.pets.idCardNumberPassport')}
              value={form.idCardNumber}
              onChange={set('idCardNumber')}
              maxLength={20}
            />
          )}
          <div className="flex gap-md pt-sm">
            <button type="button" onClick={onClose} className="flex-1 min-h-[44px] rounded-lg border border-outline-variant text-body-sm font-semibold hover:bg-surface-container-low transition-colors">{t('common.cancel')}</button>
            <button type="submit" disabled={saving} className="flex-1 min-h-[44px] rounded-lg bg-primary text-primary-on text-body-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{saving ? t('common.saving') : t('clinic.pets.saveOwner')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal: Edit Owner ────────────────────────────────────────────────────────
export function EditOwnerModal({ owner, onClose, onSuccess }: { owner: Owner; onClose: () => void; onSuccess: () => void }) {
  const t = useT()
  const [form, setForm] = useState({
    firstName: owner.firstName,
    lastName: owner.lastName,
    phone: owner.phone,
    email: owner.email ?? '',
    address: owner.address ?? '',
    lineId: owner.lineId ?? '',
    idCardType: owner.idCardType ?? '',
    idCardNumber: owner.idCardNumber ?? '',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const { error, saving, submit } = useModalSubmit(async () => {
    await api.put(`/api/owners/${owner.id}`, {
      ...form,
      email: form.email || null,
      address: form.address || null,
      lineId: form.lineId || null,
      idCardType: form.idCardType || null,
      idCardNumber: form.idCardType ? form.idCardNumber : null,
    })
  }, onSuccess)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-lg">
      <div className="bg-surface rounded-xl shadow-lg w-full max-w-md p-xl">
        <h3 className="text-headline-sm font-headline font-bold text-primary mb-lg">{t('clinic.pets.editOwner')}</h3>
        {error && <p className="text-error text-body-sm mb-md">{error}</p>}
        <form onSubmit={submit} className="flex flex-col gap-md">
          <div className="flex gap-md">
            <input required className={`flex-1 min-w-0 ${fieldClass}`} placeholder={t('clinic.pets.firstName')} value={form.firstName} onChange={set('firstName')} />
            <input required className={`flex-1 min-w-0 ${fieldClass}`} placeholder={t('clinic.pets.lastName')} value={form.lastName} onChange={set('lastName')} />
          </div>
          <input required className={fieldClass} placeholder={t('clinic.pets.phone')} value={form.phone} onChange={set('phone')} />
          <input type="email" className={fieldClass} placeholder={t('clinic.pets.emailOptional')} value={form.email} onChange={set('email')} />
          <input className={fieldClass} placeholder={t('clinic.pets.addressOptional')} value={form.address} onChange={set('address')} />
          <label className="text-body-sm text-on-surface-variant" htmlFor="edit-owner-idcard-type">{t('clinic.pets.idCardType')}</label>
          <select id="edit-owner-idcard-type" aria-label={t('clinic.pets.idCardType')} className={fieldClass} value={form.idCardType} onChange={set('idCardType')}>
            <option value="">{t('clinic.pets.idCardTypeNone')}</option>
            <option value="thai_id">{t('clinic.pets.idCardTypeThai')}</option>
            <option value="passport">{t('clinic.pets.idCardTypePassport')}</option>
          </select>
          {form.idCardType === 'thai_id' && (
            <input
              className={fieldClass}
              placeholder={t('clinic.pets.idCardNumberThai')}
              value={form.idCardNumber}
              onChange={set('idCardNumber')}
              maxLength={13}
              inputMode="numeric"
            />
          )}
          {form.idCardType === 'passport' && (
            <input
              className={fieldClass}
              placeholder={t('clinic.pets.idCardNumberPassport')}
              value={form.idCardNumber}
              onChange={set('idCardNumber')}
              maxLength={20}
            />
          )}
          <div className="flex gap-md pt-sm">
            <button type="button" onClick={onClose} className="flex-1 min-h-[44px] rounded-lg border border-outline-variant text-body-sm font-semibold hover:bg-surface-container-low transition-colors">{t('common.cancel')}</button>
            <button type="submit" disabled={saving} className="flex-1 min-h-[44px] rounded-lg bg-primary text-primary-on text-body-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{saving ? t('common.saving') : t('clinic.pets.saveChanges')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal: Add Pet ───────────────────────────────────────────────────────────
export function AddPetModal({ ownerId, ownerName, onClose, onSuccess }: { ownerId: number; ownerName: string; onClose: () => void; onSuccess: () => void }) {
  const t = useT()
  const [form, setForm] = useState({ name: '', species: 'canine', breed: '', color: '', gender: '', birthDate: '', weightKg: '', microchipId: '', allergies: '', underlyingConditions: '' })
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

  const { error, saving, submit } = useModalSubmit(async () => {
    const res = await api.post('/api/pets', {
      ownerId,
      name: form.name,
      species: form.species,
      breed: form.breed || null,
      color: form.color || null,
      gender: form.gender || null,
      birthDate: form.birthDate || null,
      weightKg: form.weightKg ? Number(form.weightKg) : null,
      microchipId: form.microchipId || null,
      allergies: form.allergies || null,
      underlyingConditions: form.underlyingConditions || null,
    })
    const newPetId = res.data.data.id as number
    if (photoFile) {
      // Grill G3: no rollback on photo failure — the pet is already
      // created and valid without a photo; swallow the error here and
      // let the user retry from Edit Pet.
      try { await uploadPhoto(newPetId, photoFile) } catch { /* non-fatal, see G3 */ }
    }
  }, onSuccess)

  const busy = saving || isUploading

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-lg">
      <div className="bg-surface rounded-xl shadow-lg w-full max-w-md p-xl overflow-y-auto max-h-[90vh]">
        <h3 className="text-headline-sm font-headline font-bold text-primary mb-xs">{t('clinic.pets.newPet')}</h3>
        <p className="text-body-sm text-on-surface-variant mb-lg">{t('clinic.pets.ownerPrefix').replace('{name}', ownerName)}</p>
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
                {photoFile ? t('clinic.pets.changePhoto') : t('clinic.pets.addPhotoOptional')}
              </button>
              {isUploading && <p className="text-body-sm text-on-surface-variant">{t('clinic.pets.uploading')}</p>}
            </div>
          </div>

          <input required className={fieldClass} placeholder={t('clinic.pets.petName')} value={form.name} onChange={set('name')} />
          <div className="flex gap-md">
            <select className={`flex-1 ${fieldClass}`} value={form.species} onChange={set('species')}>
              <option value="canine">{t('clinic.pets.speciesCanine')}</option>
              <option value="feline">{t('clinic.pets.speciesFeline')}</option>
              <option value="avian">{t('clinic.pets.speciesAvian')}</option>
              <option value="other">{t('common.other')}</option>
            </select>
            <select className={`flex-1 ${fieldClass}`} value={form.gender} onChange={set('gender')}>
              <option value="">{t('clinic.pets.genderLabel')}</option>
              <option value="male">{t('clinic.pets.genderMale')}</option>
              <option value="female">{t('clinic.pets.genderFemale')}</option>
              <option value="unknown">{t('clinic.pets.genderUnknown')}</option>
            </select>
          </div>
          <div className="flex gap-md">
            <input className={`flex-1 ${fieldClass}`} placeholder={t('clinic.pets.breedOptional')} value={form.breed} onChange={set('breed')} />
            <input className={`flex-1 ${fieldClass}`} placeholder={t('clinic.pets.colorOptional')} value={form.color} onChange={set('color')} />
          </div>
          <input type="number" step="0.01" min="0" className={fieldClass} placeholder={t('clinic.pets.weightOptional')} value={form.weightKg} onChange={set('weightKg')} />
          <input type="date" className={fieldClass} value={form.birthDate} onChange={set('birthDate')} />
          <input className={fieldClass} placeholder={t('clinic.pets.microchipOptional')} value={form.microchipId} onChange={set('microchipId')} />
          <textarea className="bg-surface-container-low rounded-lg px-md py-sm min-h-[80px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary resize-none" placeholder={t('clinic.pets.allergiesOptional')} value={form.allergies} onChange={set('allergies')} />
          <textarea className="bg-surface-container-low rounded-lg px-md py-sm min-h-[80px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary resize-none" placeholder={t('clinic.pets.conditionsOptional')} value={form.underlyingConditions} onChange={set('underlyingConditions')} />
          <div className="flex gap-md pt-sm">
            <button type="button" onClick={onClose} className="flex-1 min-h-[44px] rounded-lg border border-outline-variant text-body-sm font-semibold hover:bg-surface-container-low transition-colors">{t('common.cancel')}</button>
            <button type="submit" disabled={busy} className="flex-1 min-h-[44px] rounded-lg bg-primary text-primary-on text-body-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{busy ? t('common.saving') : t('clinic.pets.savePet')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal: Edit Pet ──────────────────────────────────────────────────────────
export function EditPetModal({ pet, onClose, onSuccess }: { pet: Pet; onClose: () => void; onSuccess: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: pet.name, species: pet.species, breed: pet.breed ?? '', color: pet.color ?? '',
    // birthDate arrives as a full ISO datetime from the API (Prisma DateTime @db.Date);
    // <input type="date"> only accepts yyyy-MM-dd — slice, or the field renders blank.
    gender: pet.gender ?? '', birthDate: pet.birthDate ? pet.birthDate.slice(0, 10) : '', weightKg: pet.weightKg?.toString() ?? '',
    microchipId: pet.microchipId ?? '', allergies: pet.allergies ?? '', underlyingConditions: pet.underlyingConditions ?? '',
  })
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

  const { error, saving, submit } = useModalSubmit(
    async () => {
      if (photoFile) await uploadPhoto(pet.id, photoFile)
      await api.put(`/api/pets/${pet.id}`, {
        name: form.name,
        species: form.species,
        breed: form.breed || null,
        color: form.color || null,
        gender: form.gender || null,
        birthDate: form.birthDate || null,
        weightKg: form.weightKg ? Number(form.weightKg) : null,
        microchipId: form.microchipId || null,
        allergies: form.allergies || null,
        underlyingConditions: form.underlyingConditions || null,
      })
      qc.invalidateQueries({ queryKey: ['pet', pet.id] })
    },
    onSuccess,
    // `uploadError` here is the value from the render that created this
    // `submit` closure, not necessarily this attempt's outcome — it only
    // goes truthy *after* a photo-upload failure has already re-rendered
    // the component once. So this suppresses the generic PUT-failure
    // message on the *next* submit after an earlier photo failure, even
    // when that next failure is unrelated (e.g. a validation error from
    // the PUT itself) or the photo now succeeds. When the retried upload
    // also succeeds, `uploadError` clears too, so that next failure can
    // end up showing no message at all — a genuine pre-existing bug
    // (present before this refactor), pinned by a characterization test,
    // not fixed here.
    (err) => (uploadError ? null : getErrorMessage(err, 'Failed to save')),
  )

  const busy = saving || isUploading

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-lg">
      <div className="bg-surface rounded-xl shadow-lg w-full max-w-md p-xl overflow-y-auto max-h-[90vh]">
        <h3 className="text-headline-sm font-headline font-bold text-primary mb-lg">{t('clinic.pets.editPet')}</h3>
        {(error || uploadError) && <p className="text-error text-body-sm mb-md">{error || uploadError}</p>}
        <form onSubmit={submit} className="flex flex-col gap-md">
          {/* Photo upload */}
          <div className="flex items-center gap-md">
            <div className="w-16 h-16 rounded-xl bg-surface-container-high flex items-center justify-center overflow-hidden flex-shrink-0 border border-outline-variant">
              {photoPreview
                ? <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                : <AuthedPetImage petId={pet.id} alt={pet.name} className="w-full h-full object-cover" />
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
                {photoFile ? t('clinic.pets.changePhoto') : t('clinic.pets.addPhotoOptional')}
              </button>
              {isUploading && <p className="text-body-sm text-on-surface-variant">{t('clinic.pets.uploading')}</p>}
            </div>
          </div>

          <input required className={fieldClass} placeholder={t('clinic.pets.petName')} value={form.name} onChange={set('name')} />
          <div className="flex gap-md">
            <select className={`flex-1 ${fieldClass}`} value={form.species} onChange={set('species')}>
              <option value="canine">{t('clinic.pets.speciesCanine')}</option>
              <option value="feline">{t('clinic.pets.speciesFeline')}</option>
              <option value="avian">{t('clinic.pets.speciesAvian')}</option>
              <option value="other">{t('common.other')}</option>
            </select>
            <select className={`flex-1 ${fieldClass}`} value={form.gender} onChange={set('gender')}>
              <option value="">{t('clinic.pets.genderLabel')}</option>
              <option value="male">{t('clinic.pets.genderMale')}</option>
              <option value="female">{t('clinic.pets.genderFemale')}</option>
              <option value="unknown">{t('clinic.pets.genderUnknown')}</option>
            </select>
          </div>
          <div className="flex gap-md">
            <input className={`flex-1 ${fieldClass}`} placeholder={t('clinic.pets.breedOptional')} value={form.breed} onChange={set('breed')} />
            <input className={`flex-1 ${fieldClass}`} placeholder={t('clinic.pets.colorOptional')} value={form.color} onChange={set('color')} />
          </div>
          <input type="number" step="0.01" min="0" className={fieldClass} placeholder={t('clinic.pets.weightOptional')} value={form.weightKg} onChange={set('weightKg')} />
          <input type="date" className={fieldClass} value={form.birthDate} onChange={set('birthDate')} />
          <input className={fieldClass} placeholder={t('clinic.pets.microchipOptional')} value={form.microchipId} onChange={set('microchipId')} />
          <textarea className="bg-surface-container-low rounded-lg px-md py-sm min-h-[80px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary resize-none" placeholder={t('clinic.pets.allergiesOptional')} value={form.allergies} onChange={set('allergies')} />
          <textarea className="bg-surface-container-low rounded-lg px-md py-sm min-h-[80px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary resize-none" placeholder={t('clinic.pets.conditionsOptional')} value={form.underlyingConditions} onChange={set('underlyingConditions')} />
          <div className="flex gap-md pt-sm">
            <button type="button" onClick={onClose} className="flex-1 min-h-[44px] rounded-lg border border-outline-variant text-body-sm font-semibold hover:bg-surface-container-low transition-colors">{t('common.cancel')}</button>
            <button type="submit" disabled={busy} className="flex-1 min-h-[44px] rounded-lg bg-primary text-primary-on text-body-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{busy ? t('common.saving') : t('clinic.pets.saveChanges')}</button>
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

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const { error, saving, submit } = useModalSubmit(async () => {
    await api.post('/api/vaccinations', { petId, ...form, nextDueAt: form.nextDueAt || null, batchNo: form.batchNo || null, notes: form.notes || null })
  }, onSuccess)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-lg">
      <div className="bg-surface rounded-xl shadow-lg w-full max-w-md p-xl">
        <h3 className="text-headline-sm font-headline font-bold text-primary mb-lg">{t('clinic.pets.recordVaccination')}</h3>
        {error && <p className="text-error text-body-sm mb-md">{error}</p>}
        <form onSubmit={submit} className="flex flex-col gap-md">
          <input required className={fieldClass} placeholder={t('clinic.pets.vaccineName')} value={form.vaccineName} onChange={set('vaccineName')} />
          <label className="text-body-sm text-on-surface-variant">{t('clinic.pets.dateAdministered')}</label>
          <input required type="date" className={fieldClass} value={form.administeredAt} onChange={set('administeredAt')} />
          <label className="text-body-sm text-on-surface-variant">{t('clinic.pets.nextDueDateOptional')}</label>
          <input type="date" className={fieldClass} value={form.nextDueAt} onChange={set('nextDueAt')} />
          <input className={fieldClass} placeholder={t('clinic.pets.batchOptional')} value={form.batchNo} onChange={set('batchNo')} />
          <div className="flex gap-md pt-sm">
            <button type="button" onClick={onClose} className="flex-1 min-h-[44px] rounded-lg border border-outline-variant text-body-sm font-semibold hover:bg-surface-container-low transition-colors">{t('common.cancel')}</button>
            <button type="submit" disabled={saving} className="flex-1 min-h-[44px] rounded-lg bg-primary text-primary-on text-body-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{saving ? t('common.saving') : t('common.save')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Pet Detail Tabs ──────────────────────────────────────────────────────────
const TABS = ['Overview', 'Medical', 'Vaccinations'] as const
type Tab = typeof TABS[number]

// R-1: `tab` state stays these English keys — only the tab bar's displayed
// label is translated, via this map. Note: the loop variable below is named
// `tabName`, not `t`, so it does not shadow the `t` translator (C-2 trap).
const TAB_LABEL_KEYS: Record<Tab, string> = {
  Overview: 'clinic.pets.tabOverview',
  Medical: 'clinic.pets.tabMedical',
  Vaccinations: 'clinic.pets.tabVaccinations',
}

export function PetDetail({ petId, onAddVaccination }: { petId: number; onAddVaccination: () => void }) {
  const t = useT()
  const language = useUiStore(s => s.language)
  const navigate = useNavigate()
  const hasPermission = useAuthStore(s => s.hasPermission)
  const [tab, setTab] = useState<Tab>('Overview')
  const [editingPet, setEditingPet] = useState(false)
  const [admitting, setAdmitting] = useState(false)

  const { data, isLoading } = useQuery<{ data: Pet }>({
    queryKey: ['pet', petId],
    queryFn: () => api.get(`/api/pets/${petId}`).then(r => r.data),
  })

  const pet = data?.data
  if (isLoading) return <div className="flex-1 flex items-center justify-center text-on-surface-variant">{t('common.loading')}</div>
  if (!pet) return null

  const owner = pet.owner

  return (
    <div className="flex-1 overflow-y-auto p-lg flex flex-col gap-lg">
      {/* Pet hero */}
      <div className="flex items-center gap-lg bg-surface rounded-xl border border-outline-variant p-lg">
        {pet.photoUrl
          ? <AuthedPetImage petId={pet.id} alt={pet.name} className="w-[120px] h-[120px] rounded-xl object-cover border border-outline-variant" iconSize={48} />
          : <div className="w-[120px] h-[120px] rounded-xl bg-surface-container-high flex items-center justify-center"><MaterialIcon name="pets" size={48} className="text-on-surface-variant" /></div>
        }
        <div className="flex-1">
          <div className="flex items-center gap-sm">
            <h3 className="text-headline-md font-headline font-bold text-primary">{pet.name}</h3>
            <Can perm="crm.edit">
              <button
                type="button"
                aria-label={t('clinic.pets.editPet')}
                onClick={() => setEditingPet(true)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-surface-container-low transition-colors"
              >
                <MaterialIcon name="edit" size={20} className="text-on-surface-variant" />
              </button>
            </Can>
            <Can perm="inpatient.manage">
              <button
                type="button"
                onClick={() => setAdmitting(true)}
                className="flex items-center gap-xs rounded-lg border border-outline-variant px-md py-xs min-h-[44px] text-body-sm font-medium text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <MaterialIcon name="local_hospital" size={18} />
                {t('clinic.pets.admitToInpatient')}
              </button>
            </Can>
          </div>
          <div className="flex flex-wrap gap-sm mt-sm">
            <span className={`px-sm py-xs rounded-full text-label-md font-medium ${speciesChip(pet.species)}`}>{speciesLabel(t, pet.species)}</span>
            {pet.breed && <span className="px-sm py-xs rounded-full bg-surface-container text-on-surface-variant text-label-md">{pet.breed}</span>}
            {ageFromDate(pet.birthDate, t) && <span className="px-sm py-xs rounded-full bg-surface-container text-on-surface-variant text-label-md">{ageFromDate(pet.birthDate, t)}</span>}
            {pet.gender && <span className="px-sm py-xs rounded-full bg-surface-container text-on-surface-variant text-label-md capitalize">{genderLabel(t, pet.gender)}</span>}
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
            <p className="text-body-sm text-on-surface-variant">{owner.address ?? '—'}</p>
            {owner.idCardNumber && <p className="text-body-sm text-on-surface-variant">{maskIdCard(owner.idCardNumber)}</p>}
          </div>
        </div>
      )}

      {/* Alerts */}
      {(pet.allergies || pet.underlyingConditions) && (
        <div className="bg-error-container rounded-xl p-lg border border-error/30">
          {pet.allergies && <p className="text-body-sm font-semibold text-error"><MaterialIcon name="warning" size={16} className="inline mr-xs" />{t('clinic.pets.allergiesAlert').replace('{value}', pet.allergies)}</p>}
          {pet.underlyingConditions && <p className="text-body-sm text-error mt-xs"><MaterialIcon name="medical_information" size={16} className="inline mr-xs" />{t('clinic.pets.conditionsAlert').replace('{value}', pet.underlyingConditions)}</p>}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-outline-variant">
        {TABS.map(tabName => (
          <button key={tabName} onClick={() => setTab(tabName)} className={`px-lg py-sm text-body-sm font-semibold min-h-[44px] transition-colors ${tab === tabName ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>{t(TAB_LABEL_KEYS[tabName])}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Overview' && (
        <div className="flex flex-col gap-md">
          {[
            { label: t('clinic.pets.speciesLabel'), value: pet.species ? speciesLabel(t, pet.species) : '—' },
            { label: t('clinic.pets.breedLabel'), value: pet.breed ?? '—' },
            { label: t('clinic.pets.genderLabel'), value: pet.gender ? genderLabel(t, pet.gender) : '—' },
            { label: t('clinic.pets.dobLabel'), value: pet.birthDate ? formatDate(pet.birthDate, language) : '—' },
            { label: t('clinic.pets.weightLabel'), value: pet.weightKg ? `${pet.weightKg} ${t('clinic.pets.kgUnit')}` : '—' },
            { label: t('clinic.pets.colorLabel'), value: pet.color ?? '—' },
            { label: t('clinic.pets.microchipLabel'), value: pet.microchipId ?? '—' },
            { label: t('clinic.pets.allergiesLabel'), value: pet.allergies ?? '—' },
            { label: t('clinic.pets.conditionsLabel'), value: pet.underlyingConditions ?? '—' },
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
          {pet.medicalRecords?.length ? (
            <>
              {pet.medicalRecords.map(r => (
                <div key={r.id} className="flex justify-between items-center min-h-[48px] border-b border-outline-variant/50 py-sm">
                  <span className="text-body-sm">{r.assessment ?? t('clinic.pets.visitFallback')}</span>
                  <span className="text-body-sm text-on-surface-variant">{formatDate(r.createdAt, language)}</span>
                </div>
              ))}
              <Can perm="emr.view">
                <button
                  type="button"
                  onClick={() => navigate(`/clinic/emr?petId=${pet.id}`)}
                  className="mt-md text-body-sm font-semibold text-primary hover:underline"
                >
                  {t('clinic.pets.viewAllInEmr')}
                </button>
              </Can>
            </>
          ) : (
            <p className="text-body-sm text-on-surface-variant py-lg">
              {hasPermission('emr.view') ? t('clinic.pets.noMedicalRecords') : t('clinic.pets.noClinicalAccess')}
            </p>
          )}
        </div>
      )}

      {tab === 'Vaccinations' && (
        <div>
          {pet.vaccinations !== undefined && (
            <div className="flex justify-end mb-md">
              <Can perm="vaccination.create">
                <button onClick={onAddVaccination} className="flex items-center gap-sm bg-primary text-primary-on rounded-lg px-md py-sm min-h-[44px] text-body-sm font-semibold hover:bg-primary/90 transition-colors">
                  <MaterialIcon name="add" size={18} />{t('clinic.pets.addVaccination')}
                </button>
              </Can>
            </div>
          )}
          {pet.vaccinations?.length ? pet.vaccinations.map(v => (
            <div key={v.id} className="flex justify-between items-center min-h-[48px] border-b border-outline-variant/50 py-sm">
              <div>
                <p className="text-body-sm font-medium">{v.vaccineName}</p>
                {v.nextDueAt && <p className="text-label-md text-on-surface-variant">{t('clinic.pets.dueDate').replace('{date}', formatDate(v.nextDueAt, language))}</p>}
              </div>
              <span className="text-body-sm text-on-surface-variant">{formatDate(v.administeredAt, language)}</span>
            </div>
          )) : (
            <p className="text-body-sm text-on-surface-variant py-lg">
              {hasPermission('emr.view') ? t('clinic.pets.noVaccinationRecords') : t('clinic.pets.noClinicalAccess')}
            </p>
          )}
        </div>
      )}

      {editingPet && pet && (
        <EditPetModal pet={pet} onClose={() => setEditingPet(false)} onSuccess={() => setEditingPet(false)} />
      )}

      {admitting && pet && (
        <AdmitModal petId={pet.id} onClose={() => setAdmitting(false)} onSaved={() => setAdmitting(false)} />
      )}
    </div>
  )
}

// ─── Owner Panel ─────────────────────────────────────────────────────────────
export function OwnerPanel({ ownerId, onSelectPet, onAddPet, onDeleted }: { ownerId: number; onSelectPet: (petId: number) => void; onAddPet: () => void; onDeleted?: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [actionError, setActionError] = useState('')

  const { data, isLoading } = useQuery<{ data: Owner }>({
    queryKey: ['owner', ownerId],
    queryFn: () => api.get(`/api/owners/${ownerId}`).then(r => r.data),
  })
  const owner = data?.data
  if (isLoading) return <div className="flex-1 flex items-center justify-center text-on-surface-variant text-body-sm">{t('common.loading')}</div>
  if (!owner) return null

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['owner', ownerId] })
    qc.invalidateQueries({ queryKey: ['owners'] })
  }

  const handleDelete = async () => {
    setActionError('')
    if (!confirm(t('clinic.pets.deactivateConfirm').replace('{name}', `${owner.firstName} ${owner.lastName}`))) return
    try {
      await api.delete(`/api/owners/${owner.id}`)
      refresh()
      onDeleted?.()
    } catch (err) {
      setActionError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('clinic.pets.failedToDelete'))
    }
  }

  const handleReactivate = async () => {
    setActionError('')
    try {
      await api.put(`/api/owners/${owner.id}`, { isActive: true })
      refresh()
    } catch (err) {
      setActionError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('clinic.pets.failedToReactivate'))
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-lg flex flex-col gap-lg">
      {/* Owner header */}
      <div className="flex items-center gap-lg bg-surface rounded-xl border border-outline-variant p-lg">
        <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-on font-bold text-headline-xs flex-shrink-0">
          {initials(owner.firstName, owner.lastName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-sm">
            <h3 className="text-headline-sm font-headline font-bold text-on-surface">{owner.firstName} {owner.lastName}</h3>
            {!owner.isActive && <span className="px-sm py-xs rounded-full bg-surface-container-high text-on-surface-variant text-label-md">{t('clinic.pets.inactiveBadge')}</span>}
          </div>
          <p className="text-body-sm text-on-surface-variant mt-xs">{owner.phone}</p>
          {owner.email && <p className="text-body-sm text-on-surface-variant">{owner.email}</p>}
          {owner.address && <p className="text-body-sm text-on-surface-variant truncate">{owner.address}</p>}
        </div>
        {owner.isActive ? (
          <div className="flex gap-xs flex-shrink-0">
            <Can perm="crm.edit">
              <button title={t('common.edit')} onClick={() => setEditing(true)} className="w-10 h-10 flex items-center justify-center rounded-lg border border-outline-variant hover:bg-surface-container-low transition-colors">
                <MaterialIcon name="edit" size={18} />
              </button>
            </Can>
            <Can perm="crm.delete">
              <button title={t('common.delete')} onClick={handleDelete} className="w-10 h-10 flex items-center justify-center rounded-lg border border-outline-variant hover:bg-error-container transition-colors">
                <MaterialIcon name="delete" size={18} className="text-error" />
              </button>
            </Can>
          </div>
        ) : (
          <Can perm="crm.delete">
            <button onClick={handleReactivate} className="flex items-center gap-xs bg-primary text-primary-on rounded-lg px-md py-sm min-h-[44px] text-body-sm font-semibold hover:bg-primary/90 transition-colors flex-shrink-0">
              <MaterialIcon name="restore" size={18} />{t('clinic.pets.reactivateOwner')}
            </button>
          </Can>
        )}
      </div>
      {actionError && <p className="text-error text-body-sm">{actionError}</p>}

      {/* Pet cards */}
      <div>
        <div className="flex items-center justify-between mb-md">
          <h4 className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider">{t('clinic.pets.petsHeading').replace('{n}', String(owner.pets?.length ?? 0))}</h4>
          <button onClick={onAddPet} className="flex items-center gap-xs bg-primary text-primary-on rounded-lg px-md py-sm min-h-[44px] text-body-sm font-semibold hover:bg-primary/90 transition-colors">
            <MaterialIcon name="add" size={18} /> {t('clinic.pets.addPetButton')}
          </button>
        </div>
        {owner.pets?.length ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-md">
            {owner.pets.map(pet => (
              <button key={pet.id} onClick={() => onSelectPet(pet.id)}
                      className="flex flex-col items-center gap-sm p-lg bg-surface rounded-xl border border-outline-variant hover:border-primary hover:shadow-lvl1 transition-all min-h-[120px] text-center">
                {pet.photoUrl
                  ? <AuthedPetImage petId={pet.id} alt={pet.name} className="w-16 h-16 rounded-full object-cover border border-outline-variant" iconSize={28} />
                  : <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center">
                      <MaterialIcon name="pets" size={28} className="text-on-surface-variant" />
                    </div>
                }
                <span className="text-body-sm font-semibold text-on-surface">{pet.name}</span>
                <span className={`px-sm py-xs rounded-full text-label-md capitalize ${speciesChip(pet.species)}`}>{speciesLabel(t, pet.species)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-xl text-on-surface-variant">
            <MaterialIcon name="pets" size={40} className="mb-sm opacity-30 block mx-auto" />
            <p className="text-body-sm">{t('clinic.pets.noPetsYet')}</p>
          </div>
        )}
      </div>

      {editing && (
        <EditOwnerModal owner={owner} onClose={() => setEditing(false)} onSuccess={() => { refresh(); setEditing(false) }} />
      )}
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────
export default function ClinicPets() {
  const t = useT()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const canSeeInactive = useAuthStore(s => s.hasPermission('crm.delete'))
  const [selectedOwnerId, setSelectedOwnerId] = useState<number | null>(null)
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null)
  const [modal, setModal] = useState<'addOwner' | 'addPet' | 'addVaccination' | null>(null)

  const { data: ownersData, isLoading } = useQuery({
    queryKey: ['owners', search, showInactive],
    queryFn: () => api.get('/api/owners', { params: { q: search || undefined, limit: 50, includeInactive: showInactive || undefined } }).then(r => r.data.data),
    staleTime: 30_000,
  })
  const owners: Owner[] = ownersData?.owners ?? []

  const { data: ownerDetail } = useQuery<{ data: Owner }>({
    queryKey: ['owner', selectedOwnerId],
    queryFn: () => api.get(`/api/owners/${selectedOwnerId}`).then(r => r.data),
    enabled: selectedOwnerId != null,
  })
  const selectedOwner = ownerDetail?.data

  const closeModal = useCallback(() => setModal(null), [])
  const refreshAndClose = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['owners'] })
    qc.invalidateQueries({ queryKey: ['owner', selectedOwnerId] })
    if (selectedPetId) qc.invalidateQueries({ queryKey: ['pet', selectedPetId] })
    setModal(null)
  }, [qc, selectedOwnerId, selectedPetId])

  return (
    <div className="flex h-full">
      {/* ── Left panel: Owner list ── */}
      <div className="w-72 flex-shrink-0 border-r border-outline-variant flex flex-col bg-surface overflow-hidden">
        <div className="p-md border-b border-outline-variant">
          <div className="relative">
            <MaterialIcon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-surface-container-low rounded-full py-sm pl-10 pr-md text-body-sm border-none focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              placeholder={t('clinic.pets.searchOwnersPlaceholder')}
            />
          </div>
        </div>

        <div className="p-md border-b border-outline-variant">
          <button onClick={() => setModal('addOwner')} className="w-full flex items-center justify-center gap-sm bg-surface border border-outline-variant rounded-lg px-md py-sm min-h-[44px] text-body-sm font-semibold hover:bg-surface-container-low transition-colors">
            <MaterialIcon name="person_add" size={18} />{t('clinic.pets.addOwner')}
          </button>
        </div>

        {canSeeInactive && (
          <label className="flex items-center gap-sm px-md py-sm border-b border-outline-variant text-body-sm text-on-surface-variant cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} aria-label={t('clinic.pets.showInactive')} />
            {t('clinic.pets.showInactive')}
          </label>
        )}

        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="p-lg text-body-sm text-on-surface-variant">{t('common.loading')}</div>}
          {!isLoading && owners.length === 0 && <div className="p-lg text-body-sm text-on-surface-variant">{t('clinic.pets.noOwnersFound')}</div>}
          {owners.map(owner => (
            <button
              key={owner.id}
              onClick={() => { setSelectedOwnerId(owner.id); setSelectedPetId(null) }}
              className={`w-full text-left flex items-center gap-md p-md border-b border-outline-variant/50 min-h-[72px] transition-colors ${owner.isActive === false ? 'opacity-60' : ''} ${selectedOwnerId === owner.id ? 'bg-surface-container-low border-l-4 border-primary' : 'hover:bg-surface-container-low border-l-4 border-transparent'}`}
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-bold text-label-md">
                {initials(owner.firstName, owner.lastName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-xs">
                  <p className="text-headline-xs font-bold truncate">{owner.firstName} {owner.lastName}</p>
                  {owner.isActive === false && <span className="px-sm py-xs rounded-full bg-surface-container-high text-on-surface-variant text-label-md flex-shrink-0">{t('clinic.pets.inactiveBadge')}</span>}
                </div>
                <p className="text-body-sm text-on-surface-variant truncate">{owner.phone}</p>
                <p className="text-label-md text-on-surface-variant">{t(owner.pets?.length === 1 ? 'clinic.pets.petCountOne' : 'clinic.pets.petCountOther').replace('{n}', String(owner.pets?.length ?? 0))}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedPetId ? (
          <>
            <div className="flex items-center px-lg py-md border-b border-outline-variant bg-surface flex-shrink-0 gap-md">
              <button onClick={() => setSelectedPetId(null)} className="flex items-center gap-xs text-on-surface-variant hover:text-on-surface min-h-[44px] transition-colors">
                <MaterialIcon name="arrow_back" size={18} />
                <span className="text-body-sm">{t('common.back')}</span>
              </button>
              <h2 className="text-headline-sm font-headline font-bold text-primary">{t('clinic.pets.petProfileHeading')}</h2>
            </div>
            <PetDetail petId={selectedPetId} onAddVaccination={() => setModal('addVaccination')} />
          </>
        ) : selectedOwnerId ? (
          <OwnerPanel
            ownerId={selectedOwnerId}
            onSelectPet={setSelectedPetId}
            onAddPet={() => setModal('addPet')}
            onDeleted={() => { setSelectedOwnerId(null); setSelectedPetId(null) }}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-xl text-on-surface-variant">
            <MaterialIcon name="group" size={64} className="mb-lg opacity-20" />
            <p className="text-headline-sm font-headline font-bold mb-sm">{t('clinic.pets.selectOwnerHeading')}</p>
            <p className="text-body-md">{t('clinic.pets.selectOwnerHint')}</p>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modal === 'addOwner' && (
        <AddOwnerModal onClose={closeModal} onSuccess={() => { qc.invalidateQueries({ queryKey: ['owners'] }); setModal(null) }} />
      )}
      {modal === 'addPet' && selectedOwnerId && selectedOwner && (
        <AddPetModal
          ownerId={selectedOwnerId}
          ownerName={`${selectedOwner.firstName} ${selectedOwner.lastName}`}
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
