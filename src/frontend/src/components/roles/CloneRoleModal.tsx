/**
 * CloneRoleModal — prompts for a new role name then calls POST /clinic/roles/clone.
 * AC-3: Clone → modal with name input → POST clone → new role in list.
 */
import React, { useState } from 'react'
import MaterialIcon from '../MaterialIcon'
import { useCloneRoleMutation } from '../../hooks/useRoles'
import { useT } from '../../i18n'

interface Props {
  /** Source role to clone from */
  sourceRoleName: string
  onClose: () => void
  /** Called with the new role id after successful clone */
  onCloned: (newRoleId: string) => void
}

/**
 * Modal dialog that captures a new role name and submits the clone request.
 */
export default function CloneRoleModal({ sourceRoleName, onClose, onCloned }: Props) {
  const t = useT()
  const [newName, setNewName] = useState('')
  const cloneMutation = useCloneRoleMutation()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    cloneMutation.mutate(
      { sourceRoleName, newName: trimmed },
      { onSuccess: (role) => onCloned(role.id) }
    )
  }

  const isSubmitting = cloneMutation.isPending
  const errorMsg =
    cloneMutation.isError
      ? (cloneMutation.error?.message ?? 'Failed to clone role. Please try again.')
      : null

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      aria-modal="true"
      role="dialog"
      aria-labelledby="clone-modal-title"
    >
      <div className="bg-surface rounded-xl shadow-lvl3 p-xl w-[480px] max-w-[calc(100vw-32px)] space-y-lg">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 id="clone-modal-title" className="text-headline-sm font-headline font-semibold text-primary">
            {t('roles.cloneRole')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-surface-container rounded-full transition-colors"
            aria-label="Close"
          >
            <MaterialIcon name="close" size={20} className="text-on-surface-variant" />
          </button>
        </div>

        {/* Description */}
        <p className="text-body-sm text-on-surface-variant">
          Creates a new editable role with the same permissions as{' '}
          <strong className="text-on-surface">{sourceRoleName}</strong>.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-lg">
          <div className="space-y-xs">
            <label htmlFor="clone-role-name" className="block text-label-md text-primary font-bold">
              {t('roles.cloneNewName')}
            </label>
            <input
              id="clone-role-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Senior Doctor"
              disabled={isSubmitting}
              className="w-full px-md py-base border border-outline-variant rounded-lg
                         focus:ring-2 focus:ring-primary focus:border-transparent
                         min-h-[44px] text-body-md font-sans text-on-surface
                         disabled:opacity-50 disabled:cursor-not-allowed"
              required
              maxLength={80}
            />
            <p className="text-label-md text-on-surface-variant">Must be unique within your clinic.</p>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="flex items-center gap-sm p-md bg-error-container rounded-lg">
              <MaterialIcon name="error_outline" size={18} className="text-error flex-shrink-0" />
              <p className="text-body-sm text-error-on-container">{errorMsg}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-md justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-lg py-base border border-outline-variant rounded-lg text-on-surface
                         font-bold hover:bg-surface-container min-h-[44px] transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !newName.trim()}
              className="px-lg py-base bg-primary text-on-primary font-bold rounded-lg
                         hover:opacity-90 min-h-[44px] flex items-center gap-xs transition-opacity
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <MaterialIcon name="progress_activity" size={16} className="animate-spin" />
              ) : (
                <MaterialIcon name="content_copy" size={16} />
              )}
              Clone role
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
