import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'
import { useProducts, type Product } from '../../hooks/useInventory'
import { useCreateInvoice, useRecordPayment, type Invoice } from '../../hooks/useInvoices'

const baht = (n: number) => '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const TAX_RATE = 7
const LOYALTY_REDEEM_RATIO = 0.2 // points can cover at most 20% of an invoice

interface Loyalty { ownerId: number; points: number; membershipTier: string }

const inputCls =
  'min-h-[44px] w-full bg-surface-container-low border border-outline-variant rounded-lg px-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

interface PetResult { petId: number; petName: string; ownerId: number; ownerName: string; phone: string }
interface PreviewLine { description: string; qty: number; unitPrice: number }
interface CartItem { key: number; description: string; itemType: string; qty: number; unitPrice: number; productId?: number }

let keySeq = 1

export default function ClinicBilling() {
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

  const qc = useQueryClient()
  const createInvoice = useCreateInvoice()
  const recordPayment = useRecordPayment()

  // Loyalty balance for the selected pet's owner.
  const { data: loyalty } = useQuery<Loyalty>({
    queryKey: ['loyalty', pet?.ownerId],
    enabled: !!pet?.ownerId,
    queryFn: () => api.get(`/api/loyalty/owners/${pet!.ownerId}`).then((r) => r.data.data),
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
  const tax = ((subtotal - discountNum) * TAX_RATE) / 100
  const total = subtotal - discountNum + tax
  const change = method === 'cash' ? Number(tendered || 0) - total : 0
  const hasLines = previewLines.length > 0 || cart.length > 0

  function reset() {
    setPet(null); setPetQuery(''); setRecordId(null); setCart([]); setDiscount(''); setRedeemPts(0)
    setMethod('cash'); setTendered(''); setErr(''); setPaid(null); setEarnedMsg('')
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
        taxRate: TAX_RATE,
      })
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

  return (
    <div className="p-lg">
      <div className="flex items-start justify-between mb-lg">
        <div>
          <h2 className="text-headline-lg font-headline font-bold text-primary">Billing &amp; POS</h2>
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
                <input value={petQuery} onChange={(e) => setPetQuery(e.target.value)} placeholder="Search pet by name or microchip…" className={`${inputCls} pl-[44px]`} />
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
              <h3 className="text-headline-xs font-headline font-semibold">Line items</h3>
              <div className="flex gap-xs">
                <button onClick={addService} className="flex items-center gap-xs text-label-md bg-primary-on/10 hover:bg-primary-on/20 rounded-lg px-sm min-h-[36px] transition-colors"><MaterialIcon name="add" size={16} /> Service</button>
                <button onClick={() => setAddingRetail(true)} className="flex items-center gap-xs text-label-md bg-primary-on/10 hover:bg-primary-on/20 rounded-lg px-sm min-h-[36px] transition-colors"><MaterialIcon name="add" size={16} /> Product</button>
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

              {/* Editable cart rows */}
              {cart.map((c) => (
                <div key={c.key} className="flex items-center gap-sm px-md py-sm min-h-[48px]">
                  <MaterialIcon name={c.itemType === 'retail' ? 'shopping_bag' : 'medical_services'} size={18} className="text-on-surface-variant flex-shrink-0" />
                  <input value={c.description} onChange={(e) => updateItem(c.key, { description: e.target.value })} placeholder="Description"
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
                  Pick a visit or add line items to start an invoice.
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="bg-surface-container-low p-md space-y-xs">
              <Row label="Subtotal" value={baht(subtotal)} />
              <div className="flex items-center justify-between">
                <span className="text-body-sm text-on-surface-variant">Discount (฿)</span>
                <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)}
                       className="w-28 min-h-[40px] bg-surface border border-outline-variant rounded-lg px-sm text-body-sm text-right font-code focus:outline-none focus:border-primary" />
              </div>
              <Row label={`Tax (${TAX_RATE}%)`} value={baht(tax)} />
              <div className="flex items-center justify-between border-t border-outline-variant pt-sm mt-xs">
                <span className="text-headline-xs font-headline font-semibold text-on-surface">Total due</span>
                <span className="text-headline-md font-headline font-bold text-primary font-code">{baht(total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: payment ─────────────────────────────── */}
        <div className="w-full lg:w-96 space-y-md">
          <div className="glass-card rounded-xl shadow-lvl1 p-md">
            <h3 className="text-headline-xs font-headline font-semibold text-on-surface mb-md">Payment</h3>

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
                <label className="text-label-md text-on-surface-variant uppercase tracking-wider">Cash tendered</label>
                <input type="number" min="0" step="0.01" value={tendered} onChange={(e) => setTendered(e.target.value)} className={inputCls} placeholder="0.00" />
                <div className="flex items-center justify-between bg-surface-container-low rounded-lg px-md min-h-[44px]">
                  <span className="text-body-sm text-on-surface-variant">Change</span>
                  <span className={`text-body-md font-bold font-code ${change < 0 ? 'text-error' : 'text-success'}`}>{baht(Math.max(0, change))}</span>
                </div>
              </div>
            )}

            {method === 'qr_promptpay' && (
              <div className="flex flex-col items-center gap-sm mb-md py-md bg-surface-container-low rounded-lg">
                <div className="w-40 h-40 rounded-lg bg-surface border border-outline-variant flex items-center justify-center">
                  <MaterialIcon name="qr_code_2" size={120} className="text-primary" />
                </div>
                <p className="text-label-md text-on-surface-variant uppercase tracking-wider">Scan to pay · {baht(total)}</p>
                <p className="text-label-md text-on-surface-variant">PromptPay QR (gateway integration: Phase 4)</p>
              </div>
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

      {addingRetail && <RetailPicker onPick={addProduct} onClose={() => setAddingRetail(false)} />}
      {paid && <SuccessModal invoice={paid} pet={pet} method={method} earnedMsg={earnedMsg} onClose={reset} />}
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

function SuccessModal({ invoice, pet, method, earnedMsg, onClose }: { invoice: Invoice; pet: { petName: string; ownerName: string } | null; method: string; earnedMsg?: string; onClose: () => void }) {
  function print() {
    const items = (invoice.items ?? [])
      .map((i) => `<tr><td>${i.description}</td><td style="text-align:center">${Number(i.quantity)}</td><td style="text-align:right">${baht(Number(i.unitPrice))}</td><td style="text-align:right">${baht(Number(i.totalPrice))}</td></tr>`)
      .join('')
    const html = `<!doctype html><html><head><title>${invoice.invoiceNo}</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px;color:#191c1e}h1{font-size:18px;margin:0}
      .muted{color:#45464d;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
      th,td{padding:6px 4px;border-bottom:1px solid #e2e8f0}th{text-align:left;text-transform:uppercase;font-size:11px;color:#45464d}
      .tot{display:flex;justify-content:space-between;font-size:13px;margin-top:6px}.grand{font-weight:700;font-size:16px;border-top:2px solid #191c1e;padding-top:6px;margin-top:8px}</style></head>
      <body><h1>VetClinic Pro</h1><p class="muted">Tax invoice / receipt</p>
      <p class="muted">Invoice: <b>${invoice.invoiceNo}</b> · ${new Date(invoice.issuedAt).toLocaleString()}</p>
      ${pet ? `<p class="muted">Patient: ${pet.petName} · Owner: ${pet.ownerName}</p>` : ''}
      <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Total</th></tr></thead><tbody>${items}</tbody></table>
      <div style="margin-top:16px"><div class="tot"><span>Subtotal</span><span>${baht(Number(invoice.subtotal))}</span></div>
      <div class="tot"><span>Discount</span><span>-${baht(Number(invoice.discount))}</span></div>
      <div class="tot"><span>Tax (${Number(invoice.taxRate)}%)</span><span>${baht(Number(invoice.taxAmount))}</span></div>
      <div class="tot grand"><span>Total</span><span>${baht(Number(invoice.totalAmount))}</span></div>
      <p class="muted" style="margin-top:8px">Paid by ${method.replace('_', ' ')} · Thank you!</p></div>
      <script>window.onload=function(){window.print()}</script></body></html>`
    const w = window.open('', '_blank', 'width=420,height=640')
    if (w) { w.document.write(html); w.document.close() }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-md">
      <div className="bg-surface rounded-xl shadow-lvl3 w-full max-w-sm p-xl text-center">
        <div className="w-16 h-16 rounded-full bg-secondary-container flex items-center justify-center mx-auto mb-md">
          <MaterialIcon name="check_circle" fill={1} size={40} className="text-secondary" />
        </div>
        <h3 className="text-headline-md font-headline font-bold text-on-surface mb-xs">Payment Successful!</h3>
        <p className="text-body-sm text-on-surface-variant mb-xs">{invoice.invoiceNo}</p>
        <p className="text-headline-md font-headline font-bold text-primary font-code mb-sm">{baht(Number(invoice.totalAmount))}</p>
        {earnedMsg && (
          <p className="inline-flex items-center gap-xs text-body-sm text-secondary font-medium mb-lg">
            <MaterialIcon name="loyalty" size={16} /> {earnedMsg}
          </p>
        )}
        <div className="flex gap-sm">
          <button onClick={print} className="flex-1 min-h-[44px] rounded-lg border border-primary text-primary font-medium hover:bg-surface-container-low transition-colors flex items-center justify-center gap-sm">
            <MaterialIcon name="print" size={18} /> Print Receipt
          </button>
          <button onClick={onClose} className="flex-1 min-h-[44px] rounded-lg bg-primary text-primary-on font-semibold hover:bg-primary/90 transition-colors">Done</button>
        </div>
      </div>
    </div>
  )
}
