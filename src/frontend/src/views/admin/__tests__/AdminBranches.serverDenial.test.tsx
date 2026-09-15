/**
 * AdminBranches — BranchForm server-denial handling (MODAL-2).
 *
 * Added at Step 7 by @qa-agent. MODAL-2 carries this negative acceptance
 * criterion, which nothing in the branch asserted:
 *
 *   "A role holding clinic.branch.view but not clinic.branch.manage can open
 *    the form but Save returns 403 (server already enforces this; verify the
 *    migration introduced no client-side bypass)"
 *
 * `AdminBranches.tsx` carries no client-side permission gate — by design and
 * unchanged by this migration (the Step 7 diff audit found zero removed
 * `Can`/`hasPermission`/`perm=` lines in this file). The authorization
 * boundary is therefore entirely the server: `branch.routes.ts` declares
 * `requirePlane('clinic')` + `clinic.branch.view` on the GETs and
 * `clinic.branch.manage` on `POST /` and `PUT /:id`, and the route guard
 * `RequirePermission perm="clinic.branch.view"` is asserted by
 * `__tests__/App.routeManifest.test.ts` ('branches => clinic.branch.view').
 *
 * What "no client-side bypass" means concretely for a component with no
 * client-side gate: the save path must go through the server and must treat a
 * denial as a denial. `BranchForm` closes the dialog and invalidates the
 * branch list from `onSuccess` only. If anyone were to move that close to an
 * unconditional/optimistic path — the ordinary way this regresses — a
 * `clinic.branch.manage` denial would present to the user as a saved branch
 * that does not exist on the server. These assertions fail in exactly that
 * case, in both directions (the success test pins the close, the 403 test
 * pins the non-close).
 *
 * Nothing here asserts screen-unreachability by legacy role string (BA F-3 /
 * R4) — `AdminLayout.tsx:36`'s stale `role !== 'admin'` gate is a known
 * pre-existing defect, out of scope for this branch, and must not be
 * certified as intended behaviour by a test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const branches = [
  { id: 1, name: 'Main Branch', phone: null, email: null, address: null, isActive: true },
]

/** Forbidden envelope shaped exactly as the branch API returns it under a
 *  `requirePermission('clinic.branch.manage')` denial. */
function forbidden(): unknown {
  return { response: { status: 403, data: { error: 'Missing permission: clinic.branch.manage' } } }
}

const h = vi.hoisted(() => ({
  post: vi.fn((_url: string, _body?: unknown) => Promise.resolve({ data: { success: true } })),
  put: vi.fn((_url: string, _body?: unknown) => Promise.resolve({ data: { success: true } })),
  invalidateQueries: vi.fn(),
}))

vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { data: [] } })),
    post: h.post,
    put: h.put,
    delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
  },
}))

/**
 * Mutation shim with real success/failure semantics — the existing
 * `__tests__/AdminBranches.test.tsx` stubs `useMutation` to an inert
 * `{ mutate: vi.fn() }`, which cannot express a rejected mutation at all.
 * Here `mutate` actually runs the component's own `mutationFn`, calls
 * `onSuccess` only on resolution, and surfaces a rejection through
 * `isError`/`error` the way TanStack Query does.
 */
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  const React = await import('react')
  return {
    ...actual,
    useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      if (queryKey[0] === 'branches') return { data: branches, isLoading: false }
      return { data: [], isLoading: false }
    },
    useMutation: ({
      mutationFn,
      onSuccess,
    }: {
      mutationFn?: (vars: unknown) => unknown
      onSuccess?: (data: unknown) => void
    }) => {
      const [error, setError] = React.useState<unknown>(null)
      return {
        mutate: (vars: unknown) => {
          setError(null)
          void Promise.resolve()
            .then(() => mutationFn?.(vars))
            .then(
              (data) => onSuccess?.(data),
              (err: unknown) => setError(err),
            )
        },
        isPending: false,
        isError: error !== null,
        error,
      }
    },
    useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
  }
})

import AdminBranches from '../AdminBranches'

/** Opens the create form and fills the one required field. */
function openAndFillNewBranch(): HTMLElement {
  render(<AdminBranches />)
  fireEvent.click(screen.getByText('New Branch'))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByPlaceholderText('Main Branch'), {
    target: { value: 'Riverside Branch' },
  })
  return dialog
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AdminBranches — BranchForm under a clinic.branch.manage denial (MODAL-2 negative AC)', () => {
  it('the form still opens for a clinic.branch.view holder — read access is not blocked client-side', () => {
    render(<AdminBranches />)
    fireEvent.click(screen.getByText('New Branch'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(h.post).not.toHaveBeenCalled()
  })

  it('MODAL-2-REGR: a 403 on Save keeps the dialog open and surfaces the server error — no optimistic close', async () => {
    h.post.mockRejectedValueOnce(forbidden())
    const dialog = openAndFillNewBranch()

    fireEvent.click(within(dialog).getByText('Create Branch'))

    await waitFor(() => {
      expect(screen.getByText('Missing permission: clinic.branch.manage')).toBeInTheDocument()
    })
    // The denial did not present as a save: the dialog is still open, and the
    // branch list was never invalidated (which would imply a write landed).
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(h.invalidateQueries).not.toHaveBeenCalled()
  })

  it('MODAL-2-REGR: the denied Save goes to the server — no local write bypasses clinic.branch.manage', async () => {
    h.post.mockRejectedValueOnce(forbidden())
    const dialog = openAndFillNewBranch()

    fireEvent.click(within(dialog).getByText('Create Branch'))

    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1))
    expect(h.post.mock.calls[0][0]).toBe('/api/branches')
    expect(h.post.mock.calls[0][1]).toMatchObject({ name: 'Riverside Branch' })
  })

  it('MODAL-2-REGR: the edit path is denied the same way — PUT /:id 403 keeps the dialog open', async () => {
    h.put.mockRejectedValueOnce(forbidden())
    render(<AdminBranches />)
    fireEvent.click(screen.getByText('Main Branch'))
    fireEvent.click(screen.getByText('Edit'))
    const dialog = screen.getByRole('dialog')

    fireEvent.click(within(dialog).getByText('Save Changes'))

    await waitFor(() => expect(h.put).toHaveBeenCalledTimes(1))
    expect(h.put.mock.calls[0][0]).toBe('/api/branches/1')
    expect(screen.getByText('Missing permission: clinic.branch.manage')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(h.invalidateQueries).not.toHaveBeenCalled()
  })

  it('counterpart: a granted Save (clinic.branch.manage held) closes the dialog and invalidates the list', async () => {
    const dialog = openAndFillNewBranch()

    fireEvent.click(within(dialog).getByText('Create Branch'))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(h.post).toHaveBeenCalledTimes(1)
    expect(h.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['branches'] })
  })
})
