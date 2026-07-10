// src/frontend/src/__tests__/ClinicInpatient.test.tsx
// Item 3 — inpatient create/edit/delete. Covers: CageCard renders the real backend
// field shape without crashing (regression guard for the field-mismatch bug fixed
// in this batch — cageNo/reason/doctorInCharge, no cageNumber/admitReason/doctor
// object/lastCareAt), Edit modal submits PUT, Delete button gated by careLogs count,
// AdmitModal (launched standalone here, exercised again from ClinicPets in a
// separate test) submits POST with petId. See
// docs/superpowers/specs/2026-07-10-inpatient-crud-design.md.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

const admissionWithCareLogs = {
  ...activeAdmission, id: 501, _count: { careLogs: 2 },
}

function stubGet(list: unknown[]) {
  getMock.mockImplementation((url: string) => {
    if (url === '/api/hospitalizations/active') return Promise.resolve({ data: { data: list } })
    if (url === '/api/appointments/doctors') return Promise.resolve({ data: { data: doctors } })
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
  render(
    <QueryClientProvider client={queryClient}>
      <ClinicInpatient />
    </QueryClientProvider>
  )
  return queryClient
}

describe('ClinicInpatient — CageCard field-mismatch regression guard', () => {
  it('renders real backend fields without crashing (cageNo/reason/doctor name)', async () => {
    stubGet([activeAdmission])
    renderBoard()

    expect(await screen.findByText('Rex')).toBeInTheDocument()
    expect(screen.getByText('Cage B-2')).toBeInTheDocument()
    expect(screen.getByText('Post-op recovery')).toBeInTheDocument()
    expect(screen.getByText('Dr. Somchai')).toBeInTheDocument()
  })

  it('shows "Unassigned" when doctorInCharge is null, no crash', async () => {
    stubGet([{ ...activeAdmission, doctorInCharge: null }])
    renderBoard()
    expect(await screen.findByText('Unassigned')).toBeInTheDocument()
  })
})

describe('ClinicInpatient — Delete button gated by care-log count (AC3, AC7)', () => {
  it('shows Delete for a zero-care-log admission', async () => {
    stubGet([activeAdmission])
    renderBoard()
    await screen.findByText('Rex')
    expect(screen.getByLabelText('Delete admission')).toBeInTheDocument()
  })

  it('hides Delete once at least one care log exists', async () => {
    stubGet([admissionWithCareLogs])
    renderBoard()
    await screen.findByText('Rex')
    expect(screen.queryByLabelText('Delete admission')).not.toBeInTheDocument()
  })

  it('clicking Delete (after confirm) calls DELETE and refetches the board', async () => {
    stubGet([activeAdmission])
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderBoard()
    await screen.findByText('Rex')

    await userEvent.click(screen.getByLabelText('Delete admission'))
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('/api/hospitalizations/500'))
    confirmSpy.mockRestore()
  })

  it('declining the confirm dialog does not call DELETE', async () => {
    stubGet([activeAdmission])
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderBoard()
    await screen.findByText('Rex')

    await userEvent.click(screen.getByLabelText('Delete admission'))
    expect(deleteMock).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})

describe('ClinicInpatient — Edit modal (AC1, AC6)', () => {
  it('pre-populates and submits PUT /api/hospitalizations/:id', async () => {
    stubGet([activeAdmission])
    renderBoard()
    await screen.findByText('Rex')

    await userEvent.click(screen.getByLabelText('Edit admission'))
    expect(await screen.findByDisplayValue('Post-op recovery')).toBeInTheDocument()
    expect(screen.getByDisplayValue('B-2')).toBeInTheDocument()

    const reasonInput = screen.getByDisplayValue('Post-op recovery')
    await userEvent.clear(reasonInput)
    await userEvent.type(reasonInput, 'Extended observation')
    await userEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => {
      expect(putMock).toHaveBeenCalledWith('/api/hospitalizations/500', expect.objectContaining({ reason: 'Extended observation' }))
    })
  })

  it('does not render an Edit button for a discharged admission', async () => {
    stubGet([{ ...activeAdmission, status: 'discharged' }])
    renderBoard()
    await screen.findByText('Rex')
    expect(screen.queryByLabelText('Edit admission')).not.toBeInTheDocument()
  })
})

describe('ClinicInpatient — Log Care modal payload (careSchema field-name regression guard)', () => {
  it('submits POST with backend field names (temperatureC), no nonexistent weight field', async () => {
    stubGet([activeAdmission])
    renderBoard()
    await screen.findByText('Rex')

    await userEvent.click(screen.getByText('Log Care'))
    await userEvent.click(screen.getByText('16:00'))
    await userEvent.click(screen.getByText('Next'))
    await userEvent.click(screen.getByText('Next'))
    await userEvent.click(screen.getByText('Save Care Record'))

    await waitFor(() => expect(postMock).toHaveBeenCalled())
    const [, payload] = postMock.mock.calls[0]
    expect(payload).toEqual({ timeSlot: '16:00', temperatureC: null, notes: '' })
    expect(payload).not.toHaveProperty('weight')
    expect(payload).not.toHaveProperty('temperature')
  })
})

describe('ClinicInpatient — Care History modal (LCV-1)', () => {
  const careLog = {
    id: 1, recordedAt: '2026-07-05T08:00:00.000Z', timeSlot: '08:00',
    temperatureC: 38.5, heartRateBpm: 90, respRateRpm: 20,
    feedingStatus: 'Ate well', medicationGiven: 'Amoxicillin', notes: 'Stable',
    performedBy: 12,
  }
  const careLogNulls = {
    id: 2, recordedAt: '2026-07-05T12:00:00.000Z', timeSlot: '12:00',
    temperatureC: null, heartRateBpm: null, respRateRpm: null,
    feedingStatus: null, medicationGiven: null, notes: null,
    performedBy: null,
  }

  function stubGetWithDetail(list: unknown[], detail: unknown) {
    getMock.mockImplementation((url: string) => {
      if (url === '/api/hospitalizations/active') return Promise.resolve({ data: { data: list } })
      if (url === '/api/appointments/doctors') return Promise.resolve({ data: { data: doctors } })
      if (url === '/api/hospitalizations/500') return Promise.resolve({ data: { data: detail } })
      return Promise.resolve({ data: { data: null } })
    })
  }

  it('history button renders on the card and opens the modal showing the pet name', async () => {
    stubGetWithDetail([activeAdmission], { ...activeAdmission, careLogs: [] })
    renderBoard()
    await screen.findByText('Rex')
    expect(screen.getByLabelText('View care history')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('View care history'))
    expect(await screen.findByText('Care History')).toBeInTheDocument()
    expect(screen.getAllByText('Rex').length).toBeGreaterThan(0)
  })

  it('renders care-log rows with correct field values, "—" for null fields', async () => {
    // id 3: integer-valued temp (Prisma Decimal "38" over the wire) must still
    // render with 1 decimal per LCV-1 AC — regression guard for toFixed(1).
    const careLogIntTemp = {
      ...careLog, id: 3, timeSlot: '16:00', temperatureC: 38,
      heartRateBpm: 100, respRateRpm: 24, feedingStatus: 'Fasting',
      medicationGiven: 'Saline drip', notes: 'Temp check', performedBy: 30,
    }
    stubGetWithDetail([activeAdmission], { ...activeAdmission, careLogs: [careLog, careLogNulls, careLogIntTemp] })
    renderBoard()
    await screen.findByText('Rex')
    await userEvent.click(screen.getByLabelText('View care history'))

    expect(await screen.findByText('Temp: 38.5°C')).toBeInTheDocument()
    expect(screen.getByText('Temp: 38.0°C')).toBeInTheDocument()
    expect(screen.getByText('HR: 90 bpm')).toBeInTheDocument()
    expect(screen.getByText('Resp: 20 rpm')).toBeInTheDocument()
    expect(screen.getByText('Feeding: Ate well')).toBeInTheDocument()
    expect(screen.getByText('Medication: Amoxicillin')).toBeInTheDocument()
    expect(screen.getByText('Stable')).toBeInTheDocument()
    expect(screen.getByText((_, el) => el?.textContent === 'By: Staff #12')).toBeInTheDocument()

    expect(screen.getByText('Temp: —')).toBeInTheDocument()
    expect(screen.getByText('HR: —')).toBeInTheDocument()
    expect(screen.getByText('Resp: —')).toBeInTheDocument()
    expect(screen.getByText('Feeding: —')).toBeInTheDocument()
    expect(screen.getByText('Medication: —')).toBeInTheDocument()
  })

  it('shows empty state when careLogs is empty', async () => {
    stubGetWithDetail([activeAdmission], { ...activeAdmission, careLogs: [] })
    renderBoard()
    await screen.findByText('Rex')
    await userEvent.click(screen.getByLabelText('View care history'))
    expect(await screen.findByText('No care history recorded yet')).toBeInTheDocument()
  })

  it('shows error banner when the hospitalization detail fetch fails', async () => {
    getMock.mockImplementation((url: string) => {
      if (url === '/api/hospitalizations/active') return Promise.resolve({ data: { data: [activeAdmission] } })
      if (url === '/api/appointments/doctors') return Promise.resolve({ data: { data: doctors } })
      if (url === '/api/hospitalizations/500') return Promise.reject(new Error('fail'))
      return Promise.resolve({ data: { data: null } })
    })
    renderBoard()
    await screen.findByText('Rex')
    await userEvent.click(screen.getByLabelText('View care history'))
    expect(await screen.findByText('Failed to load care history.')).toBeInTheDocument()
  })

  it('performedBy renders as Staff #<id>, never a resolved staff name (regression, grill finding 1)', async () => {
    stubGetWithDetail([activeAdmission], { ...activeAdmission, careLogs: [{ ...careLog, performedBy: 7 }] })
    renderBoard()
    await screen.findByText('Rex')
    await userEvent.click(screen.getByLabelText('View care history'))

    expect(await screen.findByText((_, el) => el?.textContent === 'By: Staff #7')).toBeInTheDocument()
    // "Dr. Somchai" (doctorInCharge=7) must appear only in the card's doctor row,
    // never as a resolved name for performedBy inside the history modal.
    expect(screen.getAllByText('Dr. Somchai')).toHaveLength(1)
  })
})

describe('AdmitModal — standalone (B4, AC5)', () => {
  it('submits POST /api/hospitalizations with the pre-filled petId', async () => {
    getMock.mockImplementation((url: string) => {
      if (url === '/api/appointments/doctors') return Promise.resolve({ data: { data: doctors } })
      return Promise.resolve({ data: { data: null } })
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onSaved = vi.fn()
    render(
      <QueryClientProvider client={queryClient}>
        <AdmitModal petId={42} onClose={vi.fn()} onSaved={onSaved} />
      </QueryClientProvider>
    )

    await userEvent.type(screen.getByPlaceholderText('Reason for admission'), 'Observation')
    await userEvent.click(screen.getByText('Admit Patient'))

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/api/hospitalizations', expect.objectContaining({ petId: 42, reason: 'Observation' }))
      expect(onSaved).toHaveBeenCalled()
    })
  })

  it('disables the submit button until a reason is entered', async () => {
    getMock.mockImplementation(() => Promise.resolve({ data: { data: [] } }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <AdmitModal petId={42} onClose={vi.fn()} onSaved={vi.fn()} />
      </QueryClientProvider>
    )
    expect(screen.getByText('Admit Patient')).toBeDisabled()
  })
})
