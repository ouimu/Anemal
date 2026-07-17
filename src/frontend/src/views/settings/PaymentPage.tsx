import React, { useState, useEffect, useRef } from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { useAuthStore } from '../../store/authStore'
import { usePaymentSettings, useUpdatePayment } from '../../hooks/usePaymentSettings'
import { getErrorMessage } from '../../utils/errorMessage'

interface PaymentForm {
  promptpayId:      string
  paymentQrUrl:     string
  gbprimepayPublic: string
  gbprimepaySecret: string
}

export default function PaymentPage() {
  const { data, isLoading } = usePaymentSettings()
  const update = useUpdatePayment()
  const userId = useAuthStore(s => s.userId)

  const [form, setForm] = useState<PaymentForm>({
    promptpayId: '', paymentQrUrl: '', gbprimepayPublic: '', gbprimepaySecret: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const qrRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!data) return
    setForm({
      promptpayId:      data.promptpayId      ?? '',
      paymentQrUrl:     data.paymentQrUrl     ?? '',
      gbprimepayPublic: data.gbprimepayPublic ?? '',
      gbprimepaySecret: data.gbprimepaySecret ?? '',
    })
  }, [data])

  function handleQrChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErrors(p => ({ ...p, paymentQrUrl: 'Only image files are accepted' }))
      return
    }
    if (file.size > 500_000) {
      setErrors(p => ({ ...p, paymentQrUrl: 'QR image must be under 500KB' }))
      return
    }
    setErrors(p => ({ ...p, paymentQrUrl: '' }))
    const reader = new FileReader()
    reader.onload = ev => {
      if (ev.target?.result) {
        setForm(p => ({ ...p, paymentQrUrl: ev.target!.result as string }))
      }
    }
    reader.readAsDataURL(file)
  }

  const MASK_PREFIX = '••••'
  function stripMask(v: string): string | undefined {
    if (!v || v.startsWith(MASK_PREFIX)) return undefined
    return v
  }

  function handleQrDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 500_000) {
      setErrors(p => ({ ...p, paymentQrUrl: 'QR image must be under 500KB' }))
      return
    }
    const reader = new FileReader()
    reader.onload = ev => setForm(p => ({ ...p, paymentQrUrl: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (form.promptpayId && !/^(\d{10}|\d{13})$/.test(form.promptpayId))
      e.promptpayId = 'PromptPay ID must be 10 digits (phone) or 13 digits (tax ID)'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    try {
      await update.mutateAsync({
        promptpayId:      form.promptpayId  || undefined,
        paymentQrUrl:     form.paymentQrUrl || undefined,
        gbprimepayPublic: stripMask(form.gbprimepayPublic),
        gbprimepaySecret: stripMask(form.gbprimepaySecret),
      })
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
      <span className="text-body-md">Loading payment settings…</span>
    </div>
  )

  return (
    <form onSubmit={handleSave} className="max-w-2xl mx-auto p-xl flex flex-col gap-lg">
      <h1 className="text-headline-md font-headline font-bold text-on-surface">Payment</h1>

      {/* Success banner */}
      {saved && (
        <div className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-secondary flex items-center gap-sm">
          <MaterialIcon name="check_circle" size={18} />
          Changes saved successfully
        </div>
      )}

      {/* Error banner */}
      {update.error && (
        <div className="px-md py-sm bg-error/10 border border-error/30 rounded-xl text-body-md text-error">
          Failed to save: {getErrorMessage(update.error, 'Please try again.')}
        </div>
      )}

      {/* ── PromptPay section ──────────────────────────────────────── */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md">
        <h2 className="text-title-md font-medium text-on-surface">PromptPay</h2>
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant" htmlFor="promptpayId">
            PromptPay ID
          </label>
          <input
            id="promptpayId"
            type="text"
            value={form.promptpayId}
            onChange={e => setForm(p => ({ ...p, promptpayId: e.target.value }))}
            placeholder="Phone number (10 digits) or Tax ID (13 digits)"
            className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
          />
          {errors.promptpayId && <p className="text-label-md text-error">{errors.promptpayId}</p>}
        </div>
      </div>

      {/* ── PromptPay QR Image section ─────────────────────────────── */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md">
        <h2 className="text-title-md font-medium text-on-surface">PromptPay QR Image</h2>
        <div className="flex flex-col gap-sm">
          {/* Preview (shown when paymentQrUrl is set) */}
          {form.paymentQrUrl && (
            <div className="w-40 h-40 rounded-xl border border-outline-variant overflow-hidden bg-surface-container-low flex items-center justify-center">
              <img src={form.paymentQrUrl} alt="PromptPay QR preview" className="w-full h-full object-contain" />
            </div>
          )}
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleQrDrop}
            onClick={() => qrRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') qrRef.current?.click() }}
            aria-label="Upload PromptPay QR image"
            className={`flex-1 min-h-[44px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors px-md py-sm gap-xs
              ${isDragging ? 'border-primary bg-surface-container-low' : 'border-outline-variant hover:border-primary'}`}
          >
            <MaterialIcon name="qr_code" size={20} className="text-on-surface-variant" />
            <span className="text-body-sm text-on-surface-variant text-center">Drag &amp; drop or click to upload PromptPay QR</span>
            <span className="text-label-md text-on-surface-variant">PNG, JPG — max 500KB</span>
          </div>
          <input ref={qrRef} type="file" accept="image/*" className="hidden" onChange={handleQrChange} />
          {errors.paymentQrUrl && <p className="text-label-md text-error">{errors.paymentQrUrl}</p>}
        </div>
      </div>

      {/* ── GB PrimePay placeholder section ───────────────────────── */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md opacity-60">
        <div className="flex items-center justify-between">
          <h2 className="text-title-md font-medium text-on-surface">GB PrimePay</h2>
          <span className="text-label-md px-sm py-xs bg-surface-container-low border border-outline-variant rounded-lg text-on-surface-variant">
            Phase 4 — Not yet active
          </span>
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant" htmlFor="gbprimepayPublic">Public Key</label>
          <input
            id="gbprimepayPublic"
            disabled
            readOnly
            value={form.gbprimepayPublic}
            className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface-variant bg-surface-container-low cursor-not-allowed w-full"
          />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant" htmlFor="gbprimepaySecret">Secret Key</label>
          <input
            id="gbprimepaySecret"
            disabled
            readOnly
            type="password"
            value={form.gbprimepaySecret}
            className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface-variant bg-surface-container-low cursor-not-allowed w-full"
          />
        </div>
      </div>

      {/* ── Sticky save bar ────────────────────────────────────────── */}
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
  )
}
