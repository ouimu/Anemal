// @uiux-agent spec: logo upload zone, clinic identity fields, save inline
import React, { useState, useEffect, useRef } from 'react'
import { useAdminSettings, useUpdateSettings } from '../../hooks/useAdmin'

export default function ClinicProfileTab() {
  const { data, isLoading } = useAdminSettings()
  const update = useUpdateSettings()
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    name: '', phone: '', email: '', website: '', address: '', taxId: '', logoUrl: '',
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data) setForm({
      name:    data.tenant.name,
      phone:   data.phone    ?? '',
      email:   data.email    ?? '',
      website: data.website  ?? '',
      address: data.address  ?? '',
      taxId:   data.taxId    ?? '',
      logoUrl: data.logoUrl  ?? '',
    })
  }, [data])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    await update.mutateAsync(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // Simulated logo preview (real upload would use pre-signed S3 URL)
  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setForm(p => ({ ...p, logoUrl: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }

  if (isLoading) return <p className="text-sm text-on-surface-variant py-8 text-center">Loading…</p>

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Identity header */}
      <section>
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Clinic identity</h3>
        <div className="bg-surface border border-outline-variant rounded-xl p-5">
          <div className="flex gap-5 items-start">
            {/* Logo upload */}
            <div
              onClick={() => fileRef.current?.click()}
              className="w-20 h-20 flex-shrink-0 border-2 border-dashed border-outline-variant rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary transition-colors group"
            >
              {form.logoUrl
                ? <img src={form.logoUrl} alt="clinic logo" className="w-full h-full object-contain rounded-xl"/>
                : <>
                    <span className="text-2xl text-outline group-hover:text-primary">☁</span>
                    <span className="text-[10px] text-on-surface-variant">Logo</span>
                  </>
              }
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange}/>
            </div>

            {/* Name + subdomain */}
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-on-surface-variant">Clinic name</label>
                <input name="name" value={form.name} onChange={handleChange}
                  className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"/>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-on-surface-variant">Subdomain</label>
                <input value={data?.tenant.subdomain ?? ''} disabled
                  className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm bg-surface-container-low text-on-surface-variant cursor-not-allowed"/>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-on-surface-variant">Tax ID</label>
                <input name="taxId" value={form.taxId} onChange={handleChange}
                  className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"/>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-on-surface-variant">Phone</label>
                <input name="phone" value={form.phone} onChange={handleChange}
                  className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"/>
              </div>
            </div>
          </div>

          {/* Lower fields */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-on-surface-variant">Email</label>
              <input name="email" type="email" value={form.email} onChange={handleChange}
                className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"/>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-on-surface-variant">Website</label>
              <input name="website" value={form.website} onChange={handleChange}
                className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"/>
            </div>
          </div>
          <div className="flex flex-col gap-1 mt-3">
            <label className="text-xs text-on-surface-variant">Address</label>
            <textarea name="address" value={form.address} onChange={handleChange} rows={2}
              className="px-3 py-2 border border-outline-variant rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"/>
          </div>
        </div>
      </section>

      {/* Save bar */}
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-secondary-on-container">✓ Saved</span>}
        <button type="submit" disabled={update.isPending}
          className="min-h-[44px] px-6 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-on text-sm font-semibold rounded-lg transition-colors">
          {update.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
