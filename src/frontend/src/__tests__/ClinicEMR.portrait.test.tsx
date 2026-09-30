// src/frontend/src/__tests__/ClinicEMR.portrait.test.tsx
//
// RESP-6 / RESP-7 (responsive-shell-emr-portrait): ClinicEMR in tablet portrait.
// Below the drawer breakpoint (useViewportMode() === 'drawer') the three EMR
// panels become tabs. Contract (arch §4a): the switch changes classes / `hidden`
// only — the panels keep element type and tree position, so nothing remounts on
// a tab switch or a rotation.
//
// jsdom applies no Tailwind CSS, so a `hidden` class does not change what the
// testing-library queries can see. Visibility is therefore asserted on the class
// (`isHiddenByClass` walks the ancestors), and "no remount" is asserted by DOM
// node identity. Layout geometry (320px editor, canvas clipping, soft keyboard)
// is a browser check at Step 7 (@AC-RESP-6-1, @AC-RESP-7-5 geometry, @AC-RESP-7-7).
//
// Harness follows ClinicEMR.characterization.test.tsx (real ClinicEMR mount, api
// mock, QueryClientProvider); only useViewportMode is mocked, and `rerender`
// with a new mode simulates a rotation.
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import clinicEmrSource from '../views/clinic/ClinicEMR.tsx?raw'

type Mode = 'expanded' | 'rail' | 'drawer'

const hoisted = vi.hoisted(() => ({
  mode: 'expanded' as 'expanded' | 'rail' | 'drawer',
  canAttach: true,
}))

vi.mock('../hooks/useViewportMode', () => ({
  useViewportMode: () => hoisted.mode,
}))

beforeAll(() => {
  const ctxStub = {
    clearRect: vi.fn(), drawImage: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), stroke: vi.fn(), strokeStyle: '', lineWidth: 0, lineCap: '',
  }
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxStub) as unknown as HTMLCanvasElement['getContext']
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,MOCK')
  if (!('setPointerCapture' in Element.prototype)) {
    (Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = vi.fn()
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
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector?: (s: { userId: number; hasPermission: (perm: string) => boolean }) => unknown) => {
    const state = {
      userId: 1,
      hasPermission: (perm: string) => (perm === 'emr.attach' ? hoisted.canAttach : true),
    }
    return selector ? selector(state) : state
  },
}))

import ClinicEMR from '../views/clinic/ClinicEMR'

const TAB_PATIENT = 'Patient'
const TAB_SOAP = 'SOAP'
const TAB_ATTACH = 'Attachments & Rx'
const ALL_TABS = [TAB_PATIENT, TAB_SOAP, TAB_ATTACH] as const

const pet = {
  id: 42, name: 'Rex', species: 'canine', allergies: 'Chicken',
  owner: { firstName: 'Jane', lastName: 'Doe', phone: '0812345678' },
}
const createdAt = '2026-07-21T00:00:00.000Z'
const baseRecord = {
  id: 7, petId: 42, createdAt, assessment: 'Visit A',
  subjective: 'Restless overnight', objective: 'Mild lethargy on exam', plan: 'Recheck in 3 days',
  weightKg: 4.5, temperatureC: 38.2, heartRateBpm: 110, respRateRpm: 24,
  anatomyAnnotation: null, prescriptions: [], attachments: [],
}
const recordB = { ...baseRecord, id: 8, assessment: 'Visit B', subjective: 'Original B text' }

function getImpl(url: string, config?: { params?: Record<string, unknown> }) {
  if (url === '/api/search') {
    const q = config?.params?.q as string | undefined
    const rows = q && q.length >= 2
      ? [{ petId: 42, petName: 'Rex', species: 'canine', ownerName: 'Jane Doe', phone: '0812345678' }]
      : []
    return Promise.resolve({ data: { data: rows } })
  }
  if (url === '/api/pets/42') return Promise.resolve({ data: { data: pet } })
  if (url === '/api/medical-records') {
    return Promise.resolve({ data: { data: { records: [
      { id: 7, assessment: 'Visit A', createdAt },
      { id: 8, assessment: 'Visit B', createdAt: '2026-07-22T00:00:00.000Z' },
    ] } } })
  }
  if (url === '/api/medical-records/7') return Promise.resolve({ data: { data: baseRecord } })
  if (url === '/api/medical-records/8') return Promise.resolve({ data: { data: recordB } })
  return Promise.resolve({ data: { data: null } })
}

beforeEach(() => {
  hoisted.mode = 'expanded'
  hoisted.canAttach = true
  getMock.mockReset(); postMock.mockReset(); putMock.mockReset(); deleteMock.mockReset()
  getMock.mockImplementation(getImpl)
  postMock.mockResolvedValue({ data: { data: { id: 501 } } })
  putMock.mockResolvedValue({ data: { data: { id: 7 } } })
  deleteMock.mockResolvedValue({ data: { success: true } })
})

/** Mount ClinicEMR at `mode`; `setMode` re-renders the same tree to simulate rotation. */
function renderEMR(mode: Mode) {
  hoisted.mode = mode
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><ClinicEMR /></MemoryRouter>
    </QueryClientProvider>
  )
  const utils = render(tree())
  return {
    ...utils,
    setMode(next: Mode) {
      hoisted.mode = next
      utils.rerender(tree())
    },
  }
}

/** True when the element or any ancestor carries the `hidden` utility class. */
function isHiddenByClass(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n.classList.contains('hidden')) return true
  }
  return false
}

/** Names of the panel groups (patient / soap / attachments) that are currently shown. */
function visiblePanels(): string[] {
  const names = new Set<string>()
  document.querySelectorAll('[data-emr-panel]').forEach(el => {
    if (!isHiddenByClass(el)) names.add(el.getAttribute('data-emr-panel') as string)
  })
  return Array.from(names).sort()
}

function tab(name: string): HTMLElement {
  return screen.getByRole('tab', { name })
}

async function clickTabIfPresent(name: string) {
  const el = screen.queryByRole('tab', { name })
  if (el) await userEvent.click(el)
}

async function selectRex() {
  await clickTabIfPresent(TAB_PATIENT)
  await userEvent.type(screen.getByPlaceholderText(/pet or owner/i), 'Rex')
  await userEvent.click(await screen.findByText('Rex'))
}

async function openVisitA() {
  await selectRex()
  await userEvent.click(await screen.findByText('Visit A'))
  await screen.findByDisplayValue('Restless overnight')
}

const ATTACH_HEADING = 'Attachments'

// ─── Tab bar and panel switching ─────────────────────────────────────────────
describe('ClinicEMR portrait — tabs (RESP-6)', () => {
  it('@AC-RESP-6-2 shows Patient / SOAP / Attachments & Rx, SOAP selected, exactly one panel visible', async () => {
    renderEMR('drawer')
    await openVisitA()

    const tabs = screen.getAllByRole('tab').map(t => t.getAttribute('aria-label'))
    expect(tabs).toEqual([TAB_PATIENT, TAB_SOAP, TAB_ATTACH])
    expect(tab(TAB_SOAP)).toHaveAttribute('aria-selected', 'true')
    expect(tab(TAB_PATIENT)).toHaveAttribute('aria-selected', 'false')
    expect(tab(TAB_ATTACH)).toHaveAttribute('aria-selected', 'false')
    expect(visiblePanels()).toEqual(['soap'])
  })

  it('@AC-RESP-6-3 selecting Patient shows the patient and visit list, hides the others', async () => {
    renderEMR('drawer')
    await openVisitA()
    await userEvent.click(tab(TAB_PATIENT))

    expect(tab(TAB_PATIENT)).toHaveAttribute('aria-selected', 'true')
    expect(visiblePanels()).toEqual(['patient'])
    expect(isHiddenByClass(screen.getByText('Visit A'))).toBe(false)
  })

  it('@AC-RESP-6-4 selecting Attachments & Rx shows attachments and prescriptions, hides the others', async () => {
    renderEMR('drawer')
    await openVisitA()
    await userEvent.click(tab(TAB_ATTACH))

    expect(tab(TAB_ATTACH)).toHaveAttribute('aria-selected', 'true')
    expect(visiblePanels()).toEqual(['attachments'])
    expect(isHiddenByClass(screen.getByText(ATTACH_HEADING))).toBe(false)
    expect(isHiddenByClass(screen.getByText('Prescriptions'))).toBe(false)
  })

  it('@AC-RESP-6-5 picking a different visit from the Patient tab returns to SOAP with that visit open', async () => {
    renderEMR('drawer')
    await openVisitA()
    await userEvent.click(tab(TAB_PATIENT))
    await userEvent.click(screen.getByText('Visit B'))

    expect(await screen.findByDisplayValue('Original B text')).toBeInTheDocument()
    expect(tab(TAB_SOAP)).toHaveAttribute('aria-selected', 'true')
    expect(visiblePanels()).toEqual(['soap'])
  })

  it.each<Mode>(['rail', 'expanded'])(
    '@AC-RESP-6-6 %s: no tab bar and all three panels shown side by side',
    async mode => {
      renderEMR(mode)
      await openVisitA()

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
      expect(screen.queryAllByRole('tab')).toHaveLength(0)
      expect(visiblePanels()).toEqual(['attachments', 'patient', 'soap'])
    },
  )

  it('@AC-RESP-6-11 every tab carries 44px height and width classes', async () => {
    renderEMR('drawer')
    await openVisitA()

    for (const name of ALL_TABS) {
      expect(tab(name).className).toContain('min-h-[44px]')
      expect(tab(name).className).toContain('min-w-[44px]')
    }
  })
})

// ─── Rotation ────────────────────────────────────────────────────────────────
describe('ClinicEMR portrait — rotation (RESP-6, edge)', () => {
  it('@AC-RESP-6-7 rotating landscape to portrait mid-edit keeps the unsaved text in the same node', async () => {
    const view = renderEMR('rail')
    await openVisitA()
    const subjective = screen.getByDisplayValue('Restless overnight')
    await userEvent.clear(subjective)
    await userEvent.type(subjective, 'Typed before rotating')

    view.setMode('drawer')

    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(subjective.isConnected).toBe(true)
    expect(screen.getByDisplayValue('Typed before rotating')).toBe(subjective)
  })

  it('@AC-RESP-6-8 rotating portrait to landscape from Attachments & Rx restores three columns', async () => {
    const view = renderEMR('drawer')
    await openVisitA()
    await userEvent.click(tab(TAB_ATTACH))
    expect(visiblePanels()).toEqual(['attachments'])

    view.setMode('rail')

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(visiblePanels()).toEqual(['attachments', 'patient', 'soap'])
  })
})

// ─── Permission gates ────────────────────────────────────────────────────────
describe('ClinicEMR portrait — permission gates (RESP-6, authz)', () => {
  it.each([
    { role: 'doctor / clinic_staff (emr.attach held)', canAttach: true, shown: true },
    { role: 'custom role, emr.attach off', canAttach: false, shown: false },
  ])('@AC-RESP-6-9 $role: upload control shown=$shown on the Attachments & Rx tab', async ({ canAttach, shown }) => {
    hoisted.canAttach = canAttach
    renderEMR('drawer')
    await openVisitA()
    await userEvent.click(tab(TAB_ATTACH))

    const input = screen.queryByTestId('emr-attachment-file-input')
    expect(input !== null).toBe(shown)
    // The <input> itself is always `hidden` (the visible control is its label);
    // the label and its panel must not be hidden.
    if (input) expect(isHiddenByClass(input.parentElement as HTMLElement)).toBe(false)
  })
})

// ─── Parity with the three-column layout ─────────────────────────────────────
function recordedGets(): string[] {
  const rows = getMock.mock.calls.map(c => {
    const cfg = c[1] as { params?: Record<string, unknown> } | undefined
    return JSON.stringify([c[0], cfg?.params ?? null])
  })
  return Array.from(new Set(rows)).sort()
}

describe('ClinicEMR portrait — parity (RESP-6)', () => {
  it('@AC-RESP-6-12 opening the same record at drawer requests the same endpoints and params as expanded', async () => {
    renderEMR('expanded')
    await openVisitA()
    const expandedCalls = recordedGets()
    cleanup()
    getMock.mockClear()

    renderEMR('drawer')
    await openVisitA()

    expect(expandedCalls.length).toBeGreaterThan(0)
    expect(recordedGets()).toEqual(expandedCalls)
  })

  it('@AC-RESP-6-13 saving the same SOAP text from the SOAP tab sends the same request as expanded', async () => {
    renderEMR('expanded')
    await openVisitA()
    await userEvent.click(screen.getByText(/save record/i))
    await screen.findByText('Saved')
    const expandedSave = putMock.mock.calls[0]
    cleanup()
    putMock.mockClear()

    renderEMR('drawer')
    await openVisitA()
    await userEvent.click(screen.getByText(/save record/i))
    await screen.findByText('Saved')

    expect(putMock).toHaveBeenCalledTimes(1)
    expect(putMock.mock.calls[0]).toEqual(expandedSave)
    expect(expandedSave[0]).toBe('/api/medical-records/7')
  })
})

// ─── Pinned chrome, state, canvas (RESP-7) ───────────────────────────────────
describe('ClinicEMR portrait — pinned chrome and state (RESP-7)', () => {
  it.each(ALL_TABS)('@AC-RESP-7-1 patient header and allergy chip stay visible on the %s tab', async name => {
    renderEMR('drawer')
    await openVisitA()
    await userEvent.click(tab(name))

    const header = document.querySelector('[data-emr-pinned="header"]') as HTMLElement
    expect(header).not.toBeNull()
    expect(isHiddenByClass(header)).toBe(false)
    const chip = screen.getByText(/Chicken/)
    expect(header.contains(chip)).toBe(true)
    expect(isHiddenByClass(chip)).toBe(false)
  })

  it.each(ALL_TABS)('@AC-RESP-7-2 save controls and status stay visible on the %s tab', async name => {
    renderEMR('drawer')
    await openVisitA()
    await userEvent.click(tab(name))

    const bar = document.querySelector('[data-emr-pinned="savebar"]') as HTMLElement
    expect(bar).not.toBeNull()
    expect(isHiddenByClass(bar)).toBe(false)
    const save = screen.getByText(/save record/i)
    expect(bar.contains(save)).toBe(true)

    await userEvent.click(save)
    const status = await screen.findByText('Saved')
    expect(bar.contains(status)).toBe(true)
    expect(isHiddenByClass(status)).toBe(false)
  })

  it('@AC-RESP-7-3 unsaved Assessment text survives SOAP to Attachments & Rx and back, same node', async () => {
    renderEMR('drawer')
    await openVisitA()
    await userEvent.click(screen.getByText('Assessment'))
    const assessment = await screen.findByDisplayValue('Visit A')
    await userEvent.clear(assessment)
    await userEvent.type(assessment, 'Unsaved assessment')

    await userEvent.click(tab(TAB_ATTACH))
    await userEvent.click(tab(TAB_SOAP))

    expect(screen.getByDisplayValue('Unsaved assessment')).toBe(assessment)
    expect(isHiddenByClass(assessment)).toBe(false)
  })

  it('@AC-RESP-7-4 switching to Patient keeps the same record open and not new (save is a PUT)', async () => {
    renderEMR('drawer')
    await openVisitA()
    await userEvent.click(tab(TAB_PATIENT))
    await userEvent.click(screen.getByText(/save record/i))
    await screen.findByText('Saved')

    expect(putMock).toHaveBeenCalledTimes(1)
    expect(putMock.mock.calls[0][0]).toBe('/api/medical-records/7')
    expect(postMock).not.toHaveBeenCalledWith('/api/medical-records', expect.anything())
  })

  it('@AC-RESP-7-5 canvas has no fixed pixel width and a touch marker still reaches the save payload', async () => {
    renderEMR('drawer')
    await openVisitA()
    await userEvent.click(screen.getByText('Objective'))
    await screen.findByText(/Anatomy Annotation/i)

    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    for (let n: Element | null = canvas; n && n !== document.body; n = n.parentElement) {
      expect(n.className).not.toMatch(/(^|\s)w-\[\d+px\]/)
    }
    expect(canvas.className).toContain('w-full')
    expect(canvas.parentElement?.className).toContain('max-w-full')

    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20, pointerId: 1 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    await userEvent.click(screen.getByText(/save record/i))
    await screen.findByText('Saved')

    const body = putMock.mock.calls[0][1] as { anatomyAnnotation: unknown }
    expect(body.anatomyAnnotation).toEqual({ template: 'Canine - Lateral', imageData: 'data:image/png;base64,MOCK' })
  })

  it('@AC-RESP-7-6 a new unsaved record stays new across tabs and saving creates exactly one record', async () => {
    renderEMR('drawer')
    await selectRex()
    await userEvent.click(screen.getByText(/new emr record/i))
    await userEvent.click(tab(TAB_ATTACH))

    expect(isHiddenByClass(screen.getByText(/save the emr first/i))).toBe(false)
    await userEvent.click(screen.getByText(/save record/i))
    await screen.findByText('Saved')

    const creates = postMock.mock.calls.filter(c => c[0] === '/api/medical-records')
    expect(creates).toHaveLength(1)
    expect(putMock).not.toHaveBeenCalled()
  })
})

// ─── Source census (arch §4a rule, ADR-0033) ─────────────────────────────────
describe('ClinicEMR portrait — no Tailwind responsive prefix as a mode switch', () => {
  it('ClinicEMR.tsx uses no sm: md: lg: xl: 2xl: class prefix', () => {
    expect(clinicEmrSource).not.toMatch(/(^|[\s"'`])(sm|md|lg|xl|2xl):/)
  })
})
