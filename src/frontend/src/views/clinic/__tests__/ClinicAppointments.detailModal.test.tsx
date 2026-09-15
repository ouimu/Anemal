/**
 * ClinicAppointments — AppointmentDetail permission gating (MODAL-4).
 *
 * Added at Step 7 by @qa-agent. MODAL-4 carries this negative acceptance
 * criterion:
 *
 *   "doctor holds appointments.view only: the detail modal opens read-only for
 *    doctor — in-modal status-change and booking controls are either
 *    hidden/disabled or, if attempted, the underlying appointments.edit /
 *    appointments.create call returns 403 from the server"
 *
 * The implementation satisfies it (`ClinicAppointments.tsx` gates the whole
 * Dialog footer behind `hasPermission('appointments.edit')`, so a viewer
 * without the code gets no status-change affordance at all). Nothing asserted
 * it, though: the only render of this component in the suite before this file
 * mocked `hasPermission: () => true`, so the DENIED branch was never executed.
 * Deleting the `canEditStatus ?` ternary left the whole suite green — the exact
 * non-falsifiable-criterion class ADR-0026 and ADR-0027 exist to close.
 *
 * Authorization note (BA F-3 / R4): the authorization boundary is the server.
 * `appointment.routes.ts` declares `requirePlane('clinic')` +
 * `appointments.view` on the GETs, `appointments.edit` on
 * `PUT /:id/status` and `appointments.create` on the POSTs; the route guard
 * `RequirePermission perm="appointments.view"` is asserted by
 * `__tests__/App.routeManifest.test.ts`. What is asserted below is only that
 * the migration onto Dialog introduced no client-side bypass and that the
 * read-only affordance is real. Nothing here asserts screen-unreachability by
 * legacy role string.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/** One appointment scheduled today at 09:00, matching the Appointment shape. */
function appointmentFixture() {
  const scheduledAt = new Date()
  scheduledAt.setHours(9, 0, 0, 0)
  return {
    id: 1,
    petId: 1,
    doctorId: 1,
    scheduledAt: scheduledAt.toISOString(),
    durationMin: 30,
    status: 'scheduled',
    reason: 'Annual check-up',
    pet: { id: 1, name: 'Rex', species: 'Dog' },
    doctor: { id: 1, name: 'Dr. Smith' },
  }
}

const state = vi.hoisted(() => ({ permissions: [] as string[] }))
// Typed with its call signature so `h.put.mock.calls[0][0]` (the request URL)
// is reachable under `tsc --noEmit`; an argument-less vi.fn() infers a
// zero-length tuple for `calls[n]`.
const h = vi.hoisted(() => ({
  put: vi.fn((_url: string, _body?: unknown) => Promise.resolve({ data: { success: true } })),
}))

vi.mock('../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { branchId: number; permissions: string[]; hasPermission: (p: string) => boolean }) => unknown) =>
    selector({
      branchId: 1,
      permissions: state.permissions,
      hasPermission: (p: string) => state.permissions.includes(p),
    }),
}))

vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { data: [] } })),
    post: vi.fn(() => Promise.resolve({ data: { success: true } })),
    put: h.put,
    delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
  },
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      if (queryKey[0] === 'appointments') {
        if (queryKey[1] === 'doctors') return { data: [{ id: 1, name: 'Dr. Smith' }], isLoading: false }
        if (queryKey[1] === 'month') return { data: [], isLoading: false }
        return { data: [appointmentFixture()], isLoading: false }
      }
      return { data: [], isLoading: false, isError: false }
    },
    useMutation: ({ mutationFn }: { mutationFn?: (vars: unknown) => unknown }) => ({
      mutate: (vars: unknown) => mutationFn?.(vars),
      mutateAsync: (vars: unknown) => Promise.resolve(mutationFn?.(vars)),
      isPending: false,
    }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  }
})

import ClinicAppointments from '../ClinicAppointments'

function openDetail(): HTMLElement {
  render(
    <MemoryRouter>
      <ClinicAppointments />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText('Rex'))
  return screen.getByRole('dialog')
}

beforeEach(() => {
  vi.clearAllMocks()
  state.permissions = ['appointments.view', 'appointments.edit', 'appointments.create']
})

describe('ClinicAppointments — AppointmentDetail with appointments.edit (clinic_staff / clinic_admin)', () => {
  it('renders the status-change footer and every status option', () => {
    const dialog = openDetail()
    expect(within(dialog).getByText('Update Status')).toBeInTheDocument()
    for (const label of ['scheduled', 'arrived', 'in progress', 'completed', 'cancelled', 'no show']) {
      expect(within(dialog).getByText(label)).toBeInTheDocument()
    }
  })

  it('choosing a status issues the appointments.edit call and closes the dialog', () => {
    const dialog = openDetail()
    fireEvent.click(within(dialog).getByText('completed'))

    expect(h.put).toHaveBeenCalledTimes(1)
    expect(h.put.mock.calls[0][0]).toMatch(/\/appointments\/1\/status$/)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('ClinicAppointments — AppointmentDetail for doctor (appointments.view only, read-only)', () => {
  beforeEach(() => {
    state.permissions = ['appointments.view']
  })

  it('the detail dialog still opens — view is not blocked', () => {
    const dialog = openDetail()
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Rex' })).toBeInTheDocument()
    expect(within(dialog).getByText(/Dr\. Smith/)).toBeInTheDocument()
  })

  // Deny-by-default regression guard. `footer` is `undefined` without
  // appointments.edit, so Dialog renders no footer element at all.
  it('renders NO status-change affordance — no "Update Status" row, no status buttons', () => {
    const dialog = openDetail()
    expect(within(dialog).queryByText('Update Status')).toBeNull()
    for (const label of ['scheduled', 'arrived', 'in progress', 'completed', 'cancelled', 'no show']) {
      expect(within(dialog).queryByText(label)).toBeNull()
    }
  })

  it('issues no appointments.edit call while the read-only dialog is open', () => {
    openDetail()
    expect(h.put).not.toHaveBeenCalled()
  })

  it('read-only does not break dismissal — the close (X) control still works', () => {
    const dialog = openDetail()
    fireEvent.click(within(dialog).getByLabelText('Close dialog'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.put).not.toHaveBeenCalled()
  })

  it('read-only does not break dismissal — Escape still closes (dismissible default)', () => {
    openDetail()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.put).not.toHaveBeenCalled()
  })
})
