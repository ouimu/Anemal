/**
 * CustomerDetailView — /platform/customers/:id
 * Four-tab detail page: Overview | Plan & Quota | Provisioning | Usage
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import platformApi from '../../utils/platformApi'
import {
  usePlatformCustomer,
  usePlatformCustomerUsage,
  useSuspendCustomer,
  useReactivateCustomer,
  useUpdatePlatformCustomer,
  useSetCustomerQuota,
  type UpdateQuotaPayload,
} from '../../hooks/usePlatformCustomers'
import { usePlatformPlans } from '../../hooks/usePlatformPlans'
import StatusBadge from '../../components/platform/StatusBadge'
import QuotaBar from '../../components/platform/QuotaBar'
import MaterialIcon from '../../components/MaterialIcon'

// ── Tab type ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'quota' | 'provisioning' | 'usage'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',     label: 'Overview' },
  { id: 'quota',        label: 'Plan & Quota' },
  { id: 'provisioning', label: 'Provisioning' },
  { id: 'usage',        label: 'Usage' },
]

// ── Overview tab ─────────────────────────────────────────────────────────────

interface CompanyType { id: number; key: string; nameEn: string; nameTh: string }

function OverviewTab({ id }: { id: number }) {
  const { data: customer, isLoading } = usePlatformCustomer(id)
  const { data: companyTypes = [] } = useQuery<CompanyType[]>({
    queryKey: ['platform', 'company-types'],
    queryFn: () => platformApi.get('/platform/company-types').then(r => r.data.data),
  })
  const suspend    = useSuspendCustomer(id)
  const reactivate = useReactivateCustomer(id)
  const update     = useUpdatePlatformCustomer(id)

  const [editing,           setEditing]           = useState(false)
  const [editName,          setEditName]          = useState('')
  const [editCompanyTypeId, setEditCompanyTypeId] = useState<number | null>(null)

  if (isLoading || !customer) {
    return <div className="p-lg text-on-surface-variant text-body-sm">Loading…</div>
  }

  const isSuspended = customer.status === 'suspended'

  const openEdit = () => {
    setEditName(customer.name)
    setEditCompanyTypeId(customer.companyTypeId ?? null)
    setEditing(true)
  }

  const saveEdit = () => {
    update.mutate(
      { name: editName, companyTypeId: editCompanyTypeId },
      { onSuccess: () => setEditing(false) },
    )
  }

  return (
    <div className="space-y-lg">
      <div className="bg-surface rounded-lg shadow-lvl1 p-lg">
        <div className="flex items-center justify-between mb-md">
          <h3 className="text-headline-xs font-headline font-bold text-on-surface">Company Info</h3>
          {!editing && (
            <button
              onClick={openEdit}
              className="flex items-center gap-xs min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              <MaterialIcon name="edit" size={16} />
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-md">
            <div>
              <label className="block text-label-md text-on-surface-variant mb-xs">Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
              />
            </div>
            {companyTypes.length > 0 && (
              <div>
                <label className="block text-label-md text-on-surface-variant mb-xs">Company Type</label>
                <select
                  value={editCompanyTypeId ?? ''}
                  onChange={(e) => setEditCompanyTypeId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
                >
                  <option value="">— None —</option>
                  {companyTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.nameTh || ct.nameEn || ct.key}</option>)}
                </select>
              </div>
            )}
            {update.error && (
              <p className="text-label-md text-error">Save failed. Please try again.</p>
            )}
            <div className="flex gap-sm">
              <button
                onClick={saveEdit}
                disabled={update.isPending}
                className="flex items-center gap-sm min-h-[44px] px-md bg-primary text-on-primary rounded text-body-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {update.isPending && <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />}
                <MaterialIcon name="save" size={16} />
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-md text-body-sm">
            <div>
              <dt className="text-on-surface-variant">Name</dt>
              <dd className="text-on-surface font-medium mt-xs">{customer.name}</dd>
            </div>
            <div>
              <dt className="text-on-surface-variant">Subdomain</dt>
              <dd className="text-on-surface font-code mt-xs">{customer.subdomain}</dd>
            </div>
            <div>
              <dt className="text-on-surface-variant">Status</dt>
              <dd className="mt-xs"><StatusBadge status={customer.status} /></dd>
            </div>
            <div>
              <dt className="text-on-surface-variant">Plan</dt>
              <dd className="text-on-surface mt-xs">{customer.planName}</dd>
            </div>
            {customer.trialEndsAt && (
              <div>
                <dt className="text-on-surface-variant">Trial Ends</dt>
                <dd className="text-on-surface mt-xs">
                  {new Date(customer.trialEndsAt).toLocaleDateString()}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-on-surface-variant">Users</dt>
              <dd className="text-on-surface mt-xs">{customer.userCount}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="bg-surface rounded-lg shadow-lvl1 p-lg">
        <h3 className="text-headline-xs font-headline font-bold text-on-surface mb-md">Actions</h3>
        {isSuspended ? (
          <button
            onClick={() => reactivate.mutate()}
            disabled={reactivate.isPending}
            className="flex items-center gap-sm min-h-[44px] px-md bg-secondary text-on-secondary rounded text-body-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {reactivate.isPending && (
              <span className="w-4 h-4 border-2 border-on-secondary border-t-transparent rounded-full animate-spin" />
            )}
            <MaterialIcon name="play_circle" size={18} />
            Reactivate Tenant
          </button>
        ) : (
          <button
            onClick={() => suspend.mutate()}
            disabled={suspend.isPending}
            className="flex items-center gap-sm min-h-[44px] px-md bg-error text-on-error rounded text-body-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {suspend.isPending && (
              <span className="w-4 h-4 border-2 border-on-error border-t-transparent rounded-full animate-spin" />
            )}
            <MaterialIcon name="block" size={18} />
            Suspend Tenant
          </button>
        )}
        <p className="text-label-md text-on-surface-variant mt-sm">
          {isSuspended
            ? 'Reactivating will immediately restore clinic access.'
            : 'Suspending blocks all clinic logins immediately.'}
        </p>
      </div>
    </div>
  )
}

// ── Plan & Quota tab ──────────────────────────────────────────────────────────

function QuotaTab({ id }: { id: number }) {
  const { data: customer, isLoading } = usePlatformCustomer(id)
  const { data: plans }               = usePlatformPlans()
  const updatePlan                    = useUpdatePlatformCustomer(id)
  const updateQuota                   = useSetCustomerQuota(id)

  const [planId,      setPlanId]      = useState<number | null>(null)
  const [maxBranches, setMaxBranches] = useState<string>('')
  const [maxUsers,    setMaxUsers]    = useState<string>('')
  const [maxOwners,   setMaxOwners]   = useState<string>('')

  const [initialized, setInitialized] = useState(false)
  if (customer && !initialized) {
    setPlanId(customer.planId)
    setMaxBranches(customer.maxBranches !== null ? String(customer.maxBranches) : '')
    setMaxUsers(customer.maxUsers !== null ? String(customer.maxUsers) : '')
    setMaxOwners(customer.maxOwners !== null ? String(customer.maxOwners) : '')
    setInitialized(true)
  }

  if (isLoading || !customer) {
    return <div className="p-lg text-on-surface-variant text-body-sm">Loading…</div>
  }

  const activePlans = (plans ?? []).filter((p) => !p.isRetired)

  const handleSavePlan = () => {
    updatePlan.mutate({ planId: planId ?? undefined })
  }

  const handleSaveQuota = () => {
    const payload: UpdateQuotaPayload = {
      maxBranches: maxBranches !== '' ? Number(maxBranches) : null,
      maxUsers:    maxUsers    !== '' ? Number(maxUsers)    : null,
      maxOwners:   maxOwners   !== '' ? Number(maxOwners)   : null,
    }
    updateQuota.mutate(payload)
  }

  const isPending = updatePlan.isPending || updateQuota.isPending

  return (
    <div className="space-y-lg">
      <div className="bg-surface rounded-lg shadow-lvl1 p-lg space-y-md">
        <h3 className="text-headline-xs font-headline font-bold text-on-surface">Plan</h3>
        <select
          value={planId ?? ''}
          onChange={(e) => setPlanId(Number(e.target.value))}
          className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
        >
          {activePlans.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {updatePlan.error && (
          <p className="text-label-md text-error">Save failed. Please try again.</p>
        )}
        <button
          onClick={handleSavePlan}
          disabled={updatePlan.isPending}
          className="flex items-center gap-sm min-h-[44px] px-md bg-primary text-on-primary rounded text-body-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {updatePlan.isPending && <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />}
          <MaterialIcon name="save" size={18} />
          Save Plan
        </button>
      </div>

      <div className="bg-surface rounded-lg shadow-lvl1 p-lg space-y-md">
        <h3 className="text-headline-xs font-headline font-bold text-on-surface">
          Quota Overrides
          <span className="ml-sm text-label-md font-normal text-on-surface-variant">
            (blank = use plan default)
          </span>
        </h3>

        {([
          { id: 'maxBranches', label: 'Max Branches', value: maxBranches, set: setMaxBranches },
          { id: 'maxUsers',    label: 'Max Users',    value: maxUsers,    set: setMaxUsers },
          { id: 'maxOwners',   label: 'Max Clients',  value: maxOwners,   set: setMaxOwners },
        ] as const).map((field) => (
          <div key={field.id}>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor={field.id}>
              {field.label}
            </label>
            <input
              id={field.id}
              type="number"
              min={0}
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
              placeholder="Inherit from plan"
              className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>
        ))}

        {updateQuota.error && (
          <p className="text-label-md text-error">Save failed. Please try again.</p>
        )}

        <button
          onClick={handleSaveQuota}
          disabled={isPending}
          className="flex items-center gap-sm min-h-[44px] px-md bg-primary text-on-primary rounded text-body-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {updateQuota.isPending && <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />}
          <MaterialIcon name="save" size={18} />
          Save Quotas
        </button>
      </div>
    </div>
  )
}

// ── Provisioning tab ──────────────────────────────────────────────────────────

function ProvisioningTab() {
  return (
    <div className="bg-surface rounded-lg shadow-lvl1 p-lg">
      <div className="flex items-center gap-sm text-on-surface-variant">
        <MaterialIcon name="construction" size={20} />
        <p className="text-body-sm">
          Per-tenant provisioning (S3, SMTP, base providers) has no dedicated UI yet.
          Existing tenant-wide values are managed via Platform Settings
          (<code>GET/PUT /platform/settings</code>); a per-customer provisioning screen
          is tracked as a separate, not-yet-scheduled task.
        </p>
      </div>
    </div>
  )
}

// ── Usage tab ─────────────────────────────────────────────────────────────────

function UsageTab({ id }: { id: number }) {
  const { data: usage, isLoading, isError } = usePlatformCustomerUsage(id)

  if (isLoading) {
    return <div className="p-lg text-on-surface-variant text-body-sm">Loading usage…</div>
  }

  if (isError || !usage) {
    return (
      <div className="p-lg text-error text-body-sm flex items-center gap-sm">
        <MaterialIcon name="error_outline" size={18} />
        Failed to load usage data.
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-lg shadow-lvl1 p-lg space-y-lg">
      <h3 className="text-headline-xs font-headline font-bold text-on-surface">Live Usage</h3>
      <QuotaBar label="Branches"  current={usage.branches.current} limit={usage.branches.limit} />
      <QuotaBar label="Staff"     current={usage.staff.current}    limit={usage.staff.limit} />
      <QuotaBar label="Customers" current={usage.owners.current}   limit={usage.owners.limit} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CustomerDetailView() {
  const { id }          = useParams<{ id: string }>()
  const customerId      = Number(id)
  const navigate        = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const { data: customer }        = usePlatformCustomer(customerId)

  const tabClass = (tab: Tab) =>
    tab === activeTab
      ? 'min-h-[44px] px-md border-b-2 border-primary text-primary text-body-sm font-medium'
      : 'min-h-[44px] px-md border-b-2 border-transparent text-on-surface-variant text-body-sm hover:text-on-surface transition-colors'

  return (
    <div className="p-lg space-y-lg">
      {/* ── Back + title ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-md">
        <button
          onClick={() => navigate('/platform/customers')}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors"
          aria-label="Back to customers"
        >
          <MaterialIcon name="arrow_back" size={20} />
        </button>
        <div>
          <h1 className="text-headline-md font-headline font-bold text-on-surface">
            {customer?.name ?? 'Customer Detail'}
          </h1>
          {customer && (
            <p className="text-body-sm text-on-surface-variant mt-xs">
              {customer.subdomain}.anemal.app
            </p>
          )}
        </div>
        {customer && (
          <div className="ml-auto">
            <StatusBadge status={customer.status} />
          </div>
        )}
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div className="bg-surface rounded-lg shadow-lvl1 overflow-hidden">
        <div className="flex border-b border-outline-variant overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={tabClass(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-lg">
          {activeTab === 'overview'     && <OverviewTab     id={customerId} />}
          {activeTab === 'quota'        && <QuotaTab        id={customerId} />}
          {activeTab === 'provisioning' && <ProvisioningTab />}
          {activeTab === 'usage'        && <UsageTab        id={customerId} />}
        </div>
      </div>
    </div>
  )
}
