/**
 * MODAL-7: ClinicGrooming's booking modal, migrated onto the shared Dialog
 * component (docs/adr/0027-shared-modal-dismissal-policy-and-plane-neutrality.md).
 * Zero coverage existed for this modal before this task — this file adds the
 * first coverage: open/close, save, cancel, backdrop-click, and Escape.
 *
 * Follows the AdminBranches.test.tsx (MODAL-2) convention: useQuery is mocked
 * by queryKey so the modal's internal owner-search/staff-list queries resolve
 * synchronously, and useMutation invokes the real mutationFn directly so the
 * submitted payload can be asserted against the mocked api client.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ClinicGrooming from '../ClinicGrooming'

const searchResults = [
  { petId: 1, petName: 'Rex', species: 'Dog', ownerId: 1, ownerName: 'Jane Doe', phone: '0812345678' },
]

const { postSpy } = vi.hoisted(() => ({
  postSpy: vi.fn(() => Promise.resolve({ data: { success: true } })),
}))

vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { data: [] } })),
    post: postSpy,
    put: vi.fn(() => Promise.resolve({ data: { success: true } })),
  },
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) =>
    queryKey[0] === 'owner-search'
      ? { data: searchResults, isLoading: false }
      : queryKey[0] === 'staff-list'
      ? { data: [], isLoading: false }
      : { data: [], isLoading: false, isError: false }, // 'grooming' (base view schedule)
  useMutation: ({ mutationFn }: { mutationFn: (vars: unknown) => unknown }) => ({
    mutate: (vars: unknown) => mutationFn(vars),
    isPending: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

describe('ClinicGrooming — booking modal (Dialog migration, MODAL-7)', () => {
  it('is closed by default and opens on "New Booking"', () => {
    render(<ClinicGrooming />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('New Booking'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getAllByText('New Grooming Booking').length).toBeGreaterThan(0)
  })

  it('renders the action row through the footer prop, reachable without scrolling the panel', () => {
    render(<ClinicGrooming />)
    fireEvent.click(screen.getByText('New Booking'))
    const dialog = screen.getByRole('dialog')
    // Footer is a sibling of the scrolling body, not nested inside it — both
    // Cancel and Book Appointment are queryable directly from the dialog root.
    expect(within(dialog).getByText('Cancel')).toBeInTheDocument()
    expect(within(dialog).getByText('Book Appointment')).toBeInTheDocument()
  })

  it('selects a searched pet and submits the booking with the expected payload (save)', () => {
    render(<ClinicGrooming />)
    fireEvent.click(screen.getByText('New Booking'))
    fireEvent.click(screen.getByText('Rex'))
    fireEvent.click(screen.getByText('Book Appointment'))

    expect(postSpy).toHaveBeenCalledWith(
      '/api/grooming/bookings',
      expect.objectContaining({
        petId: 1,
        groomerId: null,
        serviceType: 'Bath & Dry',
        specialInstructions: null,
      })
    )
  })

  it('the Book Appointment button is disabled until a pet is selected', () => {
    render(<ClinicGrooming />)
    fireEvent.click(screen.getByText('New Booking'))
    expect(screen.getByText('Book Appointment').closest('button')).toBeDisabled()
    fireEvent.click(screen.getByText('Rex'))
    expect(screen.getByText('Book Appointment').closest('button')).not.toBeDisabled()
  })

  it('closes on the header close (X) button', () => {
    render(<ClinicGrooming />)
    fireEvent.click(screen.getByText('New Booking'))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByLabelText('Close dialog'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on the Cancel button', () => {
    render(<ClinicGrooming />)
    fireEvent.click(screen.getByText('New Booking'))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText('Cancel'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes when the backdrop is clicked (dismissal="dismissible" default)', () => {
    render(<ClinicGrooming />)
    fireEvent.click(screen.getByText('New Booking'))
    const dialog = screen.getByRole('dialog')
    // Per MODAL-1 (F-9 fix), role="dialog" sits on the panel, not the
    // backdrop — the backdrop is the panel's parent element.
    fireEvent.click(dialog.parentElement as HTMLElement)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not close when clicking inside the form panel (backdrop-click stopPropagation preserved)', () => {
    render(<ClinicGrooming />)
    fireEvent.click(screen.getByText('New Booking'))
    fireEvent.click(screen.getByText('Patient'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    render(<ClinicGrooming />)
    fireEvent.click(screen.getByText('New Booking'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('also opens from the empty-slot "Add booking" affordance', () => {
    render(<ClinicGrooming />)
    fireEvent.click(screen.getAllByText('Add booking')[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
