/**
 * PlatformPlansView — /platform/plans
 * CRUD table for SaaS plans with create/edit modal and soft-retire.
 */
import { useState, type FormEvent } from 'react'
import {
  usePlatformPlans,
  useCreatePlatformPlan,
  useUpdatePlatformPlan,
  useRetirePlatformPlan,
  type Plan,
  type CreatePlanPayload,
} from '../../hooks/usePlatformPlans'
import PlatformModal from '../../components/platform/PlatformModal'
import MaterialIcon from '../../components/MaterialIcon'

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMPTY_FORM: CreatePlanPayload = {
  key:         '',
  name:        '',
  price:       0,
  maxBranches: 1,
  maxUsers:    5,
  maxOwners:   500,
  features:    [],
}

function nullableInt(val: string): number | null {
  return val === '' ? null : Number(val)
}

// ── Plan Form (shared by create + edit) ───────────────────────────────────────

interface PlanFormProps {
  value:     CreatePlanPayload
  onChange:  (v: CreatePlanPayload) => void
  isEdit?:   boolean
}

function PlanForm({ value, onChange, isEdit = false }: PlanFormProps) {
  const set = <K extends keyof CreatePlanPayload>(k: K, v: CreatePlanPayload[K]) =>
    onChange({ ...value, [k]: v })

  return (
    <div className="space-y-md">
      {!isEdit && (
        <div>
          <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="plan-key">
            Key <span className="text-error">*</span>
          </label>
          <input
            id="plan-key"
            required
            value={value.key}
            onChange={(e) => set('key', e.target.value.toLowerCase().replace(/\s/g, '_'))}
            className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary font-code"
            placeholder="professional"
          />
        </div>
      )}

      <div>
        <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="plan-name">
          Display Name <span className="text-error">*</span>
        </label>
        <input
          id="plan-name"
          required
          value={value.name}
          onChange={(e) => set('name', e.target.value)}
          className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
          placeholder="Professional"
        />
      </div>

      <div>
        <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="plan-price">
          Monthly Price (THB) <span className="text-error">*</span>
        </label>
        <input
          id="plan-price"
          type="number"
          min={0}
          required
          value={value.price}
          onChange={(e) => set('price', Number(e.target.value))}
          className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
        />
      </div>

      <div className="grid grid-cols-3 gap-sm">
        {([
          { id: 'plan-branches', label: 'Max Branches', key: 'maxBranches' as const },
          { id: 'plan-users',    label: 'Max Users',    key: 'maxUsers'    as const },
          { id: 'plan-owners',   label: 'Max Owners',   key: 'maxOwners'   as const },
        ]).map((field) => (
          <div key={field.id}>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor={field.id}>
              {field.label}
            </label>
            <input
              id={field.id}
              type="number"
              min={0}
              value={value[field.key] ?? ''}
              onChange={(e) => set(field.key, nullableInt(e.target.value))}
              placeholder="Unlimited"
              className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type ModalMode = 'create' | 'edit' | null

export default function PlatformPlansView() {
  const { data: plans, isLoading } = usePlatformPlans()
  const createMutation             = useCreatePlatformPlan()

  const [modalMode,     setModalMode]     = useState<ModalMode>(null)
  const [editingPlan,   setEditingPlan]   = useState<Plan | null>(null)
  const [retiringPlanId, setRetiringPlanId] = useState<number>(0)
  const [form,          setForm]          = useState<CreatePlanPayload>(EMPTY_FORM)

  // Hooks must be unconditional — ids default to 0 when not editing/retiring
  const updateMutation = useUpdatePlatformPlan(editingPlan?.id ?? 0)
  const retireMutation = useRetirePlatformPlan(retiringPlanId)

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditingPlan(null)
    setModalMode('create')
  }

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan)
    setForm({
      key:         plan.key,
      name:        plan.name,
      price:       plan.price,
      maxBranches: plan.maxBranches,
      maxUsers:    plan.maxUsers,
      maxOwners:   plan.maxOwners,
      features:    plan.features,
    })
    setModalMode('edit')
  }

  const closeModal = () => { setModalMode(null); setEditingPlan(null) }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (modalMode === 'create') {
      createMutation.mutate(form, { onSuccess: closeModal })
    } else if (modalMode === 'edit' && editingPlan) {
      const { key: _k, ...rest } = form
      void _k
      updateMutation.mutate(rest, { onSuccess: closeModal })
    }
  }

  const handleRetire = (plan: Plan) => {
    setRetiringPlanId(plan.id)
    retireMutation.mutate()
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="p-lg space-y-lg">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-headline-md font-headline font-bold text-on-surface">Plans</h1>
          <p className="text-body-sm text-on-surface-variant mt-xs">
            Define subscription tiers and their quotas
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-sm bg-primary text-on-primary px-md min-h-[44px] rounded text-body-sm font-medium hover:opacity-90 transition-opacity"
        >
          <MaterialIcon name="add" size={18} />
          New Plan
        </button>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="bg-surface rounded-lg shadow-lvl1 overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center p-2xl text-on-surface-variant">
            <span className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin mr-sm" />
            Loading plans…
          </div>
        )}
        {!isLoading && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Key</th>
                <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Name</th>
                <th className="text-right px-md py-sm text-label-md text-on-surface-variant">Price</th>
                <th className="text-right px-md py-sm text-label-md text-on-surface-variant">Branches</th>
                <th className="text-right px-md py-sm text-label-md text-on-surface-variant">Users</th>
                <th className="text-right px-md py-sm text-label-md text-on-surface-variant">Owners</th>
                <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Status</th>
                <th className="px-md py-sm" />
              </tr>
            </thead>
            <tbody>
              {(plans ?? []).map((plan) => (
                <tr
                  key={plan.id}
                  className={`border-b border-outline-variant min-h-[48px] ${plan.isRetired ? 'opacity-50' : ''}`}
                >
                  <td className="px-md py-sm text-body-sm font-code text-on-surface-variant">{plan.key}</td>
                  <td className="px-md py-sm text-body-md text-on-surface font-medium">{plan.name}</td>
                  <td className="px-md py-sm text-body-sm text-on-surface text-right">
                    ฿{plan.price.toLocaleString()}
                  </td>
                  <td className="px-md py-sm text-body-sm text-on-surface-variant text-right">
                    {plan.maxBranches ?? '∞'}
                  </td>
                  <td className="px-md py-sm text-body-sm text-on-surface-variant text-right">
                    {plan.maxUsers ?? '∞'}
                  </td>
                  <td className="px-md py-sm text-body-sm text-on-surface-variant text-right">
                    {plan.maxOwners ?? '∞'}
                  </td>
                  <td className="px-md py-sm">
                    {plan.isRetired ? (
                      <span className="text-label-md text-on-surface-variant bg-surface-container px-sm py-xs rounded-full">
                        Retired
                      </span>
                    ) : (
                      <span className="text-label-md text-success bg-success/10 border border-success/20 px-sm py-xs rounded-full">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-md py-sm">
                    <div className="flex items-center gap-xs justify-end">
                      {!plan.isRetired && (
                        <>
                          <button
                            onClick={() => openEdit(plan)}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors"
                            aria-label={`Edit ${plan.name}`}
                          >
                            <MaterialIcon name="edit" size={18} />
                          </button>
                          <button
                            onClick={() => handleRetire(plan)}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-error/10 text-error transition-colors"
                            aria-label={`Retire ${plan.name}`}
                          >
                            <MaterialIcon name="archive" size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(plans ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="px-md py-xl text-center text-on-surface-variant text-body-sm">
                    No plans defined yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Create / Edit Modal ──────────────────────────────────────────── */}
      <PlatformModal
        title={modalMode === 'create' ? 'New Plan' : `Edit: ${editingPlan?.name ?? ''}`}
        open={modalMode !== null}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit} className="space-y-md">
          <PlanForm value={form} onChange={setForm} isEdit={modalMode === 'edit'} />

          {(createMutation.error || updateMutation.error) && (
            <p className="text-label-md text-error">Save failed. Please try again.</p>
          )}

          <div className="flex items-center justify-end gap-sm pt-xs">
            <button
              type="button"
              onClick={closeModal}
              className="min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="min-h-[44px] px-md bg-primary text-on-primary rounded text-body-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-sm"
            >
              {isPending && (
                <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
              )}
              <MaterialIcon name="save" size={18} />
              {modalMode === 'create' ? 'Create Plan' : 'Save Changes'}
            </button>
          </div>
        </form>
      </PlatformModal>
    </div>
  )
}
