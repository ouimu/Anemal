// src/frontend/src/__tests__/ClinicEMR.characterization.test.tsx
//
// Phase 7 / Lane D — Gate 0 characterization tests for ClinicEMR.tsx.
// This file is ADDITIVE: it locks down CURRENT behaviour (including behaviour
// that looks fragile) in the gaps identified by
// docs/superpowers/plans/2026-09-16-phase7-god-components-arch-audit.md §1
// ("ClinicEMR — PARTIAL") and §2.3 (the eleven-useState/four-useEffect draft
// record that the upcoming refactor collapses to one `draft` object). The
// four existing files (ClinicEMR.attachments/.petAvatar/.petIdParam/.weightSync
// .test.tsx) cover only the attachments panel, the avatar swap, the `?petId=`
// deep link and one save-invalidation case — this file adds the SOAP body,
// the vitals inputs, PrescriptionPanel/AnatomyCanvas parent-wiring, remaining
// conditional-render branches, and the draft-record sync quirks that a
// single-`draft`-object refactor must reproduce exactly.
//
// Same harness as the existing four files: real `ClinicEMR` default-export
// mount, a real `api` mock (no wholesale `@tanstack/react-query` mock), and
// `QueryClientProvider`. Do not invent a second harness.
//
// jsdom does not implement a 2D canvas context (`HTMLCanvasElement.getContext`
// returns null without the optional `canvas` npm package, which this repo does
// not install). `AnatomyCanvas` calls `canvas.getContext('2d')!.clearRect(...)`
// unconditionally in a mount effect, so any test that opens the Objective tab
// crashes without a stub — verified empirically while writing this file. The
// stub below is local to this file only (not added to the shared
// `src/test/setup.ts`) and does not touch `ClinicEMR.tsx`.
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

beforeAll(() => {
  const ctxStub = {
    clearRect: vi.fn(), drawImage: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), stroke: vi.fn(), strokeStyle: '', lineWidth: 0, lineCap: '',
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxStub) as any
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,MOCK')
  if (!('setPointerCapture' in Element.prototype)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Element.prototype as any).setPointerCapture = vi.fn()
  }
})

const getMock = vi.fn()
const postMock = vi.fn()
const putMock = vi.fn()
const deleteMock = vi.fn()

vi.mock('../utils/api', () => ({
  default: {
    get: (...args: unknown[]) => getMock(...(args as [string, unknown])),
    post: (...args: unknown[]) => postMock(...(args as [string, unknown])),
    put: (...args: unknown[]) => putMock(...(args as [string, unknown])),
    delete: (...args: unknown[]) => deleteMock(...(args as [string])),
  },
}))
// Can-gated controls call useAuthStore with a selector (s => s.hasPermission);
// ClinicEMR itself calls useAuthStore() with no selector to destructure userId.
// The mock below supports both call shapes, matching ClinicEMR.attachments.test.tsx.
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector?: (s: { userId: number; hasPermission: (perm: string) => boolean }) => unknown) => {
    const state = { userId: 1, hasPermission: () => true }
    return selector ? selector(state) : state
  },
}))

import ClinicEMR from '../views/clinic/ClinicEMR'

const pet = { id: 42, name: 'Rex', species: 'canine', owner: { firstName: 'Jane', lastName: 'Doe', phone: '0812345678' } }

interface FixtureRecord {
  id: number; petId: number; createdAt: string; assessment?: string
  subjective?: string; objective?: string; plan?: string
  weightKg?: number | null; temperatureC?: number | null; heartRateBpm?: number | null; respRateRpm?: number | null
  anatomyAnnotation?: { template: string; imageData: string } | null
  prescriptions?: unknown[]; attachments?: unknown[]
}

const baseRecord: FixtureRecord = {
  id: 7, petId: 42, createdAt: '2026-07-21T00:00:00.000Z', assessment: 'Visit A',
  subjective: 'Restless overnight', objective: 'Mild lethargy on exam', plan: 'Recheck in 3 days',
  weightKg: 4.5, temperatureC: 38.2, heartRateBpm: 110, respRateRpm: 24,
  anatomyAnnotation: null, prescriptions: [], attachments: [],
}

// Mutated per-test via beforeEach reset; keyed by medical-record id.
let recordsStore: Record<number, FixtureRecord> = {}
let recordsList: { id: number; assessment?: string; createdAt: string }[] = []

function defaultGetImpl(url: string, config?: { params?: Record<string, unknown> }) {
  if (url === '/api/search') {
    const q = config?.params?.q as string | undefined
    if (q && q.length >= 2) return Promise.resolve({ data: { data: [{ petId: 42, petName: 'Rex', species: 'canine', ownerName: 'Jane Doe', phone: '0812345678' }] } })
    return Promise.resolve({ data: { data: [] } })
  }
  if (url === '/api/pets/42') return Promise.resolve({ data: { data: pet } })
  if (url === '/api/medical-records') return Promise.resolve({ data: { data: { records: recordsList } } })
  const m = url.match(/^\/api\/medical-records\/(\d+)$/)
  if (m) {
    const id = Number(m[1])
    return Promise.resolve({ data: { data: recordsStore[id] ?? null } })
  }
  if (url === '/api/products') {
    return Promise.resolve({ data: { data: { products: [{ id: 900, name: 'Amoxicillin', unit: 'tab', stockQuantity: 40 }] } } })
  }
  return Promise.resolve({ data: { data: null } })
}

beforeEach(() => {
  getMock.mockReset(); postMock.mockReset(); putMock.mockReset(); deleteMock.mockReset()
  getMock.mockImplementation(defaultGetImpl)
  postMock.mockResolvedValue({ data: { data: { id: 501 } } })
  putMock.mockResolvedValue({ data: { data: { id: 7 } } })
  deleteMock.mockResolvedValue({ data: { success: true } })
  recordsStore = { 7: { ...baseRecord } }
  recordsList = [{ id: 7, assessment: 'Visit A', createdAt: baseRecord.createdAt }]
})

function renderEMR() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><ClinicEMR /></MemoryRouter>
    </QueryClientProvider>
  )
}

async function selectRex() {
  await userEvent.type(screen.getByPlaceholderText(/pet or owner/i), 'Rex')
  await userEvent.click(await screen.findByText('Rex'))
}

async function selectRexAndOpenVisitA() {
  await selectRex()
  await userEvent.click(await screen.findByText('Visit A'))
}

// ─── SOAP body ──────────────────────────────────────────────────────────────
describe('ClinicEMR — SOAP body (Gate 0)', () => {
  it('hydrates all four SOAP fields from the fetched record', async () => {
    renderEMR()
    await selectRexAndOpenVisitA()

    expect(await screen.findByDisplayValue('Restless overnight')).toBeInTheDocument() // Subjective tab is active by default
    await userEvent.click(screen.getByText('Objective'))
    expect(screen.getByDisplayValue('Mild lethargy on exam')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Assessment'))
    expect(screen.getByDisplayValue('Visit A')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Plan'))
    expect(screen.getByDisplayValue('Recheck in 3 days')).toBeInTheDocument()
  })

  it('editing the Subjective field updates its textarea value', async () => {
    renderEMR()
    await selectRexAndOpenVisitA()

    const textarea = await screen.findByDisplayValue('Restless overnight')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Calm this morning')
    expect(screen.getByDisplayValue('Calm this morning')).toBeInTheDocument()
  })

  it('switching SOAP tabs does not clear unsaved edits in another tab', async () => {
    renderEMR()
    await selectRexAndOpenVisitA()

    const subjective = await screen.findByDisplayValue('Restless overnight')
    await userEvent.clear(subjective)
    await userEvent.type(subjective, 'Draft subjective text')

    await userEvent.click(screen.getByText('Plan'))
    expect(screen.getByDisplayValue('Recheck in 3 days')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Subjective'))
    expect(screen.getByDisplayValue('Draft subjective text')).toBeInTheDocument()
  })

  it('saveRecord on an existing record PUTs all four SOAP fields and shows "Saved", which clears after 2s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderEMR()
      await user.type(screen.getByPlaceholderText(/pet or owner/i), 'Rex')
      await user.click(await screen.findByText('Rex'))
      await user.click(await screen.findByText('Visit A'))
      await screen.findByDisplayValue('Restless overnight')

      await user.click(screen.getByText(/save record/i))
      expect(await screen.findByText('Saved')).toBeInTheDocument()

      expect(putMock).toHaveBeenCalledTimes(1)
      const body = putMock.mock.calls[0][1] as Record<string, unknown>
      expect(body.subjective).toBe('Restless overnight')
      expect(body.objective).toBe('Mild lethargy on exam')
      expect(body.assessment).toBe('Visit A')
      expect(body.plan).toBe('Recheck in 3 days')

      await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
      expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('saveRecord on a new record POSTs, adopts the returned id, and leaves new-record mode', async () => {
    recordsStore[501] = { id: 501, petId: 42, createdAt: '2026-07-23T00:00:00.000Z', prescriptions: [] }
    renderEMR()
    await selectRex()
    await userEvent.click(screen.getByText(/new emr record/i))
    expect(screen.getByText(/save the emr first/i)).toBeInTheDocument() // isNewRecord placeholder, pre-save

    await userEvent.click(screen.getByText(/save record/i))
    expect(await screen.findByText('Saved')).toBeInTheDocument()

    expect(postMock).toHaveBeenCalledWith('/api/medical-records', expect.objectContaining({ petId: 42, doctorId: 1 }))
    // isNewRecord flips false and selectedRecordId becomes 501, so the query for
    // that id is now enabled and PrescriptionPanel replaces the placeholder.
    expect(await screen.findByText('Prescriptions')).toBeInTheDocument()
    expect(screen.queryByText(/save the emr first/i)).not.toBeInTheDocument()
  })

  it('a failed save shows the server error message and re-enables the Save button', async () => {
    putMock.mockRejectedValue({ response: { data: { error: 'Save conflict' } } })
    renderEMR()
    await selectRexAndOpenVisitA()

    const saveBtn = screen.getByText(/save record/i).closest('button')!
    await userEvent.click(saveBtn)

    expect(await screen.findByText('Save conflict')).toBeInTheDocument()
    expect(saveBtn).not.toBeDisabled()
  })

  it('an edit made while a save is in-flight is not included in that in-flight save payload', async () => {
    let resolvePut!: (v: unknown) => void
    putMock.mockImplementationOnce(() => new Promise(res => { resolvePut = res }))
    renderEMR()
    await selectRexAndOpenVisitA()
    const textarea = await screen.findByDisplayValue('Restless overnight')

    await userEvent.click(screen.getByText(/save record/i))
    expect(putMock).toHaveBeenCalledTimes(1)

    // The body object is built synchronously when saveRecord is invoked, before
    // the `await`, so an edit typed while the PUT is still pending must not
    // leak into the request already in flight — the eleven-useState -> one-
    // `draft` refactor has to preserve this snapshot-at-click-time behaviour.
    await userEvent.type(textarea, ' MORE')
    resolvePut({ data: { data: { id: 7 } } })
    await screen.findByText('Saved')

    const firstCallBody = putMock.mock.calls[0][1] as { subjective: string }
    expect(firstCallBody.subjective).toBe('Restless overnight')
    expect(firstCallBody.subjective).not.toContain('MORE')
  })

  it('selecting a different record discards unsaved SOAP edits without warning', async () => {
    recordsStore[8] = { ...baseRecord, id: 8, assessment: 'Visit B', subjective: 'Original B text' }
    recordsList = [
      { id: 7, assessment: 'Visit A', createdAt: baseRecord.createdAt },
      { id: 8, assessment: 'Visit B', createdAt: '2026-07-22T00:00:00.000Z' },
    ]
    renderEMR()
    await selectRexAndOpenVisitA()

    const textarea = await screen.findByDisplayValue('Restless overnight')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'UNSAVED EDIT')
    expect(screen.getByDisplayValue('UNSAVED EDIT')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Visit B'))
    await screen.findByDisplayValue('Original B text')
    expect(screen.queryByDisplayValue('UNSAVED EDIT')).not.toBeInTheDocument()
  })
})

// ─── Vitals inputs ────────────────────────────────────────────────────────
describe('ClinicEMR — vitals inputs (Gate 0)', () => {
  it('hydrates all four vitals fields from the fetched record', async () => {
    renderEMR()
    await selectRexAndOpenVisitA()
    await userEvent.click(screen.getByText('Objective'))

    expect(await screen.findByLabelText('Weight (kg)')).toHaveValue(4.5)
    expect(screen.getByLabelText('Temperature (°C)')).toHaveValue(38.2)
    expect(screen.getByLabelText('Heart Rate')).toHaveValue(110)
    expect(screen.getByLabelText('Resp Rate')).toHaveValue(24)
  })

  it('a weightKg of 0 hydrates to a blank field (falsy-zero quirk)', async () => {
    recordsStore[7] = { ...baseRecord, weightKg: 0 }
    renderEMR()
    await selectRexAndOpenVisitA()
    await userEvent.click(screen.getByText('Objective'))

    // record.weightKg ? Number(record.weightKg) : null — 0 is falsy, so it
    // hydrates to null exactly like an absent weight. Pinning this as-is.
    const weightInput = await screen.findByLabelText('Weight (kg)') as HTMLInputElement
    expect(weightInput.value).toBe('')
  })

  it('typing a vital value and blurring commits it and includes it in the save payload', async () => {
    renderEMR()
    await selectRexAndOpenVisitA()
    await userEvent.click(screen.getByText('Objective'))

    const temp = await screen.findByLabelText('Temperature (°C)') as HTMLInputElement
    await userEvent.clear(temp)
    await userEvent.type(temp, '39.5')
    fireEvent.blur(temp)
    expect(temp.value).toBe('39.5')

    await userEvent.click(screen.getByText(/save record/i))
    await screen.findByText('Saved')
    const body = putMock.mock.calls[0][1] as { temperatureC: number }
    expect(body.temperatureC).toBe(39.5)
  })

  it('the +/- stepper buttons update a vital value and it is included in the save payload', async () => {
    renderEMR()
    await selectRexAndOpenVisitA()
    await userEvent.click(screen.getByText('Objective'))

    const hrInput = await screen.findByLabelText('Heart Rate')
    const incBtn = within(hrInput.parentElement!).getByText('+')
    await userEvent.click(incBtn)
    await userEvent.click(incBtn)
    await userEvent.click(incBtn)
    expect(hrInput).toHaveValue(113)

    await userEvent.click(screen.getByText(/save record/i))
    await screen.findByText('Saved')
    const body = putMock.mock.calls[0][1] as { heartRateBpm: number }
    expect(body.heartRateBpm).toBe(113)
  })

  it('a failed save leaves entered vitals values intact in the inputs', async () => {
    putMock.mockRejectedValue({ response: { data: { error: 'Save conflict' } } })
    renderEMR()
    await selectRexAndOpenVisitA()
    await userEvent.click(screen.getByText('Objective'))

    const temp = await screen.findByLabelText('Temperature (°C)') as HTMLInputElement
    await userEvent.clear(temp)
    await userEvent.type(temp, '40.1')
    fireEvent.blur(temp)

    await userEvent.click(screen.getByText(/save record/i))
    await screen.findByText('Save conflict')
    expect(temp.value).toBe('40.1')
  })
})

// ─── PrescriptionPanel integration ─────────────────────────────────────────
describe('ClinicEMR — PrescriptionPanel integration (Gate 0)', () => {
  it("passes record.prescriptions from the fetched record into PrescriptionPanel", async () => {
    recordsStore[7] = {
      ...baseRecord,
      prescriptions: [{ id: 300, quantity: 2, unit: 'tab', dosageInstruction: '2x daily', drug: { id: 900, name: 'Amoxicillin', unit: 'tab', stockQuantity: 40 } }],
    }
    renderEMR()
    await selectRexAndOpenVisitA()

    expect(await screen.findByText('Amoxicillin')).toBeInTheDocument()
    expect(screen.getByText((_, el) => el?.textContent === '2 tab · 2x daily')).toBeInTheDocument()
  })

  it('is not rendered for a new (unsaved) record; the placeholder message shows instead', async () => {
    renderEMR()
    await selectRex()
    await userEvent.click(screen.getByText(/new emr record/i))

    expect(screen.getByText(/save the emr first/i)).toBeInTheDocument()
    expect(screen.queryByText('Prescriptions')).not.toBeInTheDocument()
  })

  it('adding a prescription POSTs then the parent refetches the record (onRefresh wiring)', async () => {
    renderEMR()
    await selectRexAndOpenVisitA()
    const getCallsBefore = getMock.mock.calls.filter(c => c[0] === '/api/medical-records/7').length

    await userEvent.type(screen.getByPlaceholderText(/search drug/i), 'Amox')
    await userEvent.click(await screen.findByText('Amoxicillin'))
    await userEvent.click(screen.getByText('Add Prescription'))

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/api/prescriptions', expect.objectContaining({ medicalRecordId: 7, drugId: 900 })))
    await waitFor(() => {
      const getCallsAfter = getMock.mock.calls.filter(c => c[0] === '/api/medical-records/7').length
      expect(getCallsAfter).toBeGreaterThan(getCallsBefore)
    })
  })

  it('removing a prescription DELETEs then the parent refetches the record (onRefresh wiring)', async () => {
    recordsStore[7] = {
      ...baseRecord,
      prescriptions: [{ id: 300, quantity: 2, unit: 'tab', dosageInstruction: '2x daily', drug: { id: 900, name: 'Amoxicillin', unit: 'tab', stockQuantity: 40 } }],
    }
    renderEMR()
    await selectRexAndOpenVisitA()
    const nameEl = await screen.findByText('Amoxicillin')
    const getCallsBefore = getMock.mock.calls.filter(c => c[0] === '/api/medical-records/7').length

    const row = nameEl.closest('div')!.parentElement! // p -> .flex-1 -> row
    await userEvent.click(within(row).getByRole('button'))

    expect(deleteMock).toHaveBeenCalledWith('/api/prescriptions/300')
    await waitFor(() => {
      const getCallsAfter = getMock.mock.calls.filter(c => c[0] === '/api/medical-records/7').length
      expect(getCallsAfter).toBeGreaterThan(getCallsBefore)
    })
  })
})

// ─── AnatomyCanvas integration ──────────────────────────────────────────────
describe('ClinicEMR — AnatomyCanvas integration (Gate 0)', () => {
  it('drawing on the canvas calls the parent onChange and the stroke is included in the save payload', async () => {
    renderEMR()
    await selectRexAndOpenVisitA()
    await userEvent.click(screen.getByText('Objective'))
    await screen.findByText(/Anatomy Annotation/i)

    const canvas = document.querySelector('canvas')!
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20, pointerId: 1 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })

    await userEvent.click(screen.getByText(/save record/i))
    await screen.findByText('Saved')
    const body = putMock.mock.calls[0][1] as { anatomyAnnotation: unknown }
    expect(body.anatomyAnnotation).toEqual({ template: 'Canine - Lateral', imageData: 'data:image/png;base64,MOCK' })
  })

  it("the Clear control calls onChange(null) and the save payload's anatomyAnnotation becomes null", async () => {
    renderEMR()
    await selectRexAndOpenVisitA()
    await userEvent.click(screen.getByText('Objective'))
    await screen.findByText(/Anatomy Annotation/i)

    const canvas = document.querySelector('canvas')!
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20, pointerId: 1 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })

    await userEvent.click(screen.getByText('Clear'))
    await userEvent.click(screen.getByText(/save record/i))
    await screen.findByText('Saved')
    const body = putMock.mock.calls[0][1] as { anatomyAnnotation: unknown }
    expect(body.anatomyAnnotation).toBeNull()
  })
})

// ─── Conditional rendering not covered by the existing 4 files ────────────
describe('ClinicEMR — conditional rendering (Gate 0)', () => {
  it('shows the empty-state prompt when no patient/record is selected', async () => {
    renderEMR()
    expect(screen.getByText('EMR Editor')).toBeInTheDocument()
    expect(screen.getByText(/search for a patient to start/i)).toBeInTheDocument()
  })

  it('the right panel (attachments/prescriptions) is absent until a record is selected or created', async () => {
    renderEMR()
    await selectRex()
    expect(screen.queryByText('Attachments')).not.toBeInTheDocument()
    expect(screen.queryByText('Prescriptions')).not.toBeInTheDocument()
  })

  it('the attachment-upload guard blocks a file pick before the record has an id, without calling the upload hook', async () => {
    renderEMR()
    await selectRex()
    await userEvent.click(screen.getByText(/new emr record/i))

    const file = new File(['x'], 'note.pdf', { type: 'application/pdf' })
    const input = screen.getByTestId('emr-attachment-file-input') as HTMLInputElement
    await userEvent.upload(input, file, { applyAccept: false })

    expect(await screen.findByText('Save the record before attaching files.')).toBeInTheDocument()
    expect(postMock).not.toHaveBeenCalledWith(expect.stringContaining('/attachments'), expect.anything(), expect.anything())
  })
})
