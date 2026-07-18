// Branch switcher (top-right) — admin-only. Moved out of AdminLayout's left
// sidebar per user report: popup used to render below the collapsed menu icon.
// Click-outside + Escape close, same pattern as ProfileMenu.
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import { useSwitchBranch } from '../hooks/useAuth'
import { useT } from '../i18n'
import MaterialIcon from './MaterialIcon'
import api from '../utils/api'

interface Branch { id: number; name: string; isActive: boolean }

export default function BranchSwitcher() {
  const t = useT()
  const role = useAuthStore(s => s.role)
  const branchId = useAuthStore(s => s.branchId)
  const switchMutation = useSwitchBranch()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => api.get('/api/branches').then(r => r.data.data),
    enabled: role === 'admin',
  })

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (role !== 'admin') return null

  const allBranchesLabel = t('nav.allBranches')
  const currentLabel = branchId === null
    ? allBranchesLabel
    : (branches.find(b => b.id === branchId)?.name ?? allBranchesLabel)

  function handleSwitch(id: number | null, nm: string) {
    switchMutation.mutate({ branchId: id, branchName: nm })
    setOpen(false)
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={switchMutation.isPending}
        aria-haspopup="menu"
        aria-expanded={open}
        title={currentLabel}
        className="min-h-[44px] flex items-center gap-xs px-md rounded-lg text-body-sm text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-50 max-w-[200px]"
      >
        <MaterialIcon name="apartment" size={18} className="flex-shrink-0" />
        <span className="truncate">{currentLabel}</span>
        <MaterialIcon name="expand_more" size={18} className="flex-shrink-0" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-sm min-w-[200px] bg-surface border border-outline-variant rounded-lg shadow-lvl3 py-xs z-50"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => handleSwitch(null, allBranchesLabel)}
            className={`w-full text-left px-md py-sm min-h-[44px] text-body-sm transition-colors hover:bg-surface-container ${branchId === null ? 'text-primary font-medium' : 'text-on-surface'}`}
          >
            {allBranchesLabel}
          </button>
          {branches.map(b => (
            <button
              key={b.id}
              type="button"
              role="menuitem"
              onClick={() => handleSwitch(b.id, b.name)}
              className={`w-full text-left px-md py-sm min-h-[44px] text-body-sm transition-colors hover:bg-surface-container ${branchId === b.id ? 'text-primary font-medium' : 'text-on-surface'}`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
