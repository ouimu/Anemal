// src/frontend/src/__tests__/ClinicInpatient.i18n.test.tsx
//
// I18N-8 (BA sign-off A-10 method): Thai-render coverage for ClinicInpatient,
// sibling to (not inside) src/__tests__/ClinicInpatient.test.tsx and
// .characterization.test.tsx, which stay the English-mode no-regression net
// (A-9) and are not touched by this file.
//
// Follows ClinicInpatient's OWN test convention (real QueryClientProvider +
// a mocked `api` module) rather than a wholesale react-query mock, since this
// screen's many interacting useQuery/useMutation hooks need real invalidation
// behaviour to exercise multi-step flows (CareModal wizard, Edit, History).
//
// Fixture pet/owner/doctor names are Thai (X-5) so the Latin-residue scan
// below isn't tripped up by legitimate free-text/name content (E-2).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../store/uiStore', () => ({
  useUiStore: (s: (s: { language: string }) => unknown) => s({ language: 'th' }),
}))

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

const doctors = [{ id: 7, name: 'หมอสมชาย' }]

const activeAdmission = {
  id: 500, petId: 42, cageNo: 'B-2', status: 'admitted', reason: 'พักฟื้นหลังผ่าตัด',
  admittedAt: '2026-07-01T00:00:00.000Z', doctorInCharge: 7, dailyRate: 400, notes: null,
  _count: { careLogs: 0 },
  pet: { id: 42, name: 'มะลิ', species: 'feline' },
}

function stubGet(list: unknown[], detail: unknown = { ...activeAdmission, careLogs: [] }) {
  getMock.mockImplementation((url: string) => {
    if (url === '/api/hospitalizations/active') return Promise.resolve({ data: { data: list } })
    if (url === '/api/appointments/doctors') return Promise.resolve({ data: { data: doctors } })
    if (url === '/api/hospitalizations/500') return Promise.resolve({ data: { data: detail } })
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
}

/** Exemptions: E-4 keeps NPO in Latin after the Thai term (glossary §5.3
 *  feeding map). `hospit.pet.species` ('feline') now renders through the
 *  shared `speciesLabel()` helper (I18N-16 T3) on the CageCard chip, so it
 *  is Thai ('แมว') in these tests, not a Latin-residue exemption. */
const EXEMPT_STRINGS = new Set<string>(['งดน้ำงดอาหาร (NPO)'])

function collectResidueStrings(container: HTMLElement): string[] {
  const out: string[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const parent = node.parentElement
    if (parent?.classList.contains('material-symbols-outlined')) continue
    const text = node.textContent?.trim()
    if (text) out.push(text)
  }
  container.querySelectorAll('[placeholder]').forEach(el => {
    const v = el.getAttribute('placeholder')
    if (v) out.push(v)
  })
  container.querySelectorAll('[title]').forEach(el => {
    const v = el.getAttribute('title')
    if (v) out.push(v)
  })
  container.querySelectorAll('[aria-label]').forEach(el => {
    const v = el.getAttribute('aria-label')
    if (v) out.push(v)
  })
  container.querySelectorAll('option').forEach(el => {
    if (el.textContent) out.push(el.textContent)
  })
  return out
}

function assertNoLatinResidue(container: HTMLElement): void {
  const offenders = collectResidueStrings(container)
    .filter(s => !EXEMPT_STRINGS.has(s))
    .filter(s => /[A-Za-z]{2,}/.test(s))
  expect(offenders, `Latin residue found: ${JSON.stringify(offenders)}`).toEqual([])
}

function assertNoRawKeyLeak(container: HTMLElement): void {
  const offenders = collectResidueStrings(container).filter(s => /\bclinic\.[a-z]+\.[A-Za-z]+/.test(s))
  expect(offenders, `Raw i18n key leaked into rendered text: ${JSON.stringify(offenders)}`).toEqual([])
}

describe('ClinicInpatient — Thai i18n (I18N-8): board view', () => {
  it('(a) renders key Thai strings', async () => {
    stubGet([activeAdmission])
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ClinicInpatient />
      </QueryClientProvider>
    )
    expect(await screen.findByText('กระดานผู้ป่วยใน')).toBeInTheDocument() // boardTitle
    await screen.findByText('มะลิ')
    expect(screen.getByText('แมว')).toBeInTheDocument() // CageCard species chip (I18N-16 T3, speciesLabel)
    expect(screen.getByText('รับเข้ารักษาแล้ว')).toBeInTheDocument() // statusAdmitted
    expect(screen.getByText('กรง B-2')).toBeInTheDocument() // cageNo
    expect(screen.getByText('หมอสมชาย')).toBeInTheDocument() // doctor name (data, untranslated)
    expect(screen.getByText('บันทึกการดูแล')).toBeInTheDocument() // logCare button
    expect(screen.getByText('จำหน่ายผู้ป่วย')).toBeInTheDocument() // discharge button
  })

  it('(a) shows the unassigned-doctor label when doctorInCharge is null', async () => {
    stubGet([{ ...activeAdmission, doctorInCharge: null }])
    renderBoard()
    expect(await screen.findByText('ยังไม่ระบุสัตวแพทย์')).toBeInTheDocument()
  })

  it('(b)/(c) board view has no Latin residue and no raw key leakage', async () => {
    stubGet([activeAdmission])
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ClinicInpatient />
      </QueryClientProvider>
    )
    await screen.findByText('มะลิ')
    assertNoLatinResidue(container)
    assertNoRawKeyLeak(container)
  })

  it('R-1: the raw status value is never rendered as visible text (only its Thai label is)', async () => {
    stubGet([activeAdmission])
    renderBoard()
    await screen.findByText('มะลิ')
    expect(screen.queryByText('admitted')).toBeNull()
  })
})

describe('ClinicInpatient — Thai i18n (I18N-8): CareModal steps 1-3', () => {
  async function openCareModal() {
    stubGet([activeAdmission])
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ClinicInpatient />
      </QueryClientProvider>
    )
    await screen.findByText('มะลิ')
    await userEvent.click(screen.getByText('บันทึกการดูแล'))
    await screen.findByText('เลือกรอบเวลา')
  }

  it('(a) step 1 renders the Thai step title and instruction', async () => {
    await openCareModal()
    expect(screen.getByText('เลือกรอบเวลา')).toBeInTheDocument() // stepSelectTimeSlot
    expect(screen.getByText('เลือกรอบเวลาการดูแล:')).toBeInTheDocument() // selectCareTimeSlot
  })

  it('(a) step 2 renders Thai vital labels and translated units', async () => {
    await openCareModal()
    await userEvent.click(screen.getByText('16:00'))
    await userEvent.click(screen.getByText('ถัดไป')) // common.next
    expect(screen.getByText('บันทึกสัญญาณชีพ')).toBeInTheDocument() // stepRecordVitals
    expect(screen.getByLabelText('อุณหภูมิ')).toBeInTheDocument() // temperature
    expect(screen.getByLabelText('อัตราการเต้นของหัวใจ')).toBeInTheDocument() // heartRate
    expect(screen.getByLabelText('อัตราการหายใจ')).toBeInTheDocument() // respRate
    expect(screen.getAllByText('ครั้ง/นาที').length).toBe(2) // unitBpm + unitRpm
  })

  it('(a)/(c) step 3 renders Thai feeding options and no raw key leakage', async () => {
    await openCareModal()
    await userEvent.click(screen.getByText('16:00'))
    await userEvent.click(screen.getByText('ถัดไป'))
    await userEvent.click(screen.getByText('ถัดไป'))
    expect(screen.getByText('การกินอาหาร')).toBeInTheDocument() // feedingStatusLabel
    expect(screen.getByText('หมายเหตุการดูแล')).toBeInTheDocument() // step title (distinct from Log Care)
    expect(screen.getByText((_, el) => el?.textContent === 'บันทึกการดูแล — มะลิ')).toBeInTheDocument()
    assertNoRawKeyLeak(document.body)
  })

  it('(b) full 3-step wizard has no Latin residue (Thai fixture, Thai active)', async () => {
    await openCareModal()
    await userEvent.click(screen.getByText('16:00'))
    await userEvent.click(screen.getByText('ถัดไป'))
    await userEvent.click(screen.getByText('ถัดไป'))
    assertNoLatinResidue(document.body)
  })

  it('R-1: submitting in Thai mode POSTs the same English feedingStatus value as English mode', async () => {
    await openCareModal()
    await userEvent.click(screen.getByText('16:00'))
    await userEvent.click(screen.getByText('ถัดไป'))
    await userEvent.click(screen.getByText('ถัดไป'))
    await userEvent.selectOptions(screen.getByLabelText('การกินอาหาร'), 'Ate some')
    await userEvent.click(screen.getByText('บันทึกข้อมูลการดูแล')) // saveCareRecord

    await waitFor(() => expect(postMock).toHaveBeenCalled())
    const [, payload] = postMock.mock.calls[0]
    expect(payload.feedingStatus).toBe('Ate some')
  })
})

describe('ClinicInpatient — Thai i18n (I18N-8): Edit Admission', () => {
  it('(a)/(b)/(c) renders Thai title and fields with no Latin residue or raw keys', async () => {
    stubGet([activeAdmission])
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ClinicInpatient />
      </QueryClientProvider>
    )
    await screen.findByText('มะลิ')
    await userEvent.click(screen.getByLabelText('แก้ไขการรับเข้ารักษา')) // editAdmissionAria
    const heading = await screen.findByText((_, el) => el?.textContent === 'แก้ไขการรับเข้ารักษา — มะลิ')
    expect(heading).toBeInTheDocument()
    const panel = heading.closest('.bg-surface') as HTMLElement
    assertNoLatinResidue(panel)
    assertNoRawKeyLeak(panel)
  })
})

describe('ClinicInpatient — Thai i18n (I18N-8): Care History', () => {
  it('(a)/(b)/(c) renders Thai labels for a populated history entry, no residue or raw keys', async () => {
    const careLog = {
      id: 1, recordedAt: '2026-07-05T08:00:00.000Z', timeSlot: '08:00',
      temperatureC: 38.5, heartRateBpm: 90, respRateRpm: 20,
      feedingStatus: 'Ate some', medicationGiven: 'ยาปฏิชีวนะ', notes: 'อาการคงที่',
      performedBy: 12,
    }
    stubGet([activeAdmission], { ...activeAdmission, careLogs: [careLog] })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ClinicInpatient />
      </QueryClientProvider>
    )
    await screen.findByText('มะลิ')
    await userEvent.click(screen.getByLabelText('ดูประวัติการดูแล')) // viewCareHistoryAria
    const heading = await screen.findByText('ประวัติการดูแล')
    expect(heading).toBeInTheDocument()

    expect(screen.getByText('อุณหภูมิ: 38.5°C')).toBeInTheDocument()
    expect(screen.getByText('หัวใจ: 90 ครั้ง/นาที')).toBeInTheDocument()
    expect(screen.getByText('หายใจ: 20 ครั้ง/นาที')).toBeInTheDocument()
    expect(screen.getByText('การกินอาหาร: กินบางส่วน')).toBeInTheDocument() // mapped feedingStatus
    expect(screen.getByText(`ยา/การรักษา: ${careLog.medicationGiven}`)).toBeInTheDocument()
    expect(screen.getByText((_, el) => el?.textContent === 'ผู้บันทึก: เจ้าหน้าที่ #12')).toBeInTheDocument()

    const panel = heading.closest('.bg-surface') as HTMLElement
    assertNoLatinResidue(panel)
    assertNoRawKeyLeak(panel)
  })

  it('(a) shows the Thai empty state when no care logs exist', async () => {
    stubGet([activeAdmission], { ...activeAdmission, careLogs: [] })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ClinicInpatient />
      </QueryClientProvider>
    )
    await screen.findByText('มะลิ')
    await userEvent.click(screen.getByLabelText('ดูประวัติการดูแล'))
    expect(await screen.findByText('ยังไม่มีประวัติการดูแล')).toBeInTheDocument()
  })
})

describe('ClinicInpatient — Thai i18n (I18N-8): AdmitModal (entered from Inpatient)', () => {
  function renderAdmitModal() {
    getMock.mockImplementation((url: string) => {
      if (url === '/api/appointments/doctors') return Promise.resolve({ data: { data: doctors } })
      return Promise.resolve({ data: { data: null } })
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={queryClient}>
        <AdmitModal petId={42} onClose={vi.fn()} onSaved={vi.fn()} />
      </QueryClientProvider>
    )
  }

  it('(a) renders Thai title and field placeholders', () => {
    renderAdmitModal()
    expect(screen.getByText('รับเป็นผู้ป่วยใน')).toBeInTheDocument() // admitToInpatient
    expect(screen.getByPlaceholderText('สาเหตุที่รับเข้ารักษา')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('หมายเลขกรง (ไม่จำเป็น)')).toBeInTheDocument()
    expect(screen.getByText('สัตวแพทย์ผู้รับผิดชอบ (ไม่จำเป็น)')).toBeInTheDocument()
    expect(screen.getByText('ยกเลิก')).toBeInTheDocument() // common.cancel
    expect(screen.getByText('รับเข้ารักษา')).toBeInTheDocument() // admitPatient
  })

  it('(b)/(c) has no Latin residue and no raw key leakage', () => {
    const { container } = renderAdmitModal()
    assertNoLatinResidue(container)
    assertNoRawKeyLeak(container)
  })

  it('R-1: submitting in Thai mode POSTs the same petId/reason as English mode', async () => {
    renderAdmitModal()
    await userEvent.type(screen.getByPlaceholderText('สาเหตุที่รับเข้ารักษา'), 'สังเกตอาการ')
    await userEvent.click(screen.getByText('รับเข้ารักษา'))

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/api/hospitalizations', expect.objectContaining({
        petId: 42, reason: 'สังเกตอาการ',
      }))
    })
  })
})

describe('ClinicInpatient — Thai i18n (I18N-8): window.confirm messages (S-2, S-3, A-10 (d))', () => {
  it('discharge confirm() receives the Thai S-2 message with the pet name substituted', async () => {
    stubGet([activeAdmission])
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderBoard()
    await screen.findByText('มะลิ')

    await userEvent.click(screen.getByText('จำหน่ายผู้ป่วย'))
    expect(confirmSpy).toHaveBeenCalledWith('จำหน่ายผู้ป่วย มะลิ ใช่หรือไม่? ระบบจะออกใบแจ้งหนี้ค่ารักษา')
    confirmSpy.mockRestore()
  })

  it('delete-admission confirm() receives the Thai S-3 message with the pet name substituted', async () => {
    stubGet([activeAdmission])
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderBoard()
    await screen.findByText('มะลิ')

    await userEvent.click(screen.getByLabelText('ลบรายการรับเข้ารักษา')) // deleteAdmissionAria
    expect(confirmSpy).toHaveBeenCalledWith('ลบรายการรับเข้ารักษาของ มะลิ ใช่หรือไม่? การดำเนินการนี้ย้อนกลับไม่ได้')
    confirmSpy.mockRestore()
  })
})
