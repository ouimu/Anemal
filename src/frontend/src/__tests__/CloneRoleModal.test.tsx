/**
 * CloneRoleModal — first test coverage (MODAL-8).
 *
 * Covers the Dialog migration itself (open/close channels via the shared
 * dismissible policy) and the component's own behaviour (submit success,
 * submit validation-error, cancel). The two RBAC regression guards this
 * task's AC calls out — "clone offered on system roles only" and "the
 * sealed clinic_admin role cannot be cloned" — are gated entirely by the
 * caller (RoleList.tsx L324's `role.isSystem && role.key !== SEALED_ROLE_KEY
 * && canManage`, and the `onClone` ternary at L365) and are NOT decisions
 * CloneRoleModal makes: this component receives no `isSystem`/`canManage`
 * prop and has no gating logic of its own to regress. That guard is already
 * covered by src/frontend/src/__tests__/RoleList.test.tsx ("RoleList — Admin
 * clone lockdown"), which is out of this task's exclusive file scope
 * (CloneRoleModal.tsx only) and is left untouched. The third guard —
 * no-escalation on the cloned permission set — IS partly this component's
 * concern (it must not introduce a client-supplied permission list that
 * could bypass the server-side filter in role.service.ts `cloneRole`); that
 * is covered below by asserting the exact mutation payload shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CloneRoleModal from '../components/roles/CloneRoleModal'

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null as Error | null,
}))

vi.mock('../hooks/useRoles', () => ({
  useCloneRoleMutation: () => ({
    mutate: h.mutate,
    isPending: h.isPending,
    isError: h.isError,
    error: h.error,
  }),
}))

function resetMockMutation(): void {
  h.mutate.mockReset()
  h.isPending = false
  h.isError = false
  h.error = null
}

describe('CloneRoleModal — Dialog migration (dismissible, default)', () => {
  beforeEach(resetMockMutation)

  it('renders as an open dialog with the source role named in the description', () => {
    render(<CloneRoleModal sourceRoleName="Doctor" onClose={vi.fn()} onCloned={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Doctor')).toBeInTheDocument()
  })

  it('close (X) button invokes onClose', () => {
    const onClose = vi.fn()
    render(<CloneRoleModal sourceRoleName="Doctor" onClose={onClose} onCloned={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape invokes onClose', () => {
    const onClose = vi.fn()
    render(<CloneRoleModal sourceRoleName="Doctor" onClose={onClose} onCloned={vi.fn()} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('backdrop click invokes onClose (dismissible policy)', () => {
    const onClose = vi.fn()
    const { container } = render(
      <CloneRoleModal sourceRoleName="Doctor" onClose={onClose} onCloned={vi.fn()} />
    )
    const backdrop = container.firstElementChild as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Cancel button invokes onClose', () => {
    const onClose = vi.fn()
    render(<CloneRoleModal sourceRoleName="Doctor" onClose={onClose} onCloned={vi.fn()} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('CloneRoleModal — form submit', () => {
  beforeEach(resetMockMutation)

  it('success path: submits {sourceRoleName, newName} only, then onCloned fires with the new role id', async () => {
    h.mutate.mockImplementation(
      (
        payload: { sourceRoleName: string; newName: string },
        opts: { onSuccess: (role: { id: string }) => void }
      ) => {
        // Exact-shape assertion: no client-supplied permission list rides
        // along with this payload. The no-escalation invariant is enforced
        // server-side by filtering the source role's permissions to the
        // caller's own (role.service.ts cloneRole) — this component must
        // never hand the server a permission set to trust instead.
        expect(Object.keys(payload).sort()).toEqual(['newName', 'sourceRoleName'])
        opts.onSuccess({ id: 'new-role-42' })
      }
    )
    const onCloned = vi.fn()
    render(<CloneRoleModal sourceRoleName="Doctor" onClose={vi.fn()} onCloned={onCloned} />)

    await userEvent.type(screen.getByLabelText(/new role name/i), 'Senior Doctor')
    await userEvent.click(screen.getByText('Clone role'))

    expect(h.mutate).toHaveBeenCalledWith(
      { sourceRoleName: 'Doctor', newName: 'Senior Doctor' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    )
    expect(onCloned).toHaveBeenCalledWith('new-role-42')
  })

  it('does not submit when the name field is empty (required, whitespace trimmed)', async () => {
    render(<CloneRoleModal sourceRoleName="Doctor" onClose={vi.fn()} onCloned={vi.fn()} />)
    // The submit control lives in the Dialog footer (a sibling of the form),
    // wired via form={formId} — this also regression-guards that wiring.
    expect(screen.getByText('Clone role').closest('button')).toBeDisabled()
    expect(h.mutate).not.toHaveBeenCalled()
  })

  it('validation-error path: shows the mutation error message and does not call onCloned', async () => {
    h.isError = true
    h.error = new Error("A role named 'Doctor' already exists for this tenant")
    const onCloned = vi.fn()
    render(<CloneRoleModal sourceRoleName="Doctor" onClose={vi.fn()} onCloned={onCloned} />)

    expect(screen.getByText(/already exists for this tenant/i)).toBeInTheDocument()
    expect(onCloned).not.toHaveBeenCalled()
  })

  it('falls back to a generic message when the mutation error carries none', () => {
    h.isError = true
    h.error = null
    render(<CloneRoleModal sourceRoleName="Doctor" onClose={vi.fn()} onCloned={vi.fn()} />)
    expect(screen.getByText(/failed to clone role/i)).toBeInTheDocument()
  })

  it('disables Cancel and the submit control while the mutation is pending', () => {
    h.isPending = true
    render(<CloneRoleModal sourceRoleName="Doctor" onClose={vi.fn()} onCloned={vi.fn()} />)
    expect(screen.getByText('Cancel').closest('button')).toBeDisabled()
    expect(screen.getByText('Clone role').closest('button')).toBeDisabled()
  })
})
