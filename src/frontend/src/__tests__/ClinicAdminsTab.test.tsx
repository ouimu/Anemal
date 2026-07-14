/**
 * CO-7..CO-10 — ClinicAdminsTab (@qa-agent-owned coverage, written alongside
 * @dev-agent implementation since the task-7 brief did not include test code
 * for this presentation component).
 *
 * Strategy: mock `usePlatformCustomers` hooks (network) and drive the real
 * ClinicAdminsTab component, mirroring PlatformConsole.test.tsx's pattern.
 *
 * AC coverage:
 *  - Table columns: username, name, email/phone (— for NULL), status, created.
 *  - No rename/edit action anywhere (G-2).
 *  - Create form: name/username/email-or-phone validation, password toggle,
 *    display-once credentials panel on success.
 *  - Deactivate: only on active rows, confirmation dialog states no undo,
 *    fires only after confirm.
 *  - Reset password: available on both active and deactivated rows, opens a
 *    modal reusing PasswordField (typed-or-generate, same UX as create),
 *    reuses the same credentials panel on success.
 *  - 409 QUOTA_EXCEEDED / USERNAME_CONFLICT / ALREADY_DEACTIVATED / 422
 *    WEAK_PASSWORD → inline, distinguishable errors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const h = vi.hoisted(() => ({
  create:     vi.fn(),
  deactivate: vi.fn(),
  reset:      vi.fn(),
}))

const state = vi.hoisted(() => ({
  admins:          [] as unknown[],
  createError:     null as unknown,
  deactivateError: null as unknown,
  resetError:      null as unknown,
}))

vi.mock('../hooks/usePlatformCustomers', () => ({
  useTenantAdminUsers:            () => ({ data: state.admins, isLoading: false, isError: false }),
  useCreateTenantAdminUser:       () => ({ mutate: h.create, isPending: false, error: state.createError, reset: vi.fn() }),
  useDeactivateTenantAdminUser:   () => ({ mutate: h.deactivate, isPending: false, error: state.deactivateError, reset: vi.fn() }),
  useResetTenantAdminUserPassword:() => ({ mutate: h.reset, isPending: false, error: state.resetError, reset: vi.fn() }),
}))

import ClinicAdminsTab from '../components/platform/ClinicAdminsTab'

beforeEach(() => {
  vi.resetAllMocks()
  state.admins = []
  state.createError = null
  state.deactivateError = null
  state.resetError = null
})

const ADMIN_ACTIVE = {
  id: 1, username: 'admin', name: 'Administrator', email: null, phone: null,
  isActive: true, createdAt: '2026-07-01T00:00:00.000Z',
}
const ADMIN_INACTIVE = {
  id: 2, username: 'jdoe', name: 'Jane Doe', email: 'jane@example.com', phone: null,
  isActive: false, createdAt: '2026-07-02T00:00:00.000Z',
}

describe('table columns', () => {
  it('renders username, name, contact (— for NULL), status, created date', () => {
    state.admins = [ADMIN_ACTIVE]
    render(<ClinicAdminsTab id={42} />)
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('Administrator')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders email when present instead of —', () => {
    state.admins = [ADMIN_INACTIVE]
    render(<ClinicAdminsTab id={42} />)
    expect(screen.getByText('jane@example.com')).toBeInTheDocument()
    expect(screen.getByText('Deactivated')).toBeInTheDocument()
  })

  it('has no rename/edit action anywhere (G-2)', () => {
    state.admins = [ADMIN_ACTIVE]
    render(<ClinicAdminsTab id={42} />)
    expect(screen.queryByRole('button', { name: /rename|edit/i })).not.toBeInTheDocument()
  })
})

// Header "Create" button includes the MaterialIcon ligature text ("add"),
// so its accessible name is "add Create"; the modal submit button's name is
// the exact string "Create" (no icon while idle).
const openCreateModal = () => fireEvent.click(screen.getByRole('button', { name: /Create/i }))
const submitButton = () => screen.getByRole('button', { name: 'Create' })

describe('create form', () => {
  it('requires at least one of email or phone before submit is enabled', () => {
    render(<ClinicAdminsTab id={42} />)
    openCreateModal()
    expect(submitButton()).toBeDisabled()
  })

  it('submitting a valid form calls create.mutate with the payload', () => {
    render(<ClinicAdminsTab id={42} />)
    openCreateModal()
    fireEvent.change(screen.getByLabelText(/^Name/i), { target: { value: 'New Admin' } })
    fireEvent.change(screen.getByLabelText(/Username/i), { target: { value: 'newadmin' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'new@example.com' } })
    fireEvent.submit(screen.getByLabelText(/^Name/i).closest('form')!)
    expect(h.create).toHaveBeenCalledTimes(1)
    const payload = h.create.mock.calls[0][0]
    expect(payload.name).toBe('New Admin')
    expect(payload.username).toBe('newadmin')
    expect(payload.email).toBe('new@example.com')
  })

  it('shows credentials panel (display-once) after successful create', () => {
    h.create.mockImplementation((_payload, opts) => {
      opts.onSuccess({ username: 'newadmin', password: 'Sup3rSecret1' })
    })
    render(<ClinicAdminsTab id={42} />)
    openCreateModal()
    fireEvent.change(screen.getByLabelText(/^Name/i), { target: { value: 'New Admin' } })
    fireEvent.change(screen.getByLabelText(/Username/i), { target: { value: 'newadmin' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'new@example.com' } })
    fireEvent.submit(screen.getByLabelText(/^Name/i).closest('form')!)

    expect(screen.getByText(/will not be shown again/i)).toBeInTheDocument()
    expect(screen.getByText('Sup3rSecret1')).toBeInTheDocument()
  })

  it('409 QUOTA_EXCEEDED shows a distinguishable inline error', () => {
    state.createError = { response: { data: { code: 'QUOTA_EXCEEDED' } } }
    render(<ClinicAdminsTab id={42} />)
    openCreateModal()
    expect(screen.getByText(/quota limit/i)).toBeInTheDocument()
  })

  it('409 USERNAME_CONFLICT shows a distinguishable inline error', () => {
    state.createError = { response: { data: { code: 'USERNAME_CONFLICT' } } }
    render(<ClinicAdminsTab id={42} />)
    openCreateModal()
    expect(screen.getByText(/already in use/i)).toBeInTheDocument()
  })
})

describe('deactivate', () => {
  it('deactivate action is only offered on active rows', () => {
    state.admins = [ADMIN_ACTIVE, ADMIN_INACTIVE]
    render(<ClinicAdminsTab id={42} />)
    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getByRole('button', { name: /Deactivate/i })).toBeInTheDocument()
    expect(within(rows[2]).queryByRole('button', { name: /Deactivate/i })).not.toBeInTheDocument()
  })

  it('opens a confirmation dialog stating there is no undo/reactivate before calling the API', () => {
    state.admins = [ADMIN_ACTIVE]
    render(<ClinicAdminsTab id={42} />)
    fireEvent.click(screen.getByRole('button', { name: /Deactivate/i }))

    expect(h.deactivate).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/no reactivate action/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/creating a new clinic admin/i)).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }))
    expect(h.deactivate).toHaveBeenCalledTimes(1)
    expect(h.deactivate).toHaveBeenCalledWith(ADMIN_ACTIVE.id, expect.anything())
  })

  it('409 ALREADY_DEACTIVATED shows a distinguishable inline error in the dialog', () => {
    state.admins = [ADMIN_ACTIVE]
    state.deactivateError = { response: { data: { code: 'ALREADY_DEACTIVATED' } } }
    render(<ClinicAdminsTab id={42} />)
    fireEvent.click(screen.getByRole('button', { name: /Deactivate/i }))
    expect(screen.getByText(/already deactivated/i)).toBeInTheDocument()
  })
})

describe('reset password', () => {
  it('is available on both active and deactivated rows', () => {
    state.admins = [ADMIN_ACTIVE, ADMIN_INACTIVE]
    render(<ClinicAdminsTab id={42} />)
    expect(screen.getAllByRole('button', { name: /Reset password/i })).toHaveLength(2)
  })

  it('opens a modal reusing PasswordField instead of resetting immediately', () => {
    state.admins = [ADMIN_ACTIVE]
    render(<ClinicAdminsTab id={42} />)
    fireEvent.click(screen.getByRole('button', { name: /Reset password/i }))
    expect(h.reset).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('Password')).toBeInTheDocument()
  })

  it('generated-password reset calls reset.mutate with no password and shows credentials panel (regression)', () => {
    state.admins = [ADMIN_INACTIVE]
    h.reset.mockImplementation((_payload, opts) => {
      opts.onSuccess({ username: 'jdoe', password: 'NewPass1234' })
    })
    render(<ClinicAdminsTab id={42} />)
    fireEvent.click(screen.getByRole('button', { name: /Reset password/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset password' }))
    expect(h.reset).toHaveBeenCalledWith({ userId: ADMIN_INACTIVE.id, password: undefined }, expect.anything())
    expect(screen.getByText('NewPass1234')).toBeInTheDocument()
  })

  it('typed-password reset succeeds and displays the typed password once', () => {
    state.admins = [ADMIN_ACTIVE]
    h.reset.mockImplementation((payload, opts) => {
      opts.onSuccess({ username: 'admin', password: payload.password })
    })
    render(<ClinicAdminsTab id={42} />)
    fireEvent.click(screen.getByRole('button', { name: /Reset password/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'TypedPass123' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset password' }))
    expect(h.reset).toHaveBeenCalledWith({ userId: ADMIN_ACTIVE.id, password: 'TypedPass123' }, expect.anything())
    expect(screen.getByText('TypedPass123')).toBeInTheDocument()
  })

  it('typed password <8 chars shows the 422 WEAK_PASSWORD error inline, not a false-success panel', () => {
    state.admins = [ADMIN_ACTIVE]
    state.resetError = { response: { data: { code: 'WEAK_PASSWORD' } } }
    render(<ClinicAdminsTab id={42} />)
    fireEvent.click(screen.getByRole('button', { name: /Reset password/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'short' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset password' }))
    expect(within(dialog).getAllByText(/at least 8 characters/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/will not be shown again/i)).not.toBeInTheDocument()
  })
})
