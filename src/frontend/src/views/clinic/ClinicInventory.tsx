import { useState, useCallback } from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import BarcodeScanner from '../../components/BarcodeScanner'
import {
  useProducts, useInventoryAlerts, useCreateProduct, useUpdateProduct, useStockIn, useDeactivateProduct,
  PRODUCT_CATEGORIES, type Product,
} from '../../hooks/useInventory'

const baht = (n: number) =>
  '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type StockState = { label: string; cls: string }
function stockState(p: Product): StockState {
  const qty = Number(p.stockQuantity)
  const min = Number(p.minStockLevel)
  if (qty <= 0) return { label: 'Out of Stock', cls: 'bg-error-container text-error' }
  if (min > 0 && qty <= min) return { label: 'Low Stock', cls: 'bg-warning/15 text-warning' }
  return { label: 'In Stock', cls: 'bg-secondary-container text-secondary-on-container' }
}

const inputCls =
  'min-h-[44px] w-full bg-surface-container-low border border-outline-variant rounded-lg px-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'
const labelCls = 'text-label-md text-on-surface-variant uppercase tracking-wider mb-sm block'

export default function ClinicInventory() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [stockingIn, setStockingIn] = useState<Product | null>(null)
  const [scanning, setScanning] = useState(false)

  const handleBarcodeScan = useCallback((barcode: string) => {
    setSearch(barcode.trim().slice(0, 100))
    setScanning(false)
  }, [])

  const { data, isLoading } = useProducts({ search, category })
  const { data: alerts } = useInventoryAlerts()
  const deactivate = useDeactivateProduct()

  const products = data?.products ?? []

  return (
    <div className="p-lg">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-md mb-lg">
        <div>
          <h2 className="text-headline-lg font-headline font-bold text-primary">Medical Inventory</h2>
          <p className="text-body-md text-on-surface-variant mt-xs">Drugs, vaccines &amp; supplies · stock card ledger</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-sm bg-primary text-primary-on rounded-lg px-lg min-h-[44px] font-semibold text-body-sm hover:bg-primary/90 transition-colors"
        >
          <MaterialIcon name="add_circle" size={18} /> Add Product
        </button>
      </div>

      {/* KPI alert cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-md mb-lg">
        <KpiCard icon="warning" tone="error" value={alerts?.lowStockCount ?? 0} label="Critical / Low stock" />
        <KpiCard icon="schedule" tone="warning" value={alerts?.expiringSoonCount ?? 0}
                 label={`Expiring ≤ ${alerts?.expiryWindowDays ?? 30} days`} />
        <KpiCard icon="payments" tone="success" value={baht(alerts?.inventoryValue ?? 0)} label="Active stock value" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-sm mb-md">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
            <MaterialIcon name="search" size={18} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or barcode…"
            className={`${inputCls} pl-[44px] rounded-full`}
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)}
                className={`${inputCls} w-auto min-w-[160px]`}>
          <option value="">All categories</option>
          {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          onClick={() => setScanning(true)}
          className="flex items-center gap-sm bg-surface border border-outline-variant rounded-full px-lg min-h-[44px] text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
          aria-label="Open barcode scanner"
        >
          <MaterialIcon name="qr_code_scanner" size={18} />
          Scan
        </button>
      </div>

      {/* Products table */}
      <div className="glass-card rounded-xl shadow-lvl1 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead className="bg-surface-container-low">
              <tr>
                {['Product', 'Category', 'Stock', 'Min', 'Expiry', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-md py-sm text-label-md text-on-surface-variant uppercase tracking-wider font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {isLoading && (
                <tr><td colSpan={7} className="px-md py-xl text-center text-on-surface-variant">Loading…</td></tr>
              )}
              {!isLoading && products.length === 0 && (
                <tr><td colSpan={7} className="px-md py-xl text-center text-on-surface-variant">
                  <MaterialIcon name="inventory_2" size={32} className="text-outline mb-sm block mx-auto" />
                  No products yet — add your first item.
                </td></tr>
              )}
              {products.map((p) => {
                const st = stockState(p)
                return (
                  <tr key={p.id} className="hover:bg-surface-container transition-colors min-h-[48px]">
                    <td className="px-md py-sm font-medium text-on-surface">{p.name}</td>
                    <td className="px-md py-sm text-on-surface-variant">{p.category ?? '—'}</td>
                    <td className="px-md py-sm font-code text-on-surface">{Number(p.stockQuantity)} {p.unit ?? ''}</td>
                    <td className="px-md py-sm text-on-surface-variant font-code">{Number(p.minStockLevel)}</td>
                    <td className="px-md py-sm text-on-surface-variant">{p.expiryDate ? p.expiryDate.slice(0, 10) : '—'}</td>
                    <td className="px-md py-sm">
                      <span className={`rounded-full text-label-md uppercase tracking-[0.5px] px-sm py-xs ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-md py-sm">
                      <div className="flex items-center justify-end gap-xs">
                        <IconBtn icon="add_box" title="Stock in" onClick={() => setStockingIn(p)} />
                        <IconBtn icon="edit" title="Edit" onClick={() => setEditing(p)} />
                        <IconBtn icon="delete" title="Deactivate"
                                 onClick={() => { if (confirm(`Deactivate ${p.name}?`)) deactivate.mutate(p.id) }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(adding || editing) && (
        <ProductModal product={editing} onClose={() => { setAdding(false); setEditing(null) }} />
      )}
      {stockingIn && <StockInModal product={stockingIn} onClose={() => setStockingIn(null)} />}
      {scanning && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  )
}

function KpiCard({ icon, tone, value, label }: { icon: string; tone: 'error' | 'warning' | 'success'; value: number | string; label: string }) {
  const toneCls = tone === 'error' ? 'text-error' : tone === 'warning' ? 'text-warning' : 'text-success'
  const borderCls = tone === 'error' ? 'border-error' : tone === 'warning' ? 'border-warning' : 'border-secondary'
  return (
    <div className={`glass-card rounded-xl shadow-lvl1 border-l-4 p-md ${borderCls}`}>
      <div className="flex items-center justify-between mb-sm">
        <p className="text-body-sm text-on-surface-variant">{label}</p>
        <MaterialIcon name={icon} size={20} className={toneCls} />
      </div>
      <p className="text-headline-md font-headline font-bold text-primary">{value}</p>
    </div>
  )
}

function IconBtn({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors">
      <MaterialIcon name={icon} size={18} />
    </button>
  )
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-md" onClick={onClose}>
      <div className="bg-surface rounded-xl shadow-lvl3 w-full max-w-md p-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-lg">
          <h3 className="text-headline-sm font-headline font-bold text-primary">{title}</h3>
          <IconBtn icon="close" title="Close" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  )
}

function ProductModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const isEdit = !!product
  const create = useCreateProduct()
  const update = useUpdateProduct()
  const [form, setForm] = useState({
    name:          product?.name ?? '',
    category:      product?.category ?? 'Medicine',
    unit:          product?.unit ?? '',
    barcode:       product?.barcode ?? '',
    unitPrice:     product?.unitPrice ?? '',
    unitCost:      product?.unitCost ?? '',
    minStockLevel: product?.minStockLevel ?? '',
  })
  const [err, setErr] = useState('')
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    const payload = {
      name: form.name.trim(),
      category: form.category,
      unit: form.unit || null,
      barcode: form.barcode || null,
      unitPrice: Number(form.unitPrice || 0),
      unitCost: form.unitCost === '' ? null : Number(form.unitCost),
      minStockLevel: Number(form.minStockLevel || 0),
    }
    try {
      if (isEdit) await update.mutateAsync({ id: product!.id, ...payload })
      else await create.mutateAsync(payload)
      onClose()
    } catch (e2: unknown) {
      setErr((e2 as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Save failed')
    }
  }

  return (
    <ModalShell title={isEdit ? 'Edit Product' : 'Add Product'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-md">
        <div>
          <label className={labelCls}>Name</label>
          <input className={inputCls} value={form.name} onChange={set('name')} required />
        </div>
        <div className="grid grid-cols-2 gap-md">
          <div>
            <label className={labelCls}>Category</label>
            <select className={inputCls} value={form.category} onChange={set('category')}>
              {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Unit</label>
            <input className={inputCls} value={form.unit} onChange={set('unit')} placeholder="tablet, ml…" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-md">
          <div>
            <label className={labelCls}>Unit price (฿)</label>
            <input className={inputCls} type="number" min="0" step="0.01" value={form.unitPrice} onChange={set('unitPrice')} />
          </div>
          <div>
            <label className={labelCls}>Unit cost (฿)</label>
            <input className={inputCls} type="number" min="0" step="0.01" value={form.unitCost} onChange={set('unitCost')} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-md">
          <div>
            <label className={labelCls}>Min stock level</label>
            <input className={inputCls} type="number" min="0" step="0.01" value={form.minStockLevel} onChange={set('minStockLevel')} />
          </div>
          <div>
            <label className={labelCls}>Barcode</label>
            <input className={inputCls} value={form.barcode} onChange={set('barcode')} />
          </div>
        </div>
        {err && <p className="text-body-sm text-error">{err}</p>}
        <div className="flex justify-end gap-sm pt-sm">
          <button type="button" onClick={onClose} className="min-h-[44px] px-lg rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors">Cancel</button>
          <button type="submit" className="min-h-[44px] px-lg rounded-lg bg-primary text-primary-on font-semibold hover:bg-primary/90 transition-colors">{isEdit ? 'Save' : 'Add product'}</button>
        </div>
      </form>
    </ModalShell>
  )
}

function StockInModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const stockIn = useStockIn()
  const [qty, setQty] = useState('')
  const [lotNo, setLotNo] = useState('')
  const [expiry, setExpiry] = useState('')
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    try {
      await stockIn.mutateAsync({
        id: product.id,
        qty: Number(qty),
        lotNo: lotNo || null,
        expiryDate: expiry ? new Date(expiry).toISOString() : null,
      })
      onClose()
    } catch (e2: unknown) {
      setErr((e2 as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Stock-in failed')
    }
  }

  return (
    <ModalShell title={`Stock In · ${product.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-md">
        <p className="text-body-sm text-on-surface-variant">
          Current: <span className="font-code text-on-surface">{Number(product.stockQuantity)} {product.unit ?? ''}</span>
        </p>
        <div>
          <label className={labelCls}>Quantity received</label>
          <input className={inputCls} type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-md">
          <div>
            <label className={labelCls}>Lot no.</label>
            <input className={inputCls} value={lotNo} onChange={(e) => setLotNo(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Expiry date</label>
            <input className={inputCls} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
        </div>
        {err && <p className="text-body-sm text-error">{err}</p>}
        <div className="flex justify-end gap-sm pt-sm">
          <button type="button" onClick={onClose} className="min-h-[44px] px-lg rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors">Cancel</button>
          <button type="submit" className="min-h-[44px] px-lg rounded-lg bg-secondary text-secondary-on font-semibold hover:bg-secondary/90 transition-colors">Receive stock</button>
        </div>
      </form>
    </ModalShell>
  )
}
