import { useState } from 'react'
import { useT } from '../../i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'
import { useProducts, type Product } from '../../hooks/useInventory'
import { useCreateInvoice, useRecordPayment, type Invoice } from '../../hooks/useInvoices'
import { useClinicSettings, type VatMode } from '../../hooks/useClinicSettings'
import { useAuthStore } from '../../store/authStore'

const baht = (n: number) => '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const round2 = (n: number) => Math.round(n * 100) / 100
const LOYALTY_REDEEM_RATIO = 0.2 // points can cover at most 20% of an invoice

// Mirrors backend computeVat() in invoice.service.ts (ADR-0020) — used for the live
// cart preview before the invoice exists server-side. Exported for unit testing.
export function calcVat(mode: VatMode, rate: number, taxable: number): { taxAmount: number; total: number } {
  if (mode === 'none') return { taxAmount: 0, total: round2(taxable) }
  if (mode === 'inclusive') {
    const taxAmount = round2(taxable - taxable / (1 + rate / 100))
    return { taxAmount, total: round2(taxable) }
  }
  const taxAmount = round2((taxable * rate) / 100)
  return { taxAmount, total: round2(taxable + taxAmount) }
}

const VAT_PRICE_LABEL_KEY: Record<VatMode, 'clinic.billing.priceExVat' | 'clinic.billing.priceIncVat' | null> = {
  none: null, exclusive: 'clinic.billing.priceExVat', inclusive: 'clinic.billing.priceIncVat',
}

interface Loyalty { ownerId: number; points: number; membershipTier: string }

const inputCls =
  'min-h-[44px] w-full bg-surface-container-low border border-outline-variant rounded-lg px-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

interface PetResult { petId: number; petName: string; ownerId: number; ownerName: string; phone: string }
interface PreviewLine { description: string; qty: number; unitPrice: number }
interface CartItem { key: number; description: string; itemType: string; qty: number; unitPrice: number; productId?: number }

let keySeq = 1

export default function ClinicBilling() {
  const t = useT()
  const [tab, setTab] = useState<'invoice' | 'history'>('invoice')
  const [petQuery, setPetQuery] = useState('')
  const [pet, setPet] = useState<PetResult | null>(null)
  const [recordId, setRecordId] = useState<number | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [discount, setDiscount] = useState('')
  const [redeemPts, setRedeemPts] = useState(0)
  const [method, setMethod] = useState<'cash' | 'qr_promptpay' | 'credit_card'>('cash')
  const [tendered, setTendered] = useState('')
  const [err, setErr] = useState('')
  const [paid, setPaid] = useState<Invoice | null>(null)
  const [earnedMsg, setEarnedMsg] = useState('')
  const [addingRetail, setAddingRetail] = useState(false)
  const [pendingInvoiceId, setPendingInvoiceId] = useState<number | null>(null)

  const qc = useQueryClient()
  const createInvoice = useCreateInvoice()
  const recordPayment = useRecordPayment()

  const { data: clinicSettings } = useClinicSettings()
  const vatMode: VatMode = clinicSettings?.vatMode ?? 'exclusive'
  const vatRate = Number(clinicSettings?.vatRate ?? 7)

  // Loyalty balance for the selected pet's owner.
  const { data: loyalty } = useQuery<Loyalty>({
    queryKey: ['loyalty', pet?.ownerId],
    enabled: !!pet?.ownerId,
    queryFn: () => api.get(`/api/loyalty/owners/${pet!.ownerId}`).then((r) => r.data.data),
  })

  // PromptPay QR code — fetched after invoice creation, before payment confirmation.
  const { data: qrDataUrl, isLoading: qrLoading, isError: qrError } = useQuery<string>({
    queryKey: ['promptpay-qr', pendingInvoiceId],
    queryFn: () => api.get(`/api/invoices/${pendingInvoiceId}/promptpay-qr`).then(r => r.data.dataUrl),
    enabled: method === 'qr_promptpay' && pendingInvoiceId != null,
    staleTime: Infinity,
    retry: false,
  })

  // Pet search (quick search returns pet results).
  const { data: searchResults } = useQuery<PetResult[]>({
    queryKey: ['billing', 'search', petQuery],
    enabled: petQuery.trim().length > 0 && !pet,
    queryFn: () => api.get('/api/search', { params: { q: petQuery } }).then((r) => r.data.data),
  })

  // Recent visits for the selected pet.
  const { data: recordsRaw } = useQuery({
    queryKey: ['billing', 'records', pet?.petId],
    enabled: !!pet,
    queryFn: () => api.get('/api/medical-records', { params: { petId: pet!.petId } }).then((r) => r.data.data),
  })
  const records: Array<{ id: number; createdAt: string; assessment: string | null }> =
    (recordsRaw?.records ?? recordsRaw ?? []) as never

  // Selected visit detail → medicine line preview (priced from drug.unitPrice). Auto-pulled server-side on submit.
  const { data: recordDetail } = useQuery({
    queryKey: ['billing', 'record', recordId],
    enabled: !!recordId,
    queryFn: () => api.get(`/api/medical-records/${recordId}`).then((r) => r.data.data),
  })
  const previewLines: PreviewLine[] = (recordDetail?.prescriptions ?? []).map(
    (rx: { quantity: string; drug: { name: string; unitPrice: string | null } }) => ({
      description: rx.drug.name,
      qty: Number(rx.quantity),
      unitPrice: Number(rx.drug.unitPrice ?? 0),
    }),
  )

  const previewTotal = previewLines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
  const cartTotal = cart.reduce((s, c) => s + c.qty * c.unitPrice, 0)
  const subtotal = previewTotal + cartTotal
  // Loyalty: 1 point = ฿1, capped at 20% of subtotal and the owner's balance.
  const maxRedeemable = Math.min(loyalty?.points ?? 0, Math.floor(subtotal * LOYALTY_REDEEM_RATIO))
  const redeemDiscount = Math.min(redeemPts, maxRedeemable)
  const manualDiscount = Number(discount || 0)
  const discountNum = Math.min(manualDiscount + redeemDiscount, subtotal)
  const taxable = subtotal - discountNum
  const { taxAmount: tax, total } = calcVat(vatMode, vatRate, taxable)
  const change = method === 'cash' ? Number(tendered || 0) - total : 0
  const hasLines = previewLines.length > 0 || cart.length > 0

  function reset() {
    setPet(null); setPetQuery(''); setRecordId(null); setCart([]); setDiscount(''); setRedeemPts(0)
    setMethod('cash'); setTendered(''); setErr(''); setPaid(null); setEarnedMsg(''); setPendingInvoiceId(null)
  }

  function addService() {
    setCart([...cart, { key: keySeq++, description: '', itemType: 'service', qty: 1, unitPrice: 0 }])
  }
  function addProduct(p: Product) {
    setCart([...cart, { key: keySeq++, description: p.name, itemType: 'retail', qty: 1, unitPrice: Number(p.unitPrice ?? 0), productId: p.id }])
    setAddingRetail(false)
  }
  function updateItem(key: number, patch: Partial<CartItem>) {
    setCart(cart.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }
  function removeItem(key: number) { setCart(cart.filter((c) => c.key !== key)) }

  async function finalize() {
    setErr('')
    if (!hasLines) { setErr('Add at least one line item.'); return }
    if (method === 'cash' && Number(tendered || 0) < total) { setErr('Cash tendered is less than total due.'); return }
    try {
      const invoice = await createInvoice.mutateAsync({
        medicalRecordId: recordId,
        petId: pet?.petId ?? null,
        items: cart.map((c) => ({ description: c.description || '(item)', itemType: c.itemType, qty: c.qty, unitPrice: c.unitPrice, productId: c.productId ?? null })),
        discount: discountNum,
      })
      if (method === 'qr_promptpay') {
        setPendingInvoiceId(invoice.id)
        return  // stop here — user scans QR, then clicks "Payment Received"
      }
      const settled = await recordPayment.mutateAsync({ id: invoice.id, paymentMethod: method })
      // Redeem loyalty points (best-effort — payment already succeeded).
      if (pet?.ownerId && redeemDiscount > 0) {
        try {
          await api.post('/api/loyalty/redeem', { ownerId: pet.ownerId, points: redeemDiscount, invoiceTotal: subtotal })
          qc.invalidateQueries({ queryKey: ['loyalty', pet.ownerId] })
        } catch { /* discount already applied to invoice; ignore redeem failure */ }
      }
      const earned = Math.floor(Number(settled.totalAmount) / 100)
      if (pet?.ownerId && earned > 0) setEarnedMsg(`+${earned} loyalty point${earned !== 1 ? 's' : ''} earned`)
      setPaid(settled)
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Could not finalize the sale.')
    }
  }

  async function handlePromptpayConfirm() {
    if (!pendingInvoiceId) return
    setErr('')
    try {
      const settled = await recordPayment.mutateAsync({ id: pendingInvoiceId, paymentMethod: method })
      // Redeem loyalty points (best-effort — payment already succeeded).
      if (pet?.ownerId && redeemDiscount > 0) {
        try {
          await api.post('/api/loyalty/redeem', { ownerId: pet.ownerId, points: redeemDiscount, invoiceTotal: subtotal })
          qc.invalidateQueries({ queryKey: ['loyalty', pet.ownerId] })
        } catch { /* best-effort */ }
      }
      const earned = Math.floor(Number(settled.totalAmount) / 100)
      if (pet?.ownerId && earned > 0) setEarnedMsg(`+${earned} loyalty point${earned !== 1 ? 's' : ''} earned`)
      setPendingInvoiceId(null)
      setPaid(settled)
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Could not record payment.')
    }
  }

  return (
    <div className="p-lg">
      <div className="flex gap-xs mb-lg border-b border-outline-variant">
        {(['invoice', 'history'] as const).map((tabKey) => (
          <button key={tabKey} onClick={() => setTab(tabKey)}
                  className={`min-h-[44px] px-lg text-body-md font-medium border-b-2 -mb-px transition-colors ${
                    tab === tabKey ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}>
            {tabKey === 'invoice' ? t('clinic.billing.createInvoiceTab') : t('clinic.billing.paymentHistory')}
          </button>
        ))}
      </div>
      {tab === 'history' && <PaymentHistoryTab />}
      {tab === 'invoice' && <>
      <div className="flex items-start justify-between mb-lg">
        <div>
          <h2 className="text-headline-lg font-headline font-bold text-primary">{t('clinic.billing.createInvoice')}</h2>
          <p className="text-body-md text-on-surface-variant mt-xs">Build an invoice from a visit or sell retail items</p>
        </div>
        {(pet || cart.length > 0) && (
          <button onClick={reset} className="flex items-center gap-sm border border-outline-variant rounded-lg px-lg min-h-[44px] text-on-surface-variant hover:bg-surface-container transition-colors text-body-sm">
            <MaterialIcon name="restart_alt" size={18} /> New sale
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-lg">
        {/* ── Left: invoice builder ─────────────────────────────── */}
        <div className="flex-1 space-y-md">
          {/* Patient / visit */}
          <div className="glass-card rounded-xl shadow-lvl1 p-md">
            <h3 className="text-headline-xs font-headline font-semibold text-on-surface mb-sm">Patient &amp; visit <span className="text-on-surface-variant font-normal">(optional for retail)</span></h3>
            {!pet ? (
              <div className="relative">
                <span className="absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"><MaterialIcon name="search" size={18} /></span>
                <input value={petQuery} onChange={(e) => setPetQuery(e.target.value)} placeholder={t('clinic.billing.searchPet')} className={`${inputCls} pl-[44px]`} />
                {searchResults && searchResults.length > 0 && (
                  <div className="mt-xs border border-outline-variant rounded-lg overflow-hidden bg-surface shadow-lvl2">
                    {searchResults.map((r) => (
                      <button key={r.petId} onClick={() => { setPet(r); setPetQuery('') }}
                              className="w-full text-left px-md min-h-[44px] hover:bg-surface-container-low flex items-center justify-between">
                        <span className="text-body-sm text-on-surface">{r.petName} <span className="text-on-surface-variant">· {r.ownerName}</span></span>
                        <span className="text-label-md text-on-surface-variant">{r.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between bg-surface-container-low rounded-lg px-md min-h-[48px]">
                <div className="flex items-center gap-sm">
                  <MaterialIcon name="pets" fill={1} size={18} className="text-secondary" />
                  <span className="text-body-sm font-medium text-on-surface">{pet.petName}</span>
                  <span className="text-body-sm text-on-surface-variant">· {pet.ownerName}</span>
                </div>
                <button onClick={() => { setPet(null); setRecordId(null) }} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-on-surface-variant hover:text-error"><MaterialIcon name="close" size={18} /></button>
              </div>
            )}

            {pet && records.length > 0 && (
              <div className="mt-sm">
                <label className="text-label-md text-on-surface-variant uppercase tracking-wider">Bill a visit (auto-adds dispensed medicines)</label>
                <select value={recordId ?? ''} onChange={(e) => setRecordId(e.target.value ? Number(e.target.value) : null)} className={`${inputCls} mt-xs`}>
                  <option value="">— None (retail only) —</option>
                  {records.map((r) => (
                    <option key={r.id} value={r.id}>{new Date(r.createdAt).toLocaleDateString()} · {r.assessment ? r.assessment.slice(0, 40) : 'Visit'}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Line items */}
          <div className="glass-card rounded-xl shadow-lvl1 overflow-hidden">
            <div className="bg-primary text-primary-on px-md py-sm flex items-center justify-between">
              <h3 className="text-headline-xs font-headline font-semibold">{t('clinic.billing.lineItems')}</h3>
              <div className="flex gap-xs">
                <button onClick={addService} className="flex items-center gap-xs text-label-md bg-primary-on/10 hover:bg-primary-on/20 rounded-lg px-sm min-h-[36px] transition-colors"><MaterialIcon name="add" size={16} /> {t('clinic.billing.addService')}</button>
                <button onClick={() => setAddingRetail(true)} className="flex items-center gap-xs text-label-md bg-primary-on/10 hover:bg-primary-on/20 rounded-lg px-sm min-h-[36px] transition-colors"><MaterialIcon name="add" size={16} /> {t('clinic.billing.addProduct')}</button>
              </div>
            </div>

            <div className="divide-y divide-outline-variant">
              {/* Auto-pulled medicine lines (read-only) */}
              {previewLines.map((l, i) => (
                <div key={`rx-${i}`} className="flex items-center gap-sm px-md py-sm min-h-[48px] bg-surface-container-low/40">
                  <MaterialIcon name="medication" size={18} className="text-secondary flex-shrink-0" />
                  <span className="flex-1 text-body-sm text-on-surface">{l.description}</span>
                  <span className="text-body-sm text-on-surface-variant font-code">{l.qty} × {baht(l.unitPrice)}</span>
                  <span className="w-24 text-right text-body-sm font-medium text-on-surface font-code">{baht(l.qty * l.unitPrice)}</span>
                </div>
              ))}

              {cart.length > 0 && (
                <div className="flex items-center gap-sm px-md py-xs text-label-md text-on-surface-variant uppercase tracking-wider">
                  <span className="w-[18px] flex-shrink-0" />
                  <span className="flex-1">{t('clinic.billing.description')}</span>
                  <span className="w-16 text-center">Qty</span>
                  <span className="w-24 text-right">{VAT_PRICE_LABEL_KEY[vatMode] ? t(VAT_PRICE_LABEL_KEY[vatMode]!) : t('clinic.billing.price')}</span>
                  <span className="w-24 text-right">Total</span>
                  <span className="w-[44px]" />
                </div>
              )}

              {/* Editable cart rows */}
              {cart.map((c) => (
                <div key={c.key} className="flex items-center gap-sm px-md py-sm min-h-[48px]">
                  <MaterialIcon name={c.itemType === 'retail' ? 'shopping_bag' : 'medical_services'} size={18} className="text-on-surface-variant flex-shrink-0" />
                  <input value={c.description} onChange={(e) => updateItem(c.key, { description: e.target.value })} placeholder={t('clinic.billing.description')}
                         className="flex-1 min-h-[40px] bg-surface-container-low border border-outline-variant rounded-lg px-sm text-body-sm focus:outline-none focus:border-primary" />
                  <input type="number" min="0" step="1" value={c.qty} onChange={(e) => updateItem(c.key, { qty: Number(e.target.value) })}
                         className="w-16 min-h-[40px] bg-surface-container-low border border-outline-variant rounded-lg px-sm text-body-sm text-center font-code focus:outline-none focus:border-primary" />
                  <input type="number" min="0" step="0.01" value={c.unitPrice} onChange={(e) => updateItem(c.key, { unitPrice: Number(e.target.value) })}
                         className="w-24 min-h-[40px] bg-surface-container-low border border-outline-variant rounded-lg px-sm text-body-sm text-right font-code focus:outline-none focus:border-primary" />
                  <span className="w-24 text-right text-body-sm font-medium font-code text-on-surface">{baht(c.qty * c.unitPrice)}</span>
                  <button onClick={() => removeItem(c.key)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-on-surface-variant hover:text-error"><MaterialIcon name="close" size={16} /></button>
                </div>
              ))}

              {!hasLines && (
                <div className="px-md py-xl text-center text-on-surface-variant text-body-sm">
                  <MaterialIcon name="receipt_long" size={32} className="text-outline mb-sm block mx-auto" />
                  {t('clinic.billing.emptyHint')}
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="bg-surface-container-low p-md space-y-xs">
              <Row label={t('clinic.billing.subtotal')} value={baht(subtotal)} />
              <div className="flex items-center justify-between">
                <span className="text-body-sm text-on-surface-variant">{t('clinic.billing.discount')}</span>
                <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)}
                       className="w-28 min-h-[40px] bg-surface border border-outline-variant rounded-lg px-sm text-body-sm text-right font-code focus:outline-none focus:border-primary" />
              </div>
              {vatMode !== 'none' && (
                <Row
                  label={`${t('clinic.billing.vatLabel')} (${vatRate}%)${vatMode === 'inclusive' ? ` ${t('clinic.billing.vatInclusiveSuffix')}` : ''}`}
                  value={baht(tax)}
                />
              )}
              <div className="flex items-center justify-between border-t border-outline-variant pt-sm mt-xs">
                <span className="text-headline-xs font-headline font-semibold text-on-surface">{t('clinic.billing.totalDue')}</span>
                <span className="text-headline-md font-headline font-bold text-primary font-code">{baht(total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: payment ─────────────────────────────── */}
        <div className="w-full lg:w-96 space-y-md">
          <div className="glass-card rounded-xl shadow-lvl1 p-md">
            <h3 className="text-headline-xs font-headline font-semibold text-on-surface mb-md">{t('clinic.billing.payment')}</h3>

            <div className="grid grid-cols-3 gap-xs mb-md">
              {([['cash', 'payments', 'Cash'], ['qr_promptpay', 'qr_code_2', 'PromptPay'], ['credit_card', 'credit_card', 'Card']] as const).map(([m, icon, label]) => (
                <button key={m} onClick={() => setMethod(m)}
                        className={`flex flex-col items-center gap-xs rounded-lg min-h-[64px] justify-center transition-colors border ${method === m ? 'border-primary bg-surface-container-low text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}`}>
                  <MaterialIcon name={icon} size={22} fill={method === m ? 1 : 0} />
                  <span className="text-label-md">{label}</span>
                </button>
              ))}
            </div>

            {method === 'cash' && (
              <div className="space-y-sm mb-md">
                <label className="text-label-md text-on-surface-variant uppercase tracking-wider">{t('clinic.billing.cashTendered')}</label>
                <input type="number" min="0" step="0.01" value={tendered} onChange={(e) => setTendered(e.target.value)} className={inputCls} placeholder="0.00" />
                <div className="flex items-center justify-between bg-surface-container-low rounded-lg px-md min-h-[44px]">
                  <span className="text-body-sm text-on-surface-variant">{t('clinic.billing.change')}</span>
                  <span className={`text-body-md font-bold font-code ${change < 0 ? 'text-error' : 'text-success'}`}>{baht(Math.max(0, change))}</span>
                </div>
              </div>
            )}

            {method === 'qr_promptpay' && (
              <div className="flex flex-col items-center gap-sm mb-md py-md bg-surface-container-low rounded-lg">
                <div className="w-40 h-40 rounded-lg bg-surface border border-outline-variant flex items-center justify-center overflow-hidden">
                  {pendingInvoiceId == null && (
                    <MaterialIcon name="qr_code_2" size={48} className="text-on-surface-variant opacity-40" />
                  )}
                  {pendingInvoiceId != null && qrLoading && (
                    <MaterialIcon name="progress_activity" size={48} className="text-on-surface-variant animate-spin" />
                  )}
                  {pendingInvoiceId != null && qrError && (
                    <MaterialIcon name="qr_code_2" size={48} className="text-on-surface-variant" />
                  )}
                  {pendingInvoiceId != null && qrDataUrl && !qrLoading && (
                    <img src={qrDataUrl} alt="PromptPay QR" className="w-full h-full object-contain" />
                  )}
                </div>
                {pendingInvoiceId == null && (
                  <p className="text-label-sm text-on-surface-variant text-center px-sm">Click Confirm to generate QR</p>
                )}
                {pendingInvoiceId != null && qrError && (
                  <p className="text-label-sm text-error text-center px-sm">QR unavailable — check PromptPay ID in Settings</p>
                )}
                <p className="text-label-md text-on-surface-variant uppercase tracking-wider">Scan to pay · {baht(total)}</p>
              </div>
            )}
            {method === 'qr_promptpay' && pendingInvoiceId != null && (
              <button onClick={handlePromptpayConfirm} disabled={recordPayment.isPending}
                      className="w-full min-h-[56px] rounded-lg bg-secondary text-secondary-on font-semibold text-body-md hover:bg-secondary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-sm mb-md">
                <MaterialIcon name="check_circle" size={20} />
                {recordPayment.isPending ? 'Processing…' : 'Payment Received'}
              </button>
            )}

            {method === 'credit_card' && (
              <div className="flex items-center gap-sm mb-md py-md px-md bg-surface-container-low rounded-lg">
                <MaterialIcon name="credit_card" size={22} className="text-on-surface-variant" />
                <p className="text-body-sm text-on-surface-variant">Insert / tap card on the terminal, then confirm.</p>
              </div>
            )}

            {/* Loyalty */}
            {loyalty && (
              <div className="mb-md rounded-lg border border-outline-variant bg-surface-container-low p-md space-y-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-xs text-body-sm text-on-surface">
                    <MaterialIcon name="loyalty" size={18} className="text-secondary" />
                    Loyalty
                    <span className="px-sm py-px rounded-full bg-secondary-container text-secondary-on-container text-label-md capitalize">{loyalty.membershipTier}</span>
                  </span>
                  <span className="text-body-sm font-medium text-on-surface font-code">{loyalty.points} pts</span>
                </div>
                {maxRedeemable > 0 ? (
                  <div className="flex items-center gap-sm">
                    <input type="number" min="0" max={maxRedeemable} value={redeemPts || ''} placeholder="0"
                           onChange={(e) => setRedeemPts(Math.max(0, Math.min(maxRedeemable, Math.floor(Number(e.target.value) || 0))))}
                           className="w-24 min-h-[40px] bg-surface border border-outline-variant rounded-lg px-sm text-body-sm text-right font-code focus:outline-none focus:border-primary" />
                    <button onClick={() => setRedeemPts(maxRedeemable)}
                            className="min-h-[40px] px-sm rounded-lg border border-outline-variant text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors">Max</button>
                    <span className="text-label-md text-on-surface-variant">redeem (max {maxRedeemable}, −{baht(redeemDiscount)})</span>
                  </div>
                ) : (
                  <p className="text-label-md text-on-surface-variant">Add line items to redeem points (up to 20% of the bill).</p>
                )}
              </div>
            )}

            {err && <p className="text-body-sm text-error mb-sm">{err}</p>}

            <button onClick={finalize} disabled={!hasLines || createInvoice.isPending || recordPayment.isPending}
                    className="w-full min-h-[56px] rounded-lg bg-secondary text-secondary-on font-semibold text-body-md hover:bg-secondary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-sm">
              <MaterialIcon name="check_circle" size={20} />
              {createInvoice.isPending || recordPayment.isPending ? 'Processing…' : `Confirm Payment · ${baht(total)}`}
            </button>
          </div>
        </div>
      </div>

      </>}
      {addingRetail && <RetailPicker onPick={addProduct} onClose={() => setAddingRetail(false)} />}
      {paid && <SuccessModal invoice={paid} pet={pet} method={method} earnedMsg={earnedMsg} onClose={reset} />}
    </div>
  )
}

interface PayHistoryRow {
  id: number; paidAt: string; amount: string; method: string; note: string | null
  invoice: { id: number; invoiceNo: string }
  receivedBy: { id: number; name: string }
  branch: { id: number; name: string }
}
interface PayHistoryResult {
  rows: PayHistoryRow[]; total: number; page: number; limit: number
  receivedByOptions: Array<{ id: number; name: string }>
}

const METHOD_LABELS: Record<string, string> = { cash: 'Cash', qr_promptpay: 'PromptPay', credit_card: 'Card', transfer: 'Transfer', other: 'Other' }

export function PaymentHistoryTab() {
  const t = useT()
  const { branchId } = useAuthStore()
  const isAdmin = branchId === null
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterBranchId, setFilterBranchId] = useState('')
  const [page, setPage] = useState(1)
  const [selectedRow, setSelectedRow] = useState<PayHistoryRow | null>(null)
  const [method, setMethod] = useState('')
  const [receivedById, setReceivedById] = useState('')

  const { data: selectedInvoice, isLoading: invoiceLoading, isError: invoiceError } = useQuery<Invoice>({
    queryKey: ['invoice', selectedRow?.invoice.id],
    enabled: selectedRow != null,
    queryFn: () => api.get(`/api/invoices/${selectedRow!.invoice.id}`).then((r) => r.data.data),
  })

  const { data, isLoading } = useQuery<PayHistoryResult>({
    queryKey: ['billing', 'payment-history', startDate, endDate, filterBranchId, method, receivedById, page],
    queryFn: () =>
      api.get('/api/invoices/payment-history', {
        params: {
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
          ...(filterBranchId ? { branchId: filterBranchId } : {}),
          ...(method ? { method } : {}),
          ...(receivedById ? { receivedById } : {}),
          page,
        },
      }).then((r) => r.data.data),
  })

  const rows = data?.rows ?? []
  const totalPages = data ? Math.ceil(data.total / data.limit) : 1
  const colCount = isAdmin ? 7 : 6
  const dateCls = 'min-h-[44px] bg-surface-container-low border border-outline-variant rounded-lg px-md text-body-md text-on-surface focus:outline-none focus:border-primary'

  return (
    <div>
      <div className="glass-card rounded-xl shadow-lvl1 p-md mb-md flex flex-wrap gap-sm items-end">
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant uppercase tracking-wider">{t('clinic.billing.dateFrom')}</label>
          <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1) }} className={dateCls} />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant uppercase tracking-wider">{t('clinic.billing.dateTo')}</label>
          <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1) }} className={dateCls} />
        </div>
        {isAdmin && (
          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant uppercase tracking-wider">{t('clinic.billing.filterBranch')}</label>
            <input value={filterBranchId} onChange={(e) => { setFilterBranchId(e.target.value); setPage(1) }}
                   placeholder="Branch ID" className={`${dateCls} w-32`} />
          </div>
        )}
        <div className="flex flex-col gap-xs">
          <label htmlFor="ph-method" className="text-label-md text-on-surface-variant uppercase tracking-wider">{t('clinic.billing.method')}</label>
          <select id="ph-method" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1) }} className={`${dateCls} w-36`}>
            <option value="">{t('clinic.billing.allMethods')}</option>
            {Object.entries(METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor="ph-received-by" className="text-label-md text-on-surface-variant uppercase tracking-wider">{t('clinic.billing.receivedBy')}</label>
          <select id="ph-received-by" value={receivedById} onChange={(e) => { setReceivedById(e.target.value); setPage(1) }} className={`${dateCls} w-36`}>
            <option value="">{t('clinic.billing.allReceivers')}</option>
            {(data?.receivedByOptions ?? []).map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        {(startDate || endDate || filterBranchId || method || receivedById) && (
          <button onClick={() => { setStartDate(''); setEndDate(''); setFilterBranchId(''); setMethod(''); setReceivedById(''); setPage(1) }}
                  className="min-h-[44px] px-md rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-low text-body-sm flex items-center gap-xs">
            <MaterialIcon name="close" size={16} /> Clear
          </button>
        )}
      </div>

      <div className="glass-card rounded-xl shadow-lvl1 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                {['Date', 'Invoice #', 'Amount', t('clinic.billing.method'), t('clinic.billing.receivedBy')].map((h, i) => (
                  <th key={i} className={`px-md py-sm text-label-md text-on-surface-variant uppercase tracking-wider ${i === 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
                {isAdmin && <th className="text-left px-md py-sm text-label-md text-on-surface-variant uppercase tracking-wider">{t('clinic.billing.branch')}</th>}
                <th className="text-left px-md py-sm text-label-md text-on-surface-variant uppercase tracking-wider">{t('clinic.billing.note')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {isLoading && (
                <tr><td colSpan={colCount} className="px-md py-xl text-center text-on-surface-variant">
                  <MaterialIcon name="progress_activity" size={24} className="animate-spin mx-auto block" />
                </td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={colCount} className="px-md py-xl text-center text-on-surface-variant">{t('clinic.billing.noHistory')}</td></tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open receipt ${row.invoice.invoiceNo}`}
                  onClick={() => setSelectedRow(row)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedRow(row) } }}
                  className="cursor-pointer hover:bg-surface-container-low/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <td className="px-md py-sm text-on-surface font-code">{new Date(row.paidAt).toLocaleDateString()}</td>
                  <td className="px-md py-sm text-on-surface font-medium">{row.invoice.invoiceNo}</td>
                  <td className="px-md py-sm text-on-surface text-right font-code">{baht(Number(row.amount))}</td>
                  <td className="px-md py-sm text-on-surface-variant">{METHOD_LABELS[row.method] ?? row.method}</td>
                  <td className="px-md py-sm text-on-surface-variant">{row.receivedBy.name}</td>
                  {isAdmin && <td className="px-md py-sm text-on-surface-variant">{row.branch.name}</td>}
                  <td className="px-md py-sm text-on-surface-variant">{row.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-md py-sm border-t border-outline-variant">
            <span className="text-body-sm text-on-surface-variant">Page {page} of {totalPages} · {data?.total} records</span>
            <div className="flex gap-xs">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 transition-colors">
                <MaterialIcon name="chevron_left" size={18} />
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 transition-colors">
                <MaterialIcon name="chevron_right" size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
      {selectedRow && invoiceLoading && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <MaterialIcon name="progress_activity" size={32} className="text-on-surface-variant animate-spin" />
        </div>
      )}
      {selectedRow && invoiceError && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-md" onClick={() => setSelectedRow(null)}>
          <div className="bg-surface rounded-xl shadow-lvl3 p-lg text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-body-md text-error mb-md">{t('clinic.billing.receiptLoadError')}</p>
            <button onClick={() => setSelectedRow(null)} className="min-h-[44px] px-lg rounded-lg bg-primary text-primary-on font-semibold">{t('common.done')}</button>
          </div>
        </div>
      )}
      {selectedRow && !invoiceLoading && !invoiceError && selectedInvoice && (
        <ReceiptModal
          invoice={selectedInvoice}
          petLabel={selectedInvoice.pet ? `${selectedInvoice.pet.name}${selectedInvoice.pet.owner ? ' · Owner: ' + selectedInvoice.pet.owner.firstName + ' ' + selectedInvoice.pet.owner.lastName : ''}` : undefined}
          method={selectedRow.method}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  )
}

function RetailPicker({ onPick, onClose }: { onPick: (p: Product) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const { data } = useProducts({ search })
  const products = data?.products ?? []
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-md" onClick={onClose}>
      <div className="bg-surface rounded-xl shadow-lvl3 w-full max-w-md p-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-md">
          <h3 className="text-headline-sm font-headline font-bold text-primary">Add retail product</h3>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low rounded-lg"><MaterialIcon name="close" size={18} /></button>
        </div>
        <div className="relative mb-sm">
          <span className="absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"><MaterialIcon name="search" size={18} /></span>
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className={`${inputCls} pl-[44px]`} />
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-outline-variant border border-outline-variant rounded-lg">
          {products.length === 0 && <p className="px-md py-lg text-center text-body-sm text-on-surface-variant">No products found.</p>}
          {products.map((p) => (
            <button key={p.id} onClick={() => onPick(p)} className="w-full text-left px-md min-h-[48px] hover:bg-surface-container-low flex items-center justify-between">
              <span className="text-body-sm text-on-surface">{p.name} <span className="text-on-surface-variant">· {Number(p.stockQuantity)} {p.unit ?? ''} in stock</span></span>
              <span className="text-body-sm font-code text-on-surface">{baht(Number(p.unitPrice ?? 0))}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-body-sm text-on-surface-variant">{label}</span>
      <span className="text-body-sm text-on-surface font-code">{value}</span>
    </div>
  )
}

async function downloadInvoicePdf(invoice: Invoice) {
  const res = await api.get(`/api/invoices/${invoice.id}/pdf`, { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${invoice.invoiceNo}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

function printReceipt(invoice: Invoice, petLabel: string | undefined, method: string) {
  const items = (invoice.items ?? [])
    .map((i) => `<tr><td>${i.description}</td><td style="text-align:center">${Number(i.quantity)}</td><td style="text-align:right">${baht(Number(i.unitPrice))}</td><td style="text-align:right">${baht(Number(i.totalPrice))}</td></tr>`)
    .join('')
  const html = `<!doctype html><html><head><title>${invoice.invoiceNo}</title>
    <style>body{font-family:system-ui,sans-serif;padding:24px;color:#191c1e}h1{font-size:18px;margin:0}
    .muted{color:#45464d;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
    th,td{padding:6px 4px;border-bottom:1px solid #e2e8f0}th{text-align:left;text-transform:uppercase;font-size:11px;color:#45464d}
    .tot{display:flex;justify-content:space-between;font-size:13px;margin-top:6px}.grand{font-weight:700;font-size:16px;border-top:2px solid #191c1e;padding-top:6px;margin-top:8px}</style></head>
    <body><h1>Anemal</h1><p class="muted">Tax invoice / receipt</p>
    <p class="muted">Invoice: <b>${invoice.invoiceNo}</b> · ${new Date(invoice.issuedAt).toLocaleString()}</p>
    ${petLabel ? `<p class="muted">Patient: ${petLabel}</p>` : ''}
    <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Total</th></tr></thead><tbody>${items}</tbody></table>
    <div style="margin-top:16px"><div class="tot"><span>Subtotal</span><span>${baht(Number(invoice.subtotal))}</span></div>
    <div class="tot"><span>Discount</span><span>-${baht(Number(invoice.discount))}</span></div>
    ${Number(invoice.taxAmount) > 0 ? `<div class="tot"><span>Tax (${Number(invoice.taxRate)}%)</span><span>${baht(Number(invoice.taxAmount))}</span></div>` : ''}
    <div class="tot grand"><span>Total</span><span>${baht(Number(invoice.totalAmount))}</span></div>
    <p class="muted" style="margin-top:8px">Paid by ${method.replace('_', ' ')} · Thank you!</p></div>
    <script>window.onload=function(){window.print()}</script></body></html>`
  const w = window.open('', '_blank', 'width=420,height=640')
  if (w) { w.document.write(html); w.document.close() }
}

// Itemized lines + subtotal/discount/tax/total. No chrome (no overlay, no
// header, no buttons) — reused by both ReceiptModal (history path, bare) and
// SuccessModal (post-sale path, adds its own banner above this).
function ReceiptBody({ invoice, method }: { invoice: Invoice; method: string }) {
  return (
    <div className="text-left mb-md">
      <div className="max-h-48 overflow-y-auto divide-y divide-outline-variant border border-outline-variant rounded-lg mb-md">
        {(invoice.items ?? []).length === 0 && (
          <p className="px-sm py-sm text-body-sm text-on-surface-variant">No line items.</p>
        )}
        {(invoice.items ?? []).map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-sm px-sm py-xs text-body-sm">
            <span className="flex-1 text-on-surface">{i.description}</span>
            <span className="text-on-surface-variant font-code w-16 text-right">× {Number(i.quantity)}</span>
            <span className="text-on-surface font-code w-20 text-right">{baht(Number(i.totalPrice))}</span>
          </div>
        ))}
      </div>
      <div className="space-y-xs">
        <Row label="Subtotal" value={baht(Number(invoice.subtotal))} />
        {Number(invoice.discount) > 0 && <Row label="Discount" value={`-${baht(Number(invoice.discount))}`} />}
        {Number(invoice.taxAmount) > 0 && <Row label={`Tax (${Number(invoice.taxRate)}%)`} value={baht(Number(invoice.taxAmount))} />}
        <div className="flex items-center justify-between border-t border-outline-variant pt-xs mt-xs">
          <span className="text-body-md font-semibold text-on-surface">Total</span>
          <span className="text-body-md font-bold text-primary font-code">{baht(Number(invoice.totalAmount))}</span>
        </div>
        <p className="text-label-md text-on-surface-variant">Paid by {method.replace('_', ' ')}</p>
      </div>
    </div>
  )
}

function ReceiptActions({ invoice, petLabel, method, onClose }: { invoice: Invoice; petLabel?: string; method: string; onClose: () => void }) {
  const t = useT()
  return (
    <div className="flex gap-sm">
      <button onClick={() => printReceipt(invoice, petLabel, method)} className="flex-1 min-h-[44px] rounded-lg border border-outline-variant text-on-surface-variant font-medium hover:bg-surface-container-low transition-colors flex items-center justify-center gap-xs text-body-sm">
        <MaterialIcon name="print" size={16} /> {t('clinic.billing.print')}
      </button>
      <button onClick={() => downloadInvoicePdf(invoice)} className="flex-1 min-h-[44px] rounded-lg border border-secondary text-secondary font-medium hover:bg-surface-container-low transition-colors flex items-center justify-center gap-xs text-body-sm">
        <MaterialIcon name="download" size={16} /> PDF
      </button>
      <button onClick={onClose} className="flex-1 min-h-[44px] rounded-lg bg-primary text-primary-on font-semibold hover:bg-primary/90 transition-colors text-body-sm">{t('common.done')}</button>
    </div>
  )
}

// Bare receipt view — invoice number, itemized lines, totals, method,
// Print/PDF/Done. No success banner, no "earned" messaging: used when a
// Payment History row is clicked (T-3b.3), never after a live sale (grill F2).
export function ReceiptModal({ invoice, petLabel, method, onClose }: { invoice: Invoice; petLabel?: string; method: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-md" onClick={onClose}>
      <div className="bg-surface rounded-xl shadow-lvl3 w-full max-w-sm p-xl" data-testid="receipt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-md">
          <p className="text-body-sm text-on-surface-variant">{invoice.invoiceNo}</p>
          {petLabel && <p className="text-body-sm text-on-surface font-medium mt-xs">{petLabel}</p>}
        </div>
        <ReceiptBody invoice={invoice} method={method} />
        <ReceiptActions invoice={invoice} petLabel={petLabel} method={method} onClose={onClose} />
      </div>
    </div>
  )
}

// Post-sale confirmation — adds the success banner + optional loyalty-earned
// message above the same ReceiptBody/ReceiptActions ReceiptModal uses.
export function SuccessModal({ invoice, pet, method, earnedMsg, onClose }: { invoice: Invoice; pet: { petName: string; ownerName: string } | null; method: string; earnedMsg?: string; onClose: () => void }) {
  const petLabel = pet ? `${pet.petName} · Owner: ${pet.ownerName}` : undefined
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-md">
      <div className="bg-surface rounded-xl shadow-lvl3 w-full max-w-sm p-xl" data-testid="success-modal">
        <div className="text-center mb-md">
          <div className="w-16 h-16 rounded-full bg-secondary-container flex items-center justify-center mx-auto mb-md">
            <MaterialIcon name="check_circle" fill={1} size={40} className="text-secondary" />
          </div>
          <h3 className="text-headline-md font-headline font-bold text-on-surface mb-xs">Payment Successful!</h3>
          <p className="text-body-sm text-on-surface-variant">{invoice.invoiceNo}</p>
          {earnedMsg && (
            <p className="inline-flex items-center gap-xs text-body-sm text-secondary font-medium mt-xs">
              <MaterialIcon name="loyalty" size={16} /> {earnedMsg}
            </p>
          )}
        </div>
        <ReceiptBody invoice={invoice} method={method} />
        <ReceiptActions invoice={invoice} petLabel={petLabel} method={method} onClose={onClose} />
      </div>
    </div>
  )
}
