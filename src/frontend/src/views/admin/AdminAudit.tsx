import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'

interface AuditLog {
  id: number
  userId: number | null
  action: string
  tableName: string | null
  recordId: number | null
  details: unknown
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

interface AuditPage { items: AuditLog[]; total: number; page: number; limit: number }
interface UserLite { id: number; name: string; email: string; role: string }

const LIMIT = 25

function methodColor(action: string): string {
  if (action.startsWith('POST'))   return 'bg-success/20 text-success'
  if (action.startsWith('PUT') || action.startsWith('PATCH')) return 'bg-warning/20 text-warning'
  if (action.startsWith('DELETE')) return 'bg-error-container text-error'
  return 'bg-surface-container-high text-on-surface-variant'
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function AdminAudit() {
  const [page, setPage] = useState(1)
  const [userId, setUserId] = useState<number | ''>('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data: users = [] } = useQuery<UserLite[]>({
    queryKey: ['admin', 'users-lite'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  })
  const userName = (id: number | null) => {
    if (id == null) return 'System'
    return users.find(u => u.id === id)?.name ?? `User #${id}`
  }

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
  if (userId) params.set('userId', String(userId))
  if (action) params.set('action', action)
  if (from)   params.set('from', from)
  if (to)     params.set('to', to)

  const { data, isLoading, isError } = useQuery<AuditPage>({
    queryKey: ['audit', page, userId, action, from, to],
    queryFn: () => api.get(`/api/audit?${params.toString()}`).then(r => r.data.data),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  function resetFilters() {
    setUserId(''); setAction(''); setFrom(''); setTo(''); setPage(1)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <h2 className="text-headline-sm font-headline font-bold text-primary">Audit Log</h2>
        <p className="text-body-sm text-on-surface-variant mt-1">
          Write-once activity trail · {total} record{total !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filter bar */}
      <div className="bg-surface border border-outline-variant rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-label-md text-on-surface-variant">User</label>
          <select
            value={userId}
            onChange={e => { setUserId(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
            className="rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-sm text-on-surface focus:outline-none focus:border-primary min-h-[40px]"
          >
            <option value="">All users</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-label-md text-on-surface-variant">Action contains</label>
          <input
            value={action}
            onChange={e => { setAction(e.target.value); setPage(1) }}
            placeholder="e.g. DELETE, /invoices"
            className="rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary min-h-[40px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-label-md text-on-surface-variant">From</label>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }}
            className="rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-sm text-on-surface focus:outline-none focus:border-primary min-h-[40px]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-label-md text-on-surface-variant">To</label>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1) }}
            className="rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-sm text-on-surface focus:outline-none focus:border-primary min-h-[40px]" />
        </div>
        {(userId || action || from || to) && (
          <button onClick={resetFilters}
            className="min-h-[40px] px-md rounded-lg border border-outline-variant bg-surface text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isError ? (
          <div className="p-6 text-error text-body-md flex items-center gap-sm">
            <MaterialIcon name="error" size={20} /> Failed to load audit log.
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-on-surface-variant">
            <MaterialIcon name="policy" size={40} className="text-outline mb-2" />
            <p className="text-body-md">No audit records match the filters.</p>
          </div>
        ) : (
          <table className="w-full text-body-sm">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant text-label-md uppercase tracking-wide">
                <th className="text-left px-4 py-2 font-medium">Time</th>
                <th className="text-left px-4 py-2 font-medium">User</th>
                <th className="text-left px-4 py-2 font-medium">Action</th>
                <th className="text-left px-4 py-2 font-medium">Record</th>
                <th className="text-left px-4 py-2 font-medium">IP</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(log => {
                const hasDetails = log.details != null || log.userAgent
                const isOpen = expanded === log.id
                return (
                  <Fragment key={log.id}>
                    <tr className="border-t border-outline-variant hover:bg-surface-container-low/50">
                      <td className="px-4 py-2 text-on-surface-variant font-mono whitespace-nowrap">{formatTime(log.createdAt)}</td>
                      <td className="px-4 py-2 text-on-surface">{userName(log.userId)}</td>
                      <td className="px-4 py-2">
                        <span className={`px-sm py-xs rounded-full text-label-sm font-medium font-mono ${methodColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-on-surface-variant font-mono">
                        {log.tableName ? `${log.tableName}${log.recordId ? `#${log.recordId}` : ''}` : (log.recordId ? `#${log.recordId}` : '—')}
                      </td>
                      <td className="px-4 py-2 text-on-surface-variant font-mono">{log.ipAddress ?? '—'}</td>
                      <td className="px-2 py-2 text-right">
                        {hasDetails && (
                          <button
                            onClick={() => setExpanded(isOpen ? null : log.id)}
                            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant"
                            aria-label="Toggle details"
                          >
                            <MaterialIcon name={isOpen ? 'expand_less' : 'expand_more'} size={18} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-outline-variant bg-surface-container-low/40">
                        <td colSpan={6} className="px-4 py-3">
                          {log.details != null && (
                            <pre className="text-label-md font-code text-on-surface bg-surface border border-outline-variant rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                          {log.userAgent && (
                            <p className="text-label-md text-on-surface-variant mt-2 break-all">
                              <span className="font-medium">User agent:</span> {log.userAgent}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-label-md text-on-surface-variant">Page {page} of {totalPages}</p>
          <div className="flex gap-sm">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="min-h-[40px] px-md rounded-lg border border-outline-variant bg-surface text-body-sm text-on-surface hover:bg-surface-container disabled:opacity-40 transition-colors"
            >Previous</button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="min-h-[40px] px-md rounded-lg border border-outline-variant bg-surface text-body-sm text-on-surface hover:bg-surface-container disabled:opacity-40 transition-colors"
            >Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
