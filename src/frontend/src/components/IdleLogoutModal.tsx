/**
 * IdleLogoutModal — the idle-timeout warning shown before an inactive
 * session is force-logged-out.
 *
 * Migrated onto the shared `Dialog` shell under the blocking dismissal
 * policy (Task MODAL-12, docs/superpowers/plans/2026-09-11-modal-consolidation.md;
 * ADR-0027 decision 1, docs/adr/0027-shared-modal-dismissal-policy-and-plane-neutrality.md).
 * `role`, the absence of a close control, and the Escape/backdrop no-ops
 * are all *derived* by `Dialog` from that policy — this
 * component does not pass `role` and does not decide dismissal behaviour
 * itself.
 *
 * This is a deliberate, permanent departure from "Escape closes": the user
 * may have unsaved clinical data open on a tablet, and the only sanctioned
 * exit is the explicit "Stay logged in" action. The blocking policy is
 * intentionally load-bearing at exactly one call site in the whole
 * frontend — see `__tests__/IdleLogoutModal.test.tsx` for the paired
 * blocking-policy assertion (behavioural guard + single-call-site census)
 * that replaces the `onClose?: never` type guard removed per the Step
 * 3.4b ponytail flag.
 *
 * `aria-live="assertive"` is deliberately NOT carried forward from the
 * pre-migration version. `role="alertdialog"` on mount (derived by
 * `Dialog`) is the reliable screen-reader announcement mechanism; a live
 * region created at the same instant as its own content is not, and a
 * per-second countdown announced via aria-live would be actively hostile
 * to screen-reader users. This is a recorded, deliberate behaviour change
 * — it still needs a manual assistive-technology verification pass by
 * @qa-agent, which is not something an automated test can stand in for.
 *
 * Plane-neutral by construction: it receives only `open`, `secondsLeft`,
 * `onStay` as props and reads nothing else, so it mounts unchanged from
 * both `guards/RequireAuth.tsx` (clinic plane) and
 * `layouts/PlatformLayout.tsx` (platform plane) — it must not assume
 * `tenantId` exists.
 */
import React from 'react'
import Dialog from './Dialog'

export interface IdleLogoutModalProps {
  open: boolean
  secondsLeft: number
  onStay: () => void
}

export default function IdleLogoutModal({
  open,
  secondsLeft,
  onStay,
}: IdleLogoutModalProps): React.ReactElement | null {
  return (
    <Dialog
      title="Session expiring"
      open={open}
      dismissal="blocking"
      width="max-w-sm"
      footer={
        <button
          type="button"
          onClick={onStay}
          className="w-full min-h-[44px] px-6 bg-primary text-on-primary rounded-lg text-body-md font-semibold"
        >
          Stay logged in
        </button>
      }
    >
      <p className="text-body-md text-on-surface-variant text-center">
        You&apos;ll be logged out in {secondsLeft}s due to inactivity.
      </p>
    </Dialog>
  )
}
