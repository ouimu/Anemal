/**
 * CustomerListView — /platform/customers
 * Table of all tenants with inline "Add Customer" modal.
 */
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  usePlatformCustomers,
  useCreatePlatformCustomer,
  type CreateCustomerPayload,
} from '../../hooks/usePlatformCustomers'
import { usePlatformPlans } from '../../hooks/usePlatformPlans'
import StatusBadge from '../../components/platform/StatusBadge'
import PlatformModal from '../../components/platform/PlatformModal'
import MaterialIcon from '../../components/MaterialIcon'

// ── Add Customer form state ───────────────────────────────────────────────────

const EMPTY_FORM: CreateCustomerPayload = {
  name:        '',
  subdomain:   '',
  planId:      0,
  trialEndsAt: null,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CustomerListView() {
  const navigate = useNavigate()
  const { data: customers, isLoading, isError } = usePlatformCustomers()
  const { data: plans }                          = usePlatformPlans()
  const createMutation                           = useCreatePlatformCustomer()

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm]           = useState<CreateCustomerPayload>(EMPTY_FORM)

  const openModal  = () => { setForm(EMPTY_FORM); setModalOpen(true) }
  const closeModal = () => setModalOpen(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(form, { onSuccess: closeModal })
  }

  const activePlans = (plans ?? []).filter((p) => !p.isRetired)

  return (
    <div className="p-lg space-y-lg">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-headline-md font-headline font-bold text-on-surface">Customers</h1>
          <p className="text-body-sm text-on-surface-variant mt-xs">
            Manage tenant accounts, plans, and quotas
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-sm bg-primary text-on-primary px-md min-h-[44px] rounded text-body-sm font-medium hover:opacity-90 transition-opacity"
        >
          <MaterialIcon name="add" size={18} />
          Add Customer
        </button>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="bg-surface rounded-lg shadow-lvl1 overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center p-2xl text-on-surface-variant">
            <span className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin mr-sm" />
            Loading customers…
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-sm p-lg text-error">
            <MaterialIcon name="error_outline" size={20} />
            Failed to load customers. Please refresh.
          </div>
        )}

        {!isLoading && !isError && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Subdomain</th>
                <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Name</th>
                <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Plan</th>
                <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Status</th>
                <th className="text-right px-md py-sm text-label-md text-on-surface-variant">Users</th>
                <th className="px-md py-sm" />
              </tr>
            </thead>
            <tbody>
              {(customers ?? []).map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-outline-variant hover:bg-surface-container-low cursor-pointer min-h-[48px] transition-colors"
                  onClick={() => navigate(`/platform/customers/${c.id}`)}
                >
                  <td className="px-md py-sm text-body-sm font-code text-on-surface-variant">
                    {c.subdomain}
                  </td>
                  <td className="px-md py-sm text-body-md text-on-surface font-medium">{c.name}</td>
                  <td className="px-md py-sm text-body-sm text-on-surface-variant">{c.planName}</td>
                  <td className="px-md py-sm">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-md py-sm text-body-sm text-on-surface-variant text-right">
                    {c.userCount}
                  </td>
                  <td className="px-md py-sm">
                    <MaterialIcon name="chevron_right" size={20} className="text-on-surface-variant" />
                  </td>
                </tr>
              ))}
              {(customers ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-md py-xl text-center text-on-surface-variant text-body-sm">
                    No customers yet. Add the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Add Customer Modal ───────────────────────────────────────────── */}
      <PlatformModal title="Add Customer" open={modalOpen} onClose={closeModal}>
        <form onSubmit={handleSubmit} className="space-y-md">
          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="cust-name">
              Clinic Name <span className="text-error">*</span>
            </label>
            <input
              id="cust-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
              placeholder="Happy Paws Clinic"
            />
          </div>

          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="cust-subdomain">
              Subdomain <span className="text-error">*</span>
            </label>
            <div className="flex items-center gap-xs">
              <input
                id="cust-subdomain"
                type="text"
                required
                value={form.subdomain}
                onChange={(e) => setForm((f) => ({ ...f, subdomain: e.target.value.toLowerCase().replace(/\s/g, '-') }))}
                className="flex-1 min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
                placeholder="happypaws"
              />
              <span className="text-body-sm text-on-surface-variant">.anemal.app</span>
            </div>
          </div>

          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="cust-plan">
              Plan <span className="text-error">*</span>
            </label>
            <select
              id="cust-plan"
              required
              value={form.planId || ''}
              onChange={(e) => setForm((f) => ({ ...f, planId: Number(e.target.value) }))}
              className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
            >
              <option value="">Select a plan…</option>
              {activePlans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="cust-trial">
              Trial Ends At (optional)
            </label>
            <input
              id="cust-trial"
              type="date"
              value={form.trialEndsAt ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, trialEndsAt: e.target.value || null }))}
              className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>

          {createMutation.error && (
            <p className="text-label-md text-error">Failed to create customer. Please try again.</p>
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
              disabled={createMutation.isPending}
              className="min-h-[44px] px-md bg-primary text-on-primary rounded text-body-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-sm"
            >
              {createMutation.isPending && (
                <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
              )}
              Create Customer
            </button>
          </div>
        </form>
      </PlatformModal>
    </div>
  )
}
