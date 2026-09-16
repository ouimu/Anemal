// src/frontend/src/__tests__/ClinicInpatient.characterization.test.tsx
//
// Phase 7 / Lane D — Gate 0 characterization tests for ClinicInpatient.tsx.
// This file is ADDITIVE: it locks down CURRENT behaviour (including behaviour
// that looks wrong) in the six gaps identified by
// docs/superpowers/plans/2026-09-16-phase7-god-components-arch-audit.md §4 —
// modal close paths, mutual exclusion, discharge flow, board-level states,
// save-closes-modal, and care-wizard back navigation. It exists so the
// upcoming three-nullable-states -> one-discriminated-union refactor (§2.1 of
// the same audit) has a baseline to prove itself against.
//
// ClinicInpatient.test.tsx's 29 test names (post-e78b5d4, the mutual-exclusion
// Lane B fix rebased in underneath this branch) must survive into the Gate 4
// test-set-equality comparison verbatim. This file adds a second, independent
// suite using the exact same harness shape (real component mount, real `api`
// mock, QueryClientProvider) so fetch-triggered state changes are genuinely
// exercised, not hidden behind a `@tanstack/react-query` mock.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const getMock = vi.fn()
const postMock = vi.fn().mockResolvedValue({ data: { data: { id: 501, status: 'admitted' } } })
const putMock = vi.fn().mockResolvedValue({ data: { data: { id: 500, status: 'admitted' } } })
const deleteMock = vi.fn().mockResolvedValue({ status: 204 })

vi.mock('../utils/api', () => ({
  default: {
    get: (...args: unknown[]) => getMock(...(args as [string, unknown])),
    post: (...args: unknown[]) => postMock(...args),
    put: (...args: unknown[]) => putMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}))

import ClinicInpatient, { AdmitModal } from '../views/clinic/ClinicInpatient'

const doctors = [{ id: 7, name: 'Dr. Somchai' }]

const activeAdmission = {
  id: 500, petId: 42, cageNo: 'B-2', status: 'admitted', reason: 'Post-op recovery',
  admittedAt: '2026-07-01T00:00:00.000Z', doctorInCharge: 7, dailyRate: 400, notes: null,
  _count: { careLogs: 0 },
  pet: { id: 42, name: 'Rex', species: 'canine' },
}

const dischargedAdmission = { ...activeAdmission, id: 502, status: 'discharged' }

const secondAdmission = {
  id: 600, petId: 99, cageNo: 'C-1', status: 'admitted', reason: 'Check-up',
  admittedAt: '2026-07-02T00:00:00.000Z', doctorInCharge: null, dailyRate: 100, notes: null,
  _count: { careLogs: 0 },
  pet: { id: 99, name: 'Milo', species: 'feline' },
}

// Stubs both list endpoints used on every render, plus the per-hospitalization
// detail endpoint the Care History modal fetches on open — returns each listed
// hospitalization with an empty careLogs array unless overridden via detailById.
function stubGet(list: { id: number }[], detailById: Record<number, unknown[]> = {}) {
  getMock.mockImplementation((url: string) => {
    if (url === '/api/hospitalizations/active') return Promise.resolve({ data: { data: list } })
    if (url === '/api/appointments/doctors') return Promise.resolve({ data: { data: doctors } })
    const m = url.match(/^\/api\/hospitalizations\/(\d+)$/)
    if (m) {
      const id = Number(m[1])
      const base = list.find(h => h.id === id) ?? {}
      return Promise.resolve({ data: { data: { ...base, careLogs: detailById[id] ?? [] } } })
    }
    return Promise.resolve({ data: { data: null } })
  })
}

beforeEach(() => {
  postMock.mockClear()
  putMock.mockClear()
  deleteMock.mockClear()
})

function renderBoard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <ClinicInpatient />
    </QueryClientProvider>
  )
  return { queryClient, container }
}

// Every modal in this file shares one shell shape: an outer backdrop
// (`onClick={onClose}`) wrapping an inner panel (`bg-surface ...`,
// `onClick={e => e.stopPropagation()}`). These two helpers locate the panel
// by its unique header text and derive the backdrop from it, so tests target
// the exact element the source attaches each handler to rather than guessing
// coordinates.
function panelFor(headerText: string): HTMLElement {
  const header = screen.getByText(headerText)
  const panel = header.closest('.bg-surface')
  if (!panel) throw new Error(`No .bg-surface ancestor found for header "${headerText}"`)
  return panel as HTMLElement
}

function backdropFor(headerText: string): HTMLElement {
  const backdrop = panelFor(headerText).parentElement
  if (!backdrop) throw new Error(`Panel for "${headerText}" has no parent backdrop`)
  return backdrop as HTMLElement
}

async function openCareModal(list: { id: number }[] = [activeAdmission]) {
  stubGet(list)
  const { queryClient, container } = renderBoard()
  await screen.findByText('Rex')
  await userEvent.click(screen.getByText('Log Care'))
  await screen.findByText('Log Care — Rex')
  return { queryClient, container }
}

async function openEditModal(list: { id: number }[] = [activeAdmission]) {
  stubGet(list)
  const { queryClient, container } = renderBoard()
  await screen.findByText('Rex')
  await userEvent.click(screen.getByLabelText('Edit admission'))
  await screen.findByText('Edit Admission — Rex')
  return { queryClient, container }
}

async function openHistoryModal(list: { id: number }[] = [activeAdmission]) {
  stubGet(list)
  const { queryClient, container } = renderBoard()
  await screen.findByText('Rex')
  await userEvent.click(screen.getByLabelText('View care history'))
  await screen.findByText('Care History')
  return { queryClient, container }
}

// ─── G1 — modal close paths ────────────────────────────────────────────────
describe('ClinicInpatient — Care modal close paths (Gate 0, G1)', () => {
  it('X control unmounts the care modal, board stays rendered, and there is no Cancel-labelled button', async () => {
    await openCareModal()
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()

    await userEvent.click(within(panelFor('Log Care — Rex')).getByText('close'))
    expect(screen.queryByText('Log Care — Rex')).not.toBeInTheDocument()
    expect(screen.getByText('Rex')).toBeInTheDocument()
  })

  it('backdrop click unmounts the care modal', async () => {
    await openCareModal()
    fireEvent.click(backdropFor('Log Care — Rex'))
    expect(screen.queryByText('Log Care — Rex')).not.toBeInTheDocument()
  })

  it('click inside the panel does NOT unmount (stopPropagation guard)', async () => {
    await openCareModal()
    await userEvent.click(panelFor('Log Care — Rex'))
    expect(screen.getByText('Log Care — Rex')).toBeInTheDocument()
  })
})

describe('ClinicInpatient — Edit modal close paths (Gate 0, G1)', () => {
  it('Cancel unmounts the edit modal', async () => {
    await openEditModal()
    await userEvent.click(within(panelFor('Edit Admission — Rex')).getByText('Cancel'))
    expect(screen.queryByText('Edit Admission — Rex')).not.toBeInTheDocument()
  })

  it('X unmounts the edit modal', async () => {
    await openEditModal()
    await userEvent.click(within(panelFor('Edit Admission — Rex')).getByText('close'))
    expect(screen.queryByText('Edit Admission — Rex')).not.toBeInTheDocument()
  })

  it('backdrop click unmounts the edit modal', async () => {
    await openEditModal()
    fireEvent.click(backdropFor('Edit Admission — Rex'))
    expect(screen.queryByText('Edit Admission — Rex')).not.toBeInTheDocument()
  })
})

describe('ClinicInpatient — Care History modal close paths (Gate 0, G1)', () => {
  it('X unmounts the history modal', async () => {
    await openHistoryModal()
    await userEvent.click(within(panelFor('Care History')).getByText('close'))
    expect(screen.queryByText('Care History')).not.toBeInTheDocument()
  })

  it('backdrop click unmounts the history modal', async () => {
    await openHistoryModal()
    fireEvent.click(backdropFor('Care History'))
    expect(screen.queryByText('Care History')).not.toBeInTheDocument()
  })

  it('footer Close button unmounts the history modal', async () => {
    await openHistoryModal()
    await userEvent.click(within(panelFor('Care History')).getByText('Close'))
    expect(screen.queryByText('Care History')).not.toBeInTheDocument()
  })
})

describe('AdmitModal — close paths (Gate 0, G1)', () => {
  function renderAdmitModal(onClose = vi.fn()) {
    getMock.mockImplementation((url: string) => {
      if (url === '/api/appointments/doctors') return Promise.resolve({ data: { data: doctors } })
      return Promise.resolve({ data: { data: null } })
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <AdmitModal petId={42} onClose={onClose} onSaved={vi.fn()} />
      </QueryClientProvider>
    )
    return { onClose, container }
  }

  it('Cancel calls onClose', async () => {
    const { onClose } = renderAdmitModal()
    await userEvent.click(within(panelFor('Admit to Inpatient')).getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('X calls onClose', async () => {
    const { onClose } = renderAdmitModal()
    await userEvent.click(within(panelFor('Admit to Inpatient')).getByText('close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('backdrop click calls onClose', () => {
    const { onClose } = renderAdmitModal()
    fireEvent.click(backdropFor('Admit to Inpatient'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// ─── G2 — mutual exclusion ──────────────────────────────────────────────
describe('ClinicInpatient — modal mutual exclusion (Gate 0, G2)', () => {
  it('opening Edit while the Care modal is open closes Care and shows only Edit', async () => {
    // Superseded by fix(frontend) e78b5d4, landed underneath this branch by
    // rebase: careTarget/editTarget/historyTarget (three independent
    // nullable states) collapsed into one activeModal discriminated union,
    // so only one modal can be mounted at a time. This test originally
    // recorded the pre-fix bug (both modals mounting simultaneously); that
    // bug is now fixed and this assertion reflects the corrected behaviour,
    // matching e78b5d4's own regression test.
    const { container } = await openCareModal()
    await userEvent.click(screen.getByLabelText('Edit admission'))
    await screen.findByText('Edit Admission — Rex')

    expect(screen.queryByText('Log Care — Rex')).not.toBeInTheDocument()
    expect(screen.getByText('Edit Admission — Rex')).toBeInTheDocument()
    expect(container.querySelectorAll('.fixed.inset-0').length).toBe(1)
  })

  it('sequential open -> close -> open of a different modal leaves exactly one modal root at a time', async () => {
    const { container } = await openCareModal()
    fireEvent.click(backdropFor('Log Care — Rex'))
    expect(screen.queryByText('Log Care — Rex')).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Edit admission'))
    await screen.findByText('Edit Admission — Rex')

    expect(container.querySelectorAll('.fixed.inset-0').length).toBe(1)
    expect(screen.queryByText('Log Care — Rex')).not.toBeInTheDocument()
  })
})

// ─── G5 — save closes the modal ────────────────────────────────────────────
describe('ClinicInpatient — save closes the modal (Gate 0, G5)', () => {
  it('a successful Care save unmounts the modal and leaves the board rendered', async () => {
    await openCareModal()
    await userEvent.click(screen.getByText('16:00'))
    await userEvent.click(screen.getByText('Next'))
    await userEvent.click(screen.getByText('Next'))
    await userEvent.click(screen.getByText('Save Care Record'))

    await waitFor(() => expect(postMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('Log Care — Rex')).not.toBeInTheDocument())
    expect(screen.getByText('Rex')).toBeInTheDocument()
  })

  it('a successful Edit save unmounts the modal', async () => {
    await openEditModal()
    await userEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => expect(putMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('Edit Admission — Rex')).not.toBeInTheDocument())
  })

  it('a FAILED Care save leaves the modal mounted (pins current behaviour alongside LC-6)', async () => {
    postMock.mockRejectedValueOnce({ response: { data: { error: 'Care log rejected' } } })
    const { container } = await openCareModal()
    await userEvent.click(screen.getByText('16:00'))
    await userEvent.click(screen.getByText('Next'))
    await userEvent.click(screen.getByText('Next'))
    await userEvent.click(screen.getByText('Save Care Record'))

    expect(await screen.findByText('Care log rejected')).toBeInTheDocument()
    expect(screen.getByText('Log Care — Rex')).toBeInTheDocument()
    expect(container.querySelectorAll('.fixed.inset-0').length).toBe(1)
  })
})

// ─── G3 — discharge flow ───────────────────────────────────────────────────
describe('ClinicInpatient — discharge (Gate 0, G3)', () => {
  it('confirm accepted -> PUT /api/hospitalizations/:id/discharge fires and the board refetches', async () => {
    stubGet([activeAdmission])
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderBoard()
    await screen.findByText('Rex')
    const callsBefore = getMock.mock.calls.filter(c => c[0] === '/api/hospitalizations/active').length

    await userEvent.click(screen.getByText('Discharge'))
    await waitFor(() => expect(putMock).toHaveBeenCalledWith('/api/hospitalizations/500/discharge'))
    await waitFor(() => {
      const callsAfter = getMock.mock.calls.filter(c => c[0] === '/api/hospitalizations/active').length
      expect(callsAfter).toBeGreaterThan(callsBefore)
    })
    confirmSpy.mockRestore()
  })

  it('confirm declined -> no PUT issued', async () => {
    stubGet([activeAdmission])
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderBoard()
    await screen.findByText('Rex')

    await userEvent.click(screen.getByText('Discharge'))
    expect(putMock).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('the confirm message names the pet and mentions the billing invoice', async () => {
    stubGet([activeAdmission])
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderBoard()
    await screen.findByText('Rex')

    await userEvent.click(screen.getByText('Discharge'))
    expect(confirmSpy).toHaveBeenCalledWith('Discharge Rex? This will generate the billing invoice.')
    confirmSpy.mockRestore()
  })

  it('current behaviour: the Discharge control is present even for an already-discharged admission', async () => {
    // Unlike Edit (gated on isAdmitted) and Delete (gated on isAdmitted &&
    // zero care logs), the Discharge button at L634-640 has no isAdmitted
    // guard at all — pin this as-is per Lane D characterization discipline.
    stubGet([dischargedAdmission])
    renderBoard()
    await screen.findByText('Rex')
    expect(screen.getByText('Discharge')).toBeInTheDocument()
    expect(screen.queryByLabelText('Edit admission')).not.toBeInTheDocument()
  })
})

// ─── G4 — board-level states ────────────────────────────────────────────────
describe('ClinicInpatient — board states (Gate 0, G4)', () => {
  it('isLoading renders "Loading…" in the header subtitle', () => {
    getMock.mockImplementation((url: string) =>
      url === '/api/hospitalizations/active' ? new Promise(() => {}) : Promise.resolve({ data: { data: doctors } })
    )
    renderBoard()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('isError renders "Failed to load inpatient data. Please refresh."', async () => {
    getMock.mockImplementation((url: string) =>
      url === '/api/hospitalizations/active'
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ data: { data: doctors } })
    )
    renderBoard()
    expect(await screen.findByText('Failed to load inpatient data. Please refresh.')).toBeInTheDocument()
  })

  it('empty list renders "No active admissions" plus the supporting copy', async () => {
    stubGet([])
    renderBoard()
    expect(await screen.findByText('No active admissions')).toBeInTheDocument()
    expect(screen.getByText('All patients have been discharged or no admissions today.')).toBeInTheDocument()
  })

  it('header count pluralises: 1 -> "1 active admission", 2 -> "2 active admissions"', async () => {
    stubGet([activeAdmission])
    const singular = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ClinicInpatient />
      </QueryClientProvider>
    )
    expect(await screen.findByText('1 active admission')).toBeInTheDocument()
    singular.unmount()

    stubGet([activeAdmission, secondAdmission])
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ClinicInpatient />
      </QueryClientProvider>
    )
    expect(await screen.findByText('2 active admissions')).toBeInTheDocument()
  })

  it('the refresh control triggers a refetch', async () => {
    stubGet([activeAdmission])
    renderBoard()
    await screen.findByText('Rex')
    const callsBefore = getMock.mock.calls.filter(c => c[0] === '/api/hospitalizations/active').length

    await userEvent.click(screen.getByTitle('Refresh'))
    await waitFor(() => {
      const callsAfter = getMock.mock.calls.filter(c => c[0] === '/api/hospitalizations/active').length
      expect(callsAfter).toBeGreaterThan(callsBefore)
    })
  })
})

// ─── G6 — care wizard back-navigation ──────────────────────────────────────
describe('ClinicInpatient — care wizard back-navigation (Gate 0, G6)', () => {
  it('Next -> Next -> Back -> Back returns to step 1', async () => {
    await openCareModal()
    await userEvent.click(screen.getByText('16:00'))
    await userEvent.click(screen.getByText('Next'))
    await userEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Care Notes')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Record Vitals')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Select Time Slot')).toBeInTheDocument()
  })

  it('values entered on step 2 survive a Back/Next round trip', async () => {
    await openCareModal()
    await userEvent.click(screen.getByText('16:00'))
    await userEvent.click(screen.getByText('Next'))

    const temp = screen.getByLabelText('Temperature') as HTMLInputElement
    await userEvent.clear(temp)
    await userEvent.type(temp, '38.5')
    fireEvent.blur(temp)
    expect(temp.value).toBe('38.5')

    await userEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Care Notes')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Back'))

    const tempAfter = screen.getByLabelText('Temperature') as HTMLInputElement
    expect(tempAfter.value).toBe('38.5')
  })
})
