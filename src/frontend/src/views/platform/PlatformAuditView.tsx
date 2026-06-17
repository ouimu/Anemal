/**
 * PlatformAuditView — /platform/audit
 * Filterable audit log table for all platform mutations.
 */
import { useState } from 'react'
import { usePlatformAudit, type AuditFilters } from '../../hooks/usePlatformAudit'
import MaterialIcon from '../../components/MaterialIcon'

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year:   'numeric',
  month:  'short',
  day:    'numeric',
  hour:   '2-digit',
  minute: '2-digit',
}

export default function PlatformAuditView() {
  const [from,     setFrom]     = useState('')
  const [to,       setTo]       = useState('')
  const [action,   setAction]   = useState('')
  const [tenantId, setTenantId] = useState('')

  const filters: AuditFilters = {
    from:     from     || undefined,
    to:       to       || undefined,
    action:   action   || undefined,
    tenantId: tenantId ? Number(tenantId) : undefined,
  }

  const { data: logs, isLoading, isError, refetch } = usePlatformAudit(filters)

  const handleClear = () => {
    setFrom('')
    setTo('')
    setAction('')
    setTenantId('')
  }

  return (
    <div className="p-lg space-y-lg">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-headline-md font-headline font-bold text-on-surface">Audit Log</h1>
        <p className="text-body-sm text-on-surface-variant mt-xs">
          All platform mutations — tenant, plan, quota, provisioning, and settings changes
        </p>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="bg-surface rounded-lg shadow-lvl1 p-md">
        <div className="flex flex-wrap gap-md items-end">
          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="audit-from">
              From
            </label>
            <input
              id="audit-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>

          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="audit-to">
              To
            </label>
            <input
              id="audit-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>

          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="audit-action">
              Action
            </label>
            <input
              id="audit-action"
              type="text"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. tenant.suspend"
              className="min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>

          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="audit-tenant">
              Tenant ID
            </label>
            <input
              id="audit-tenant"
              type="number"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="Any"
              className="w-28 min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>

          <div className="flex items-center gap-sm ml-auto">
            <button
              type="button"
              onClick={handleClear}
              className="min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              className="flex items-center gap-sm min-h-[44px] px-md bg-primary text-on-primary rounded text-body-sm font-medium hover:opacity-90 transition-opacity"
            >
              <MaterialIcon name="refresh" size={18} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Log table ───────────────────────────────────────────────────── */}
      <div className="bg-surface rounded-lg shadow-lvl1 overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center p-2xl text-on-surface-variant">
            <span className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin mr-sm" />
            Loading audit log…
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-sm p-lg text-error">
            <MaterialIcon name="error_outline" size={20} />
            Failed to load audit log. Please try refreshing.
          </div>
        )}

        {!isLoading && !isError && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Timestamp</th>
                <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Action</th>
                <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Actor</th>
                <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Tenant</th>
                <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Details</th>
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((log) => (
                <tr key={log.id} className="border-b border-outline-variant hover:bg-surface-container-low min-h-[48px] transition-colors">
                  <td className="px-md py-sm text-body-sm font-code text-on-surface-variant whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('en-GB', DATE_FORMAT)}
                  </td>
                  <td className="px-md py-sm">
                    <span className="font-code text-body-sm text-on-surface bg-surface-container px-sm py-xs rounded">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-md py-sm text-body-sm text-on-surface">{log.actorName}</td>
                  <td className="px-md py-sm text-body-sm text-on-surface-variant">
                    {log.tenantName ?? <span className="text-on-surface-variant/50">—</span>}
                  </td>
                  <td className="px-md py-sm text-body-sm text-on-surface-variant max-w-[300px] truncate">
                    {JSON.stringify(log.details)}
                  </td>
                </tr>
              ))}
              {(logs ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-md py-xl text-center text-on-surface-variant text-body-sm">
                    No audit entries found for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
