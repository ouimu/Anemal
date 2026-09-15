import { useState, useCallback, useId } from 'react'
import { useT } from '../../i18n'
import MaterialIcon from '../../components/MaterialIcon'
import BarcodeScanner from '../../components/BarcodeScanner'
import Dialog from '../../components/Dialog'
import Can from '../../components/Can'
import { usePermissions } from '../../guards/usePermissions'
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
  const t = useT()
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
        <Can perm="inventory.create">
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-sm bg-primary text-primary-on rounded-lg px-lg min-h-[44px] font-semibold text-body-sm hover:bg-primary/90 transition-colors"
          >
            <MaterialIcon name="add_circle" size={18} /> {t('clinic.inventory.addItem')}
          </button>
        </Can>
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
            placeholder={t('clinic.inventory.searchPlaceholder')}
            className={`${inputCls} pl-[44px] rounded-full`}
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)}
                className={`${inputCls} w-auto min-w-[160px]`}>
          <option value="">{t('clinic.inventory.allCategories')}</option>
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
                {[t('clinic.inventory.productName'), 'Category', t('clinic.inventory.quantity'), t('clinic.inventory.minStock'), t('clinic.inventory.expiry'), 'Status', ''].map((h) => (
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
                  {t('clinic.inventory.noProducts')}
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
                        {/* Opening these two is view-only for a role holding only inventory.view
                            (e.g. doctor) — the modals themselves disable their write path per
                            inventory.edit / inventory.adjust (MODAL-10). */}
                        <IconBtn icon="add_box" title="Stock in" onClick={() => setStockingIn(p)} />
                        <IconBtn icon="edit" title="Edit" onClick={() => setEditing(p)} />
                        <Can perm="inventory.edit">
                          <IconBtn icon="delete" title="Deactivate"
                                   onClick={() => { if (confirm(`Deactivate ${p.name}?`)) deactivate.mutate(p.id) }} />
                        </Can>
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

/**
 * ProductModal — add/edit product form, migrated onto the shared Dialog shell
 * (MODAL-10, dismissal='dismissible' — the default; matches every other
 * plain-form consumer, e.g. CloneRoleModal). Two distinct write permissions
 * share this one component: creating a new product needs `inventory.create`,
 * editing an existing one needs `inventory.edit` (product.routes.ts POST/PUT)
 * — never conflated. A caller holding only `inventory.view` (e.g. doctor)
 * can still open this dialog to look at an existing item, but `canWrite`
 * is false: every field is disabled and no submit control is rendered, so
 * there is no client path that calls the mutation. The server enforces the
 * same boundary independently (403) — this is defense in depth, not the
 * security boundary itself.
 */
function ProductModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const t = useT()
  const isEdit = !!product
  const { hasPermission } = usePermissions()
  const canWrite = isEdit ? hasPermission('inventory.edit') : hasPermission('inventory.create')
  const create = useCreateProduct()
  const update = useUpdateProduct()
  const formId = useId()
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

  const isSubmitting = create.isPending || update.isPending

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canWrite) return // defense in depth; the write route is the real boundary
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
    <Dialog
      title={isEdit ? 'Edit Product' : 'Add Product'}
      open
      onClose={onClose}
      dismissal="dismissible"
      footer={
        <div className="flex justify-end gap-sm">
          <button type="button" onClick={onClose}
                  className="min-h-[44px] px-lg rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors">
            {t('common.cancel')}
          </button>
          {canWrite && (
            <button type="submit" form={formId} disabled={isSubmitting}
                    className="min-h-[44px] px-lg rounded-lg bg-primary text-primary-on font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
              {isEdit ? t('common.save') : t('clinic.inventory.addItem')}
            </button>
          )}
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-md">
        <fieldset disabled={!canWrite} className="space-y-md contents">
          <div>
            <label htmlFor={`${formId}-name`} className={labelCls}>{t('clinic.inventory.name')}</label>
            <input id={`${formId}-name`} className={inputCls} value={form.name} onChange={set('name')} required />
          </div>
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label htmlFor={`${formId}-category`} className={labelCls}>{t('clinic.inventory.category')}</label>
              <select id={`${formId}-category`} className={inputCls} value={form.category} onChange={set('category')}>
                {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${formId}-unit`} className={labelCls}>{t('clinic.inventory.unitLabel')}</label>
              <input id={`${formId}-unit`} className={inputCls} value={form.unit} onChange={set('unit')} placeholder="tablet, ml…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label htmlFor={`${formId}-unitPrice`} className={labelCls}>{t('clinic.inventory.unitPrice')}</label>
              <input id={`${formId}-unitPrice`} className={inputCls} type="number" min="0" step="0.01" value={form.unitPrice} onChange={set('unitPrice')} />
            </div>
            <div>
              <label htmlFor={`${formId}-unitCost`} className={labelCls}>{t('clinic.inventory.unitCost')}</label>
              <input id={`${formId}-unitCost`} className={inputCls} type="number" min="0" step="0.01" value={form.unitCost} onChange={set('unitCost')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label htmlFor={`${formId}-minStockLevel`} className={labelCls}>{t('clinic.inventory.minStockLevel')}</label>
              <input id={`${formId}-minStockLevel`} className={inputCls} type="number" min="0" step="0.01" value={form.minStockLevel} onChange={set('minStockLevel')} />
            </div>
            <div>
              <label htmlFor={`${formId}-barcode`} className={labelCls}>{t('clinic.inventory.barcode')}</label>
              <input id={`${formId}-barcode`} className={inputCls} value={form.barcode} onChange={set('barcode')} />
            </div>
          </div>
        </fieldset>
        {!canWrite && (
          <p className="text-body-sm text-on-surface-variant">View only — you do not have permission to {isEdit ? 'edit' : 'add'} inventory items.</p>
        )}
        {err && <p className="text-body-sm text-error">{err}</p>}
      </form>
    </Dialog>
  )
}

/**
 * StockInModal — records a stock-received movement, migrated onto Dialog
 * (MODAL-10). Gated on `inventory.adjust` (product.routes.ts POST
 * `/:id/stock-in`), a code distinct from `inventory.edit`. A caller holding
 * only `inventory.view` can open this to see current stock, but `canWrite`
 * is false: fields are disabled and no submit control renders. Stock
 * quantity changes stay branch-scoped exactly as before — this migration
 * touches presentation only, not the mutation or its payload.
 */
function StockInModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const t = useT()
  const { hasPermission } = usePermissions()
  const canWrite = hasPermission('inventory.adjust')
  const stockIn = useStockIn()
  const formId = useId()
  const [qty, setQty] = useState('')
  const [lotNo, setLotNo] = useState('')
  const [expiry, setExpiry] = useState('')
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canWrite) return // defense in depth; the write route is the real boundary
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
    <Dialog
      title={`Stock In · ${product.name}`}
      open
      onClose={onClose}
      dismissal="dismissible"
      footer={
        <div className="flex justify-end gap-sm">
          <button type="button" onClick={onClose}
                  className="min-h-[44px] px-lg rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors">
            {t('common.cancel')}
          </button>
          {canWrite && (
            <button type="submit" form={formId} disabled={stockIn.isPending}
                    className="min-h-[44px] px-lg rounded-lg bg-secondary text-secondary-on font-semibold hover:bg-secondary/90 transition-colors disabled:opacity-50">
              {t('clinic.inventory.receiveStock')}
            </button>
          )}
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-md">
        {/* The `contents` fieldset has no box, so the form's `space-y-md`
            cannot produce a gap above it. Keeping the "Current:" line INSIDE
            the fieldset restores the rhythm: the fieldset's own `space-y-md`
            spaces all of its children, boxless parent or not. (A <p> is not a
            form control, so `disabled` does not affect it.) */}
        <fieldset disabled={!canWrite} className="space-y-md contents">
          <p className="text-body-sm text-on-surface-variant">
            Current: <span className="font-code text-on-surface">{Number(product.stockQuantity)} {product.unit ?? ''}</span>
          </p>
          <div>
            <label htmlFor={`${formId}-qty`} className={labelCls}>{t('clinic.inventory.quantityReceived')}</label>
            <input id={`${formId}-qty`} className={inputCls} type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus={canWrite} />
          </div>
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label htmlFor={`${formId}-lotNo`} className={labelCls}>{t('clinic.inventory.lotNo')}</label>
              <input id={`${formId}-lotNo`} className={inputCls} value={lotNo} onChange={(e) => setLotNo(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${formId}-expiry`} className={labelCls}>{t('clinic.inventory.expiryDate')}</label>
              <input id={`${formId}-expiry`} className={inputCls} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </div>
          </div>
        </fieldset>
        {!canWrite && (
          <p className="text-body-sm text-on-surface-variant">View only — you do not have permission to adjust stock.</p>
        )}
        {err && <p className="text-body-sm text-error">{err}</p>}
      </form>
    </Dialog>
  )
}
