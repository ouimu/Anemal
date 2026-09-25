// src/frontend/src/__tests__/ClinicEMR.i18n.test.tsx
//
// I18N-10 (BA sign-off A-10 method): Thai-render coverage for ClinicEMR,
// sibling to (not inside) the 5 existing ClinicEMR test files
// (.characterization/.attachments/.petAvatar/.petIdParam/.weightSync.test.tsx),
// which stay the English-mode no-regression net (A-9) and are not touched by
// this file.
//
// Follows the same harness as ClinicEMR.characterization.test.tsx (real `api`
// mock, real QueryClientProvider + MemoryRouter, canvas 2D context stub — jsdom
// has no native canvas support) plus a `uiStore` mock forced to `th`, mirroring
// ClinicInpatient.i18n.test.tsx's convention.
//
// Fixture pet/owner/drug-instruction content is Thai (X-5) so the Latin-residue
// scan below isn't tripped up by legitimate free-text/name content (E-2).
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

vi.mock('../store/uiStore', () => ({
  useUiStore: (s: (s: { language: string }) => unknown) => s({ language: 'th' }),
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: (selector?: (s: { userId: number; hasPermission: (perm: string) => boolean }) => unknown) => {
    const state = { userId: 1, hasPermission: () => true }
    return selector ? selector(state) : state
  },
}))

const getMock    = vi.fn()
const postMock   = vi.fn()
const putMock    = vi.fn()
const deleteMock = vi.fn()

vi.mock('../utils/api', () => ({
  default: {
    get:    (...args: unknown[]) => getMock(...(args as [string, unknown])),
    post:   (...args: unknown[]) => postMock(...(args as [string, unknown])),
    put:    (...args: unknown[]) => putMock(...(args as [string, unknown])),
    delete: (...args: unknown[]) => deleteMock(...(args as [string])),
  },
}))

import ClinicEMR from '../views/clinic/ClinicEMR'

// `species` ('feline') now renders through the shared `speciesLabel()` helper
// (I18N-16 T3) on the sidebar chip, so it is Thai ('แมว') in these tests, not
// a Latin-residue exemption. `tab`/`Amoxicillin` are drug unit/name data
// content (E-2).
const pet = {
  id: 42, name: 'มะลิ', species: 'feline', allergies: 'เพนนิซิลลิน',
  owner: { firstName: 'สมหญิง', lastName: 'ใจดี', phone: '0812345678' },
}

const baseRecord = {
  id: 7, petId: 42, createdAt: '2026-07-21T00:00:00.000Z', assessment: 'ตรวจทั่วไป',
  subjective: 'ซึมเล็กน้อย', objective: 'ตรวจร่างกายปกติ', plan: 'นัดตรวจซ้ำใน 3 วัน',
  weightKg: 4.5, temperatureC: 38.2, heartRateBpm: 110, respRateRpm: 24,
  anatomyAnnotation: null as { template: string; imageData: string } | null,
  prescriptions: [] as unknown[],
  attachments: [] as unknown[],
}

let recordsStore: Record<number, typeof baseRecord> = {}
let recordsList: { id: number; assessment?: string; createdAt: string }[] = []

function defaultGetImpl(url: string, config?: { params?: Record<string, unknown> }) {
  if (url === '/api/search') {
    const q = (config?.params?.q as string | undefined)?.toLowerCase()
    if (!q || q.length < 2) return Promise.resolve({ data: { data: [] } })
    return Promise.resolve({
      data: { data: [{ petId: 42, petName: 'มะลิ', species: 'feline', ownerName: 'สมหญิง ใจดี', phone: '0812345678' }] },
    })
  }
  if (url === '/api/pets/42') return Promise.resolve({ data: { data: pet } })
  if (url === '/api/medical-records') return Promise.resolve({ data: { data: { records: recordsList } } })
  const m = url.match(/^\/api\/medical-records\/(\d+)$/)
  if (m) return Promise.resolve({ data: { data: recordsStore[Number(m[1])] ?? null } })
  if (url === '/api/products') {
    return Promise.resolve({ data: { data: { products: [{ id: 900, name: 'Amoxicillin', unit: 'tab', stockQuantity: 40 }] } } })
  }
  return Promise.resolve({ data: { data: null } })
}

beforeEach(() => {
  getMock.mockReset(); postMock.mockReset(); putMock.mockReset(); deleteMock.mockReset()
  getMock.mockImplementation(defaultGetImpl)
  postMock.mockResolvedValue({ data: { data: { id: 7 } } })
  putMock.mockResolvedValue({ data: { data: { id: 7 } } })
  deleteMock.mockResolvedValue({ data: { success: true } })
  recordsStore = { 7: { ...baseRecord } }
  recordsList = [{ id: 7, assessment: 'ตรวจทั่วไป', createdAt: baseRecord.createdAt }]
})

function renderEMR() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><ClinicEMR /></MemoryRouter>
    </QueryClientProvider>
  )
}

async function selectPetAndOpenRecord() {
  await userEvent.type(screen.getByPlaceholderText('ชื่อสัตว์เลี้ยงหรือเจ้าของ…'), 'มะลิ')
  await userEvent.click(await screen.findByText('มะลิ', { selector: 'p' }))
  await userEvent.click(await screen.findByText('ตรวจทั่วไป'))
}

/** Exemptions per E-2 (data content — filename, uploader-derived size/type
 *  badge, drug name/unit) and the R-1 out-of-scope species chip documented
 *  above. The attachment-types hint (#attachmentTypesHint) legitimately keeps
 *  the English file-type names (JPG/PNG/.../Word/Excel) per its glossary
 *  wording — only "max" is translated to "สูงสุด". `formatFileSize`'s KB/MB
 *  unit suffix is an existing, out-of-scope helper (not part of I18N-9). */
const EXEMPT_STRINGS = new Set<string>([
  'tab', 'Amoxicillin',
  'JPG, PNG, GIF, WebP, PDF, Word, Excel · สูงสุด 25 MB',
  'ผลตรวจเลือด.pdf', '2.0 KB', 'lab',
])

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
  container.querySelectorAll('[aria-label]').forEach(el => {
    const v = el.getAttribute('aria-label')
    if (v) out.push(v)
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

describe('ClinicEMR — Thai i18n (I18N-10): empty state', () => {
  it('(a) renders the Thai empty-state title, body, and Find Patient panel', () => {
    renderEMR()
    expect(screen.getByText('เวชระเบียน')).toBeInTheDocument() // emptyStateTitle
    expect(screen.getByText('ค้นหาผู้ป่วยเพื่อเริ่มหรือบันทึกเวชระเบียนต่อ')).toBeInTheDocument() // S-13
    expect(screen.getByText('ค้นหาผู้ป่วย')).toBeInTheDocument() // findPatient
    expect(screen.getByPlaceholderText('ชื่อสัตว์เลี้ยงหรือเจ้าของ…')).toBeInTheDocument()
  })

  it('(b)/(c) empty state has no Latin residue and no raw key leakage', () => {
    const { container } = renderEMR()
    assertNoLatinResidue(container)
    assertNoRawKeyLeak(container)
  })
})

describe('ClinicEMR — Thai i18n (I18N-10): SOAP editor and all 4 tabs', () => {
  it('(a) tab bar renders all 4 Thai SOAP labels and the recent-visit row uses formatDate (R-2)', async () => {
    renderEMR()
    await selectPetAndOpenRecord()
    expect(screen.getByText('แมว')).toBeInTheDocument() // sidebar species chip (I18N-16 T3, speciesLabel)
    expect(screen.getByText('ประวัติและอาการ (S)')).toBeInTheDocument()
    expect(screen.getByText('ผลการตรวจ (O)')).toBeInTheDocument()
    expect(screen.getByText('การประเมิน (A)')).toBeInTheDocument()
    expect(screen.getByText('แผนการรักษา (P)')).toBeInTheDocument()
    // ISO 2026-07-21 -> th-TH-u-ca-gregory 21 ก.ค. 2026 (Gregorian year, not พ.ศ. — G-1)
    expect(screen.getByText('21 ก.ค. 2026')).toBeInTheDocument()
  })

  it('(a) allergy badge uses the {allergies} token, not string concatenation (R-3)', async () => {
    renderEMR()
    await selectPetAndOpenRecord()
    expect(screen.getByText('ภูมิแพ้: เพนนิซิลลิน')).toBeInTheDocument()
  })

  it('(a) Visit fallback label renders in Thai when a record has no assessment', async () => {
    recordsList = [{ id: 7, createdAt: baseRecord.createdAt }] // no `assessment`
    recordsStore = { 7: { ...baseRecord, assessment: undefined as unknown as string } }
    renderEMR()
    await userEvent.type(screen.getByPlaceholderText('ชื่อสัตว์เลี้ยงหรือเจ้าของ…'), 'มะลิ')
    await userEvent.click(await screen.findByText('มะลิ', { selector: 'p' }))
    expect(await screen.findByText('การตรวจรักษา')).toBeInTheDocument() // visitFallback
  })

  it('(a) Objective tab renders Thai Vital Signs, vitals labels/units, notes, and Anatomy Annotation', async () => {
    renderEMR()
    await selectPetAndOpenRecord()
    await userEvent.click(screen.getByText('ผลการตรวจ (O)'))

    expect(screen.getByText('สัญญาณชีพ')).toBeInTheDocument() // vitalSigns
    expect(screen.getByText('กก.')).toBeInTheDocument() // weight VitalStepper unit (I18N-16 T2, kgUnit)
    expect(screen.getByLabelText('อัตราการเต้นของหัวใจ')).toHaveValue(110) // heartRate
    expect(screen.getByLabelText('อัตราการหายใจ')).toHaveValue(24) // respRate
    expect(screen.getAllByText('ครั้ง/นาที')).toHaveLength(2) // unitBpm + unitRpm
    expect(screen.getByText('บันทึกการตรวจร่างกาย')).toBeInTheDocument() // physicalExamNotes
    expect(screen.getByPlaceholderText('สิ่งที่ตรวจพบ การฟังเสียงด้วยหูฟัง การคลำ…')).toBeInTheDocument()
    expect(screen.getByText('ภาพกายวิภาคประกอบ')).toBeInTheDocument() // anatomyAnnotation

    // AnatomyCanvas: template chips (§5.3 map), eraser/clear tool labels (#84),
    // and the {template} instruction token (R-3).
    expect(screen.getByText('สุนัข – ด้านข้าง')).toBeInTheDocument() // Canine - Lateral
    expect(screen.getByText('สุนัข – มุมบน')).toBeInTheDocument() // Canine - Dorsal
    expect(screen.getByText('แมว – ด้านข้าง')).toBeInTheDocument() // Feline - Lateral
    expect(screen.getByText('ยางลบ')).toBeInTheDocument() // eraserTool
    expect(screen.getByText('ล้างภาพ')).toBeInTheDocument() // clearCanvas
    expect(screen.getByText('สุนัข – ด้านข้าง — ใช้ปากกาสไตลัสหรือนิ้วในการวาด')).toBeInTheDocument()
  })

  it('(a) Assessment and Plan tabs render their (pre-existing, frozen) Thai placeholders', async () => {
    renderEMR()
    await selectPetAndOpenRecord()
    await userEvent.click(screen.getByText('การประเมิน (A)'))
    expect(screen.getByPlaceholderText('การวินิจฉัย')).toBeInTheDocument()
    await userEvent.click(screen.getByText('แผนการรักษา (P)'))
    expect(screen.getByPlaceholderText('การรักษา')).toBeInTheDocument()
  })

  it('R-1: switching SOAP/anatomy tabs never renders the raw English state value as visible tab text', async () => {
    renderEMR()
    await selectPetAndOpenRecord()
    // The raw state values ('Subjective', 'Canine - Lateral', …) must not leak
    // as visible text — only their Thai labels (already asserted above) should.
    expect(screen.queryByText('Subjective')).toBeNull()
    await userEvent.click(screen.getByText('ผลการตรวจ (O)'))
    expect(screen.queryByText('Canine - Lateral')).toBeNull()
  })

  it('(b)/(c) Objective tab (SOAP body + canvas) has no Latin residue and no raw key leakage', async () => {
    const { container } = renderEMR()
    await selectPetAndOpenRecord()
    await userEvent.click(screen.getByText('ผลการตรวจ (O)'))
    assertNoLatinResidue(container)
    assertNoRawKeyLeak(container)
  })
})

describe('ClinicEMR — Thai i18n (I18N-10): C-1 regression — save status drives colour, not text', () => {
  it('a successful save shows the Thai "Saved" message with the success style', async () => {
    renderEMR()
    await selectPetAndOpenRecord()
    await userEvent.click(screen.getByText('บันทึกข้อมูล')) // saveRecord
    const msg = await screen.findByText('บันทึกแล้ว') // saved
    expect(msg.className).toContain('text-success')
    expect(msg.className).not.toContain('text-error')
  })

  it('a failed save shows a Thai failure message with the error style, never the success style', async () => {
    putMock.mockRejectedValueOnce({ response: { data: {} } })
    renderEMR()
    await selectPetAndOpenRecord()
    await userEvent.click(screen.getByText('บันทึกข้อมูล'))
    const msg = await screen.findByText('บันทึกไม่สำเร็จ') // failedToSave fallback
    expect(msg.className).toContain('text-error')
    expect(msg.className).not.toContain('text-success')
  })
})

describe('ClinicEMR — Thai i18n (I18N-10): Prescriptions panel', () => {
  it('(a) renders the Thai heading, search placeholder, and "save first" fallback for an unsaved new record', async () => {
    renderEMR()
    await userEvent.type(screen.getByPlaceholderText('ชื่อสัตว์เลี้ยงหรือเจ้าของ…'), 'มะลิ')
    await userEvent.click(await screen.findByText('มะลิ', { selector: 'p' }))
    await userEvent.click(screen.getByText('บันทึกการรักษาใหม่')) // newRecord (pre-existing key, already Thai)
    expect(screen.getByText('กรุณาบันทึกเวชระเบียนก่อนเพิ่มรายการยา')).toBeInTheDocument() // saveFirstForPrescriptions
  })

  it('(a) an existing record shows the Thai Prescriptions heading and drug search placeholder', async () => {
    renderEMR()
    await selectPetAndOpenRecord()
    expect(screen.getByText('รายการยา')).toBeInTheDocument() // prescriptions
    expect(screen.getByPlaceholderText('ค้นหายาด้วยชื่อหรือบาร์โค้ด…')).toBeInTheDocument()
  })

  it('(a) selecting a drug shows the Thai stock label, clear aria, and dosage placeholder', async () => {
    renderEMR()
    await selectPetAndOpenRecord()
    await userEvent.type(screen.getByPlaceholderText('ค้นหายาด้วยชื่อหรือบาร์โค้ด…'), 'Amox')
    const drugOption = await screen.findByText('Amoxicillin')
    await userEvent.click(drugOption)

    expect(screen.getByText('คงเหลือ: 40 tab')).toBeInTheDocument() // stockLabel token
    expect(screen.getByLabelText('ล้างยาที่เลือก')).toBeInTheDocument() // clearSelectedDrugAria
    expect(screen.getByPlaceholderText('วิธีใช้และขนาดยา…')).toBeInTheDocument() // dosageInstructionsPlaceholder
    expect(screen.getByText('เพิ่มรายการยา')).toBeInTheDocument() // addPrescription
  })
})

describe('ClinicEMR — Thai i18n (I18N-10): Attachments panel', () => {
  it('(a) empty attachments shows the Thai heading, hint, upload label, and empty state', async () => {
    renderEMR()
    await selectPetAndOpenRecord()
    expect(screen.getByText('ไฟล์แนบ')).toBeInTheDocument() // attachments
    expect(screen.getByText(/สูงสุด 25 MB/)).toBeInTheDocument() // attachmentTypesHint
    expect(screen.getByText('อัปโหลด')).toBeInTheDocument() // upload
    expect(screen.getByText('ยังไม่มีไฟล์แนบ')).toBeInTheDocument() // noAttachmentsYet
  })

  it('(a)/(d) delete attachment: aria-label is Thai and window.confirm receives the S-4 message with {file} substituted', async () => {
    recordsStore[7] = {
      ...baseRecord,
      attachments: [{ id: 55, fileName: 'ผลตรวจเลือด.pdf', fileType: 'lab', fileSize: 2048, storageKey: 'k1', uploadedByUser: { id: 1, name: 'หมอสมชาย' }, createdAt: baseRecord.createdAt }],
    }
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderEMR()
    await selectPetAndOpenRecord()
    await screen.findByText('ผลตรวจเลือด.pdf')

    const deleteBtn = screen.getByLabelText('ลบไฟล์แนบ') // deleteAttachmentAria
    await userEvent.click(deleteBtn)
    expect(confirmSpy).toHaveBeenCalledWith('ลบ "ผลตรวจเลือด.pdf" ใช่หรือไม่? การดำเนินการนี้ย้อนกลับไม่ได้')
    expect(deleteMock).not.toHaveBeenCalled() // cancelled
    confirmSpy.mockRestore()
  })

  it('(a) oversized/unsupported file selection shows the Thai client-side error text', async () => {
    renderEMR()
    await selectPetAndOpenRecord()
    await screen.findByText('ไฟล์แนบ')

    const bigFile = new File([new Uint8Array(26 * 1024 * 1024)], 'huge.pdf', { type: 'application/pdf' })
    const input = screen.getByTestId('emr-attachment-file-input') as HTMLInputElement
    await userEvent.upload(input, bigFile, { applyAccept: false })
    expect(await screen.findByText(/ขนาดใหญ่เกินไป/)).toBeInTheDocument() // fileTooLarge

    const badFile = new File(['<svg></svg>'], 'evil.svg', { type: 'image/svg+xml' })
    await userEvent.upload(input, badFile, { applyAccept: false })
    expect(await screen.findByText('ไม่รองรับไฟล์ประเภทนี้')).toBeInTheDocument() // unsupportedFileType
  })

  it('(b)/(c) attachments panel has no Latin residue and no raw key leakage', async () => {
    recordsStore[7] = {
      ...baseRecord,
      attachments: [{ id: 55, fileName: 'ผลตรวจเลือด.pdf', fileType: 'lab', fileSize: 2048, storageKey: 'k1', uploadedByUser: { id: 1, name: 'หมอสมชาย' }, createdAt: baseRecord.createdAt }],
    }
    renderEMR()
    await selectPetAndOpenRecord()
    const heading = await screen.findByText('ไฟล์แนบ')
    const panel = heading.closest('.border-l') as HTMLElement
    await waitFor(() => screen.getByText('ผลตรวจเลือด.pdf'))
    assertNoLatinResidue(panel)
    assertNoRawKeyLeak(panel)
  })
})
