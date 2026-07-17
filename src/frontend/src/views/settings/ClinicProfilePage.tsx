import React, { useState, useEffect, useRef } from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { useAuthStore } from '../../store/authStore'
import { useClinicSettings, useUpdateClinicProfile } from '../../hooks/useClinicSettings'
import { getErrorMessage } from '../../utils/errorMessage'

interface FormState {
  name:    string
  phone:   string
  address: string
  taxId:   string
  website: string
  email:   string
  logoUrl: string
}

export default function ClinicProfilePage() {
  const { data, isLoading } = useClinicSettings()
  const update = useUpdateClinicProfile()
  const userId = useAuthStore(s => s.userId)

  const [form, setForm] = useState<FormState>({
    name: '', phone: '', address: '', taxId: '', website: '', email: '', logoUrl: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!data) return
    setForm({
      name:    data.tenant.name ?? '',
      phone:   data.phone    ?? '',
      address: data.address  ?? '',
      taxId:   data.taxId    ?? '',
      website: data.website  ?? '',
      email:   data.email    ?? '',
      logoUrl: data.logoUrl  ?? '',
    })
  }, [data])

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500_000) {
      setErrors(p => ({ ...p, logoUrl: 'Logo must be under 500KB' }))
      return
    }
    const reader = new FileReader()
    reader.onload = ev => setForm(p => ({ ...p, logoUrl: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 500_000) {
      setErrors(p => ({ ...p, logoUrl: 'Logo must be under 500KB' }))
      return
    }
    const reader = new FileReader()
    reader.onload = ev => setForm(p => ({ ...p, logoUrl: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Clinic name is required'
    if (form.website && !/^https?:\/\/.+/.test(form.website))
      e.website = 'Must be a valid URL (https://...)'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    try {
      await update.mutateAsync(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      // error displayed via update.error
    }
  }

  const lastUpdated = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    : null
  const byYou = data?.updatedBy != null && data.updatedBy === userId

  if (isLoading) return (
    <div className="p-xl flex items-center gap-sm text-on-surface-variant">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-body-md">Loading clinic profile…</span>
    </div>
  )

  return (
    <div className="p-xl max-w-2xl">
      <h1 className="text-headline-md font-headline font-bold text-on-surface mb-lg">
        Clinic Profile
      </h1>

      {/* Success banner */}
      {saved && (
        <div className="mb-md px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-secondary flex items-center gap-sm">
          <MaterialIcon name="check_circle" size={18} />
          Changes saved successfully
        </div>
      )}

      {/* Error banner for API errors */}
      {update.error && (
        <div className="mb-md px-md py-sm bg-error/10 border border-error/30 rounded-xl text-body-md text-error">
          Failed to save: {getErrorMessage(update.error, 'Please try again.')}
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-lg">
        {/* Clinic Name */}
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-on-surface-variant" htmlFor="clinicName">
            Clinic Name <span className="text-error">*</span>
          </label>
          <input
            id="clinicName"
            type="text"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary"
          />
          {errors.name && <p className="text-label-md text-error">{errors.name}</p>}
        </div>

        {/* Phone */}
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-on-surface-variant" htmlFor="clinicPhone">
            Phone
          </label>
          <input
            id="clinicPhone"
            type="tel"
            value={form.phone}
            onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
            className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary"
          />
        </div>

        {/* Email */}
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-on-surface-variant" htmlFor="clinicEmail">
            Email
          </label>
          <input
            id="clinicEmail"
            type="email"
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary"
          />
        </div>

        {/* Address */}
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-on-surface-variant" htmlFor="clinicAddress">
            Address
          </label>
          <textarea
            id="clinicAddress"
            rows={3}
            value={form.address}
            onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
            className="min-h-[44px] px-md py-sm border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary resize-none"
          />
        </div>

        {/* Tax ID */}
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-on-surface-variant" htmlFor="clinicTaxId">
            Tax ID
          </label>
          <input
            id="clinicTaxId"
            type="text"
            value={form.taxId}
            onChange={e => setForm(p => ({ ...p, taxId: e.target.value }))}
            className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary"
          />
        </div>

        {/* Website URL */}
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-on-surface-variant" htmlFor="clinicWebsite">
            Website URL
          </label>
          <input
            id="clinicWebsite"
            type="url"
            value={form.website}
            onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
            className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary"
          />
          {errors.website && <p className="text-label-md text-error">{errors.website}</p>}
        </div>

        {/* ── Logo ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-on-surface-variant">Clinic Logo</label>
          <div className="flex items-center gap-md">
            {/* Preview */}
            <div className="w-20 h-20 rounded-xl border border-outline-variant overflow-hidden bg-surface-container-low flex items-center justify-center flex-shrink-0">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Clinic logo preview" className="w-full h-full object-cover" />
              ) : (
                <MaterialIcon name="add_photo_alternate" size={32} className="text-on-surface-variant" />
              )}
            </div>
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`flex-1 min-h-[44px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors px-md py-sm gap-xs
                ${isDragging ? 'border-primary bg-surface-container-low' : 'border-outline-variant hover:border-primary'}`}
            >
              <MaterialIcon name="upload" size={20} className="text-on-surface-variant" />
              <span className="text-body-sm text-on-surface-variant text-center">
                Drag &amp; drop or click to upload
              </span>
              <span className="text-label-md text-on-surface-variant">PNG, JPG — max 500KB</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoChange}
            />
          </div>
          {errors.logoUrl && <p className="text-label-md text-error">{errors.logoUrl}</p>}
        </div>

        {/* Sticky save button row */}
        <div className="sticky bottom-0 bg-background pt-sm pb-md flex items-center justify-between border-t border-outline-variant">
          <p className="text-label-md text-on-surface-variant">
            {lastUpdated
              ? `Last updated: ${lastUpdated}${byYou ? ' · by you' : ''}`
              : 'Never saved'}
          </p>
          <button
            type="submit"
            disabled={update.isPending}
            className="min-h-[44px] min-w-[44px] px-xl bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {update.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
