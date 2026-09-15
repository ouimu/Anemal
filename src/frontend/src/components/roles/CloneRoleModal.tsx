/**
 * CloneRoleModal — prompts for a new role name then calls POST /clinic/roles/clone.
 * AC-3: Clone → modal with name input → POST clone → new role in list.
 *
 * Renders through the shared Dialog shell (MODAL-8, dismissal='dismissible' —
 * the default). Dialog derives role/close-button/Escape/backdrop behaviour
 * from that policy; this component owns only the form and its footer actions.
 * See docs/superpowers/plans/2026-09-11-modal-consolidation-arch-brief.md §4.
 *
 * Authorization is enforced server-side and is out of this component's scope
 * (unchanged by this migration): the clone route requires `roles.manage`
 * (role.routes.ts), the sealed `clinic_admin` role cannot be cloned
 * (role.service.ts `cloneRole`, ForbiddenError), and the cloned role's
 * permission set is filtered to the caller's own permissions there too
 * (no-escalation invariant). This component surfaces whatever the mutation
 * returns/throws; it does not re-implement any of those checks.
 */
import React, { useId, useState } from 'react'
import Dialog from '../Dialog'
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
export default function CloneRoleModal({ sourceRoleName, onClose, onCloned }: Props): React.ReactElement {
  const t = useT()
  const formId = useId()
  const [newName, setNewName] = useState('')
  const cloneMutation = useCloneRoleMutation()

  const handleSubmit = (e: React.FormEvent): void => {
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
    <Dialog
      title={t('roles.cloneRole')}
      open
      onClose={onClose}
      dismissal="dismissible"
      footer={
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
            form={formId}
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
      }
    >
      {/* Description */}
      <p className="text-body-sm text-on-surface-variant">
        Creates a new editable role with the same permissions as{' '}
        <strong className="text-on-surface">{sourceRoleName}</strong>.
      </p>

      {/* Form — submitted via the footer's Clone button (form={formId}), since
          the footer is a sibling of this scrolling body, not a descendant. */}
      <form id={formId} onSubmit={handleSubmit} className="space-y-lg mt-lg">
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
      </form>
    </Dialog>
  )
}
