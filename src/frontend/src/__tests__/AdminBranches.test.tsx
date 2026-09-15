import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import AdminBranches from '../views/admin/AdminBranches'

const branches = [
  { id: 1, name: 'Main Branch', phone: null, email: null, address: null, isActive: true },
]

const users = [
  { id: 1, name: 'Dr. System', role: { key: 'doctor' } },
  { id: 2, name: 'Dr. Cloned Senior Vet', role: { key: 'tenant_1_senior_vet' } },
  { id: 3, name: 'Front Desk', role: { key: 'clinic_staff' } },
]

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) =>
    queryKey[0] === 'branches'
      ? { data: branches, isLoading: false }
      : queryKey[0] === 'shifts'
      ? { data: [], isLoading: false }
      : { data: users, isLoading: false },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

describe('AdminBranches — doctor picker key-match (ADR-0019)', () => {
  it('lists the system doctor in the Doctor Shifts picker (role-object shape, key match)', () => {
    render(<AdminBranches />)
    fireEvent.click(screen.getByText('Main Branch'))
    // ADR-0019: key-match only — the plain "doctor" system role is bookable
    // for branch shift assignment; a cloned custom role is not.
    expect(screen.getByText('Dr. System')).toBeInTheDocument()
    expect(screen.queryByText('Dr. Cloned Senior Vet')).toBeNull()
    expect(screen.queryByText('Front Desk')).toBeNull()
  })
})

// Characterization tests for the BranchForm modal — originally written at
// 01b8348 against the (reverted) Phase 6 PlatformModal migration, kept here
// as the MODAL-2 reference per docs/superpowers/plans/2026-09-11-modal-
// consolidation.md. Updated to the Dialog contract frozen in MODAL-1 /
// docs/adr/0027-shared-modal-dismissal-policy-and-plane-neutrality.md:
// role="dialog" now sits on the panel (not the backdrop — the F-9 fix), the
// close button's accessible name is "Close dialog" (Dialog.tsx), and the
// backdrop is the dialog panel's parent element rather than the dialog
// element itself, so backdrop-click is exercised via that parent.
describe('AdminBranches — BranchForm modal (Dialog migration, MODAL-2)', () => {
  it('is closed by default and opens on "New Branch"', () => {
    render(<AdminBranches />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('New Branch'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows "New Branch" title and empty fields when creating', () => {
    render(<AdminBranches />)
    fireEvent.click(screen.getByText('New Branch'))
    expect(screen.getAllByText('New Branch').length).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText('Main Branch')).toHaveValue('')
  })

  it('closes on the header close (X) button', () => {
    render(<AdminBranches />)
    fireEvent.click(screen.getByText('New Branch'))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByLabelText('Close dialog'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on the Cancel button', () => {
    render(<AdminBranches />)
    fireEvent.click(screen.getByText('New Branch'))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText('Cancel'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes when the backdrop is clicked (dismissal="dismissible" default)', () => {
    render(<AdminBranches />)
    fireEvent.click(screen.getByText('New Branch'))
    const dialog = screen.getByRole('dialog')
    // Per MODAL-1 (F-9 fix), role="dialog" sits on the panel, not the
    // backdrop — the backdrop is the panel's parent element.
    fireEvent.click(dialog.parentElement as HTMLElement)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not close when clicking inside the form panel (backdrop-click stopPropagation preserved)', () => {
    render(<AdminBranches />)
    fireEvent.click(screen.getByText('New Branch'))
    fireEvent.click(screen.getByPlaceholderText('Main Branch'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    render(<AdminBranches />)
    fireEvent.click(screen.getByText('New Branch'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the form via the row-edit action with the branch pre-filled', () => {
    render(<AdminBranches />)
    fireEvent.click(screen.getByText('Main Branch'))
    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getAllByText('Edit Branch').length).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText('Main Branch')).toHaveValue('Main Branch')
  })
})
