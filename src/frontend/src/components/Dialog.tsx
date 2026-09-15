/**
 * Dialog — the single, plane-neutral dialog shell for the whole product.
 *
 * Renders one of three dismissal policies (`DismissalPolicy`); `role`, the
 * presence of the close (X) control, and the Escape/backdrop-click behaviour
 * are all *derived* from that one prop — no consumer passes `role` or decides
 * it. See docs/adr/0027-shared-modal-dismissal-policy-and-plane-neutrality.md
 * (decision 1) and docs/superpowers/plans/2026-09-11-modal-consolidation-arch-brief.md
 * §4 for the frozen contract this implements verbatim.
 *
 * Plane-neutral by contract (ADR-0027 decision 2): this module must import
 * nothing plane-specific — no auth store, no tenant/branch context, no
 * router, no API client. Only `react` and `MaterialIcon` are permitted.
 *
 * `open === false` unmounts children; it does not hide them (ADR-0027
 * decision 3). Consumers that own resources (camera streams, timers) release
 * them in their own `useEffect` cleanup, triggered by this unmount.
 */
import React, { useEffect, useId, useRef } from 'react'
import MaterialIcon from './MaterialIcon'

/**
 * Stack of currently-open dialogs, innermost last.
 *
 * Escape is handled by the topmost dialog ONLY. Without this, every open
 * Dialog registers its own document-level keydown listener and they all fire
 * together — so a `'blocking'` dialog stacked over a `'dismissible'` one
 * would correctly ignore Escape itself while the dialog underneath it closed
 * and discarded the user's work.
 *
 * That is not hypothetical: `guards/RequireAuth.tsx` renders
 * `IdleLogoutModal` as a sibling of `<Outlet/>`, so the idle warning always
 * opens on top of whatever dialog the user already has open. Pressing Escape
 * to dismiss the warning would have unmounted the grooming booking / stock
 * adjustment / branch form underneath it — precisely the data-loss path
 * ADR-0027 decision 1 introduces the `'blocking'` policy to prevent.
 *
 * A topmost `'blocking'` dialog therefore *swallows* Escape rather than
 * merely ignoring it.
 */
const openDialogStack: symbol[] = []

/** The three dialog kinds. Each has named day-one consumers (13 / 2 / 1). */
export type DismissalPolicy = 'dismissible' | 'explicit' | 'blocking'

interface DialogBase {
  /** Visible dialog title. Rendered as the <h2> and referenced by aria-labelledby. */
  title: string
  open: boolean
  children: React.ReactNode
  /** Width token class applied to the panel. Default 'max-w-lg'. */
  width?: string
  /** Pinned action row. Omitted -> no footer element is rendered at all. */
  footer?: React.ReactNode
}

/**
 * Two branches because there are exactly two `onClose` obligations:
 * `'dismissible'`/`'explicit'` render a dismissal affordance, so a handler
 * is mandatory; `'blocking'` renders none, so a handler is optional and,
 * if passed, never invoked.
 */
export type DialogProps =
  | (DialogBase & { dismissal?: 'dismissible' | 'explicit'; onClose: () => void })
  | (DialogBase & { dismissal: 'blocking'; onClose?: () => void })

/** Behaviour derived from `dismissal`, per the frozen ADR-0027 table. */
interface DerivedBehaviour {
  role: 'dialog' | 'alertdialog'
  showCloseButton: boolean
  escapeCloses: boolean
  backdropCloses: boolean
}

function deriveBehaviour(dismissal: DismissalPolicy): DerivedBehaviour {
  switch (dismissal) {
    case 'blocking':
      return { role: 'alertdialog', showCloseButton: false, escapeCloses: false, backdropCloses: false }
    case 'explicit':
      return { role: 'dialog', showCloseButton: true, escapeCloses: true, backdropCloses: false }
    case 'dismissible':
    default:
      return { role: 'dialog', showCloseButton: true, escapeCloses: true, backdropCloses: true }
  }
}

export default function Dialog({
  title,
  open,
  onClose,
  children,
  width = 'max-w-lg',
  footer,
  dismissal = 'dismissible',
}: DialogProps): React.ReactElement | null {
  const headingId = useId()
  const behaviour = deriveBehaviour(dismissal)

  // Stable per-instance identity for the open-dialog stack.
  const instanceIdRef = useRef<symbol | null>(null)
  if (instanceIdRef.current === null) instanceIdRef.current = Symbol('dialog')
  const instanceId = instanceIdRef.current

  /**
   * True when the most recent mousedown landed inside the panel. A press that
   * STARTS inside the panel and ends outside it is a drag-select overshoot,
   * not a backdrop tap: React resolves that click to the nearest common
   * ancestor — the backdrop — so the panel's own stopPropagation never runs,
   * and the dialog would close and discard the form the user was selecting
   * text in. Suppress exactly that case, and only that case.
   */
  const pressStartedInsidePanel = useRef(false)

  // Register in the stack while open, so the topmost dialog can be identified.
  useEffect(() => {
    if (!open) return
    openDialogStack.push(instanceId)
    return () => {
      const i = openDialogStack.lastIndexOf(instanceId)
      if (i !== -1) openDialogStack.splice(i, 1)
    }
  }, [open, instanceId])

  // Close on Escape, per the derived policy — but only when this dialog is the
  // topmost one. A dialog underneath must never act on a keystroke aimed at the
  // dialog above it.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (openDialogStack[openDialogStack.length - 1] !== instanceId) return
      if (!behaviour.escapeCloses) return
      onClose?.()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, behaviour.escapeCloses, onClose, instanceId])

  if (!open) return null

  const handleBackdropClick = (): void => {
    if (!behaviour.backdropCloses) return
    if (pressStartedInsidePanel.current) {
      pressStartedInsidePanel.current = false
      return
    }
    onClose?.()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-md bg-primary/30"
      onClick={handleBackdropClick}
    >
      <div
        className={`relative bg-surface rounded-lg shadow-lvl3 w-full ${width} max-h-[90vh] flex flex-col`}
        onMouseDown={() => { pressStartedInsidePanel.current = true }}
        onClick={(e) => e.stopPropagation()}
        role={behaviour.role}
        aria-modal="true"
        aria-labelledby={headingId}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-md border-b border-outline-variant shrink-0">
          <h2 id={headingId} className="text-headline-sm font-headline font-bold text-on-surface">
            {title}
          </h2>
          {behaviour.showCloseButton && (
            <button
              // MUST stay type="button". A <button> with no type defaults to
              // type="submit", and a Dialog nested inside a page-level <form>
              // (StoragePage.tsx renders one that way) makes that form the
              // close control's form owner — so dismissing the dialog would
              // also submit the form it sits in, i.e. the cancel affordance
              // would perform the very action it cancels.
              type="button"
              onClick={() => onClose?.()}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors"
              aria-label="Close dialog"
            >
              <MaterialIcon name="close" size={20} />
            </button>
          )}
        </div>

        {/* Body — the panel does not scroll, the body does. */}
        <div className="p-md flex-1 overflow-y-auto min-h-0">{children}</div>

        {/* Footer — omitted entirely when no footer content is passed. */}
        {footer !== undefined && (
          <div className="p-md border-t border-outline-variant shrink-0">{footer}</div>
        )}
      </div>
    </div>
  )
}
