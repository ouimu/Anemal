// src/frontend/src/__tests__/ClinicPets.i18n.test.tsx
//
// I18N-11/I18N-12 (BA sign-off A-10 method): Thai-render coverage for
// ClinicPets, extending the 3 tests that already existed on this branch
// (kept verbatim below, in the first `describe` block) rather than a new
// sibling file (F-2/A-10 — this file already existed before I18N-12).
//
// Harness mirrors ClinicPets.characterization.test.tsx (real `api` mock,
// real QueryClientProvider) rather than the original 3 tests' wholesale
// `@tanstack/react-query` mock, because covering owner/pet detail, all 3
// PetDetail tabs, and every modal needs query-key-aware fixture data — a
// static `{ data: [], isLoading: false }` mock cannot support that. The
// mock below is a superset: it still answers the original 3 tests' calls
// (an empty owners list, since neither asserts on list content), so their
// assertions are unaffected.
//
// Fixture pet/owner content is Thai (X-5) so the Latin-residue scan below
// isn't tripped up by legitimate free-text/name content (E-2).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../store/uiStore', () => ({
  useUiStore: (s: (s: { language: string }) => unknown) => s({ language: 'th' }),
}))

// ─── Fixtures (Thai content, X-5) ──────────────────────────────────────────
const ownerA = {
  id: 1, firstName: 'สมหญิง', lastName: 'ใจดี', phone: '0812345678', email: 'somying@example.com',
  address: '123 ถนนสุขุมวิท', idCardType: 'thai_id', idCardNumber: '1234567890123', isActive: true,
  pets: [{ id: 10, ownerId: 1, name: 'มะลิ', species: 'canine', isActive: true }],
}
const ownerNoPets = { id: 2, firstName: 'ไม่มี', lastName: 'สัตว์เลี้ยง', phone: '0899999999', isActive: true, pets: [] }
const petA = {
  id: 10, ownerId: 1, name: 'มะลิ', species: 'canine', breed: 'ลาบราดอร์', color: 'น้ำตาล',
  gender: 'male', birthDate: '2020-01-01T00:00:00.000Z', weightKg: 20, microchipId: 'CHIP123',
  allergies: 'ละอองเกสร', underlyingConditions: '', isActive: true,
  medicalRecords: [{ id: 5, createdAt: '2026-07-21T00:00:00.000Z', assessment: 'ตรวจทั่วไป' }],
  vaccinations: [{ id: 7, vaccineName: 'พิษสุนัขบ้า', administeredAt: '2026-01-01T00:00:00.000Z', nextDueAt: '2027-01-01T00:00:00.000Z' }],
}

let owners: { id: number }[] = [ownerA, ownerNoPets]
const ownerDetails: Record<number, unknown> = { 1: ownerA, 2: ownerNoPets }
const petDetails: Record<number, unknown> = { 10: petA }

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: (opts: { queryKey: unknown[] }) => {
      const [entity, a] = opts.queryKey as [string, unknown]
      if (entity === 'owners') return { data: { owners }, isLoading: false }
      if (entity === 'owner') return { data: a != null ? { data: ownerDetails[a as number] } : undefined, isLoading: false }
      if (entity === 'pet') return { data: a != null ? { data: petDetails[a as number] } : undefined, isLoading: false }
      if (entity === 'appointments') return { data: [], isLoading: false } // AdmitModal's doctors list
      return { data: undefined, isLoading: false }
    },
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  }
})

const getMock = vi.fn()
const postMock = vi.fn()
const putMock = vi.fn()
const deleteMock = vi.fn()
vi.mock('../utils/api', () => ({
  default: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    put: (...args: unknown[]) => putMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}))

const authState: { permissions: string[] } = { permissions: [] }
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { hasPermission: (code: string) => boolean }) => unknown) =>
    selector({ hasPermission: (code: string) => authState.permissions.includes(code) }),
}))

import ClinicPets from '../views/clinic/ClinicPets'

beforeEach(() => {
  owners = [ownerA, ownerNoPets]
  authState.permissions = ['crm.edit', 'crm.delete', 'vaccination.create', 'emr.view', 'inpatient.manage']
  getMock.mockReset(); postMock.mockReset(); putMock.mockReset(); deleteMock.mockReset()
  getMock.mockImplementation((url: string) => {
    if (url === '/api/appointments/doctors') return Promise.resolve({ data: { data: [] } })
    return Promise.resolve({ data: { data: null } })
  })
  postMock.mockResolvedValue({ data: { data: { id: 999 } } })
  putMock.mockResolvedValue({ data: { data: {} } })
  deleteMock.mockResolvedValue({ status: 204 })
})

function renderPets() {
  // AdmitModal (rendered from the Pet Profile "รับเป็นผู้ป่วยใน" button, A-13)
  // uses the real `useMutation`/`useQueryClient` from @tanstack/react-query
  // (only `useQuery` is overridden above), so a real QueryClient must be in
  // context even though most queries in this file are answered by the mock.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><ClinicPets /></MemoryRouter>
    </QueryClientProvider>
  )
}

async function selectOwner(name = 'สมหญิง ใจดี') {
  await userEvent.click(screen.getByText(name))
}
async function openOwnerDetail() {
  renderPets()
  await screen.findByText('สมหญิง ใจดี')
  await selectOwner()
  await screen.findByText('somying@example.com')
}
async function openPetDetail() {
  await openOwnerDetail()
  await userEvent.click(screen.getByText('มะลิ'))
  await screen.findByText('ข้อมูลสัตว์เลี้ยง') // petProfileHeading
}

function panelFor(headerText: string): HTMLElement {
  const header = screen.getByText(headerText)
  const panel = header.closest('.bg-surface')
  if (!panel) throw new Error(`No .bg-surface ancestor found for header "${headerText}"`)
  return panel as HTMLElement
}

// ─── Latin-residue / raw-key-leak helpers (A-10 method) ────────────────────
const EXEMPT_STRINGS = new Set<string>([
  // R-1 stored values that intentionally stay English (X-1), and E-2 data
  // content that is out of scope for translation.
  'canine', 'male', 'CHIP123', 'jane@example.com', 'somying@example.com',
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
  container.querySelectorAll('[title]').forEach(el => {
    const v = el.getAttribute('title')
    if (v) out.push(v)
  })
  container.querySelectorAll('option').forEach(el => {
    const v = el.textContent?.trim()
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

// ─── Original 3 tests (pre-I18N-12) — kept verbatim ────────────────────────
describe('ClinicPets — Thai i18n', () => {
  it('renders Thai add owner button', () => {
    render(<ClinicPets />)
    expect(screen.getByText(/เพิ่มเจ้าของใหม่/i)).toBeInTheDocument()
  })
  it('renders Thai phone placeholder in add owner modal', async () => {
    render(<ClinicPets />)
    await userEvent.click(screen.getByText(/เพิ่มเจ้าของใหม่/i))
    expect(screen.getByPlaceholderText(/เบอร์โทรศัพท์/i)).toBeInTheDocument()
  })
  it('First and Last Name inputs allow shrinking below content width (no overflow)', async () => {
    render(<ClinicPets />)
    await userEvent.click(screen.getByText(/เพิ่มเจ้าของใหม่/i))
    const firstName = screen.getByPlaceholderText(/^ชื่อ$/)
    const lastName = screen.getByPlaceholderText(/นามสกุล/i)
    expect(firstName.className).toContain('min-w-0')
    expect(lastName.className).toContain('min-w-0')
  })
})

// ─── I18N-12: owner list / board-level states ──────────────────────────────
describe('ClinicPets — Thai i18n (I18N-12): owner list board states', () => {
  it('(a) shows Thai "No owners found." when the list is empty', async () => {
    owners = []
    renderPets()
    expect(await screen.findByText('ไม่พบเจ้าของ')).toBeInTheDocument()
  })

  it('(a) shows the Thai "Select an owner" empty state before any owner is picked', async () => {
    renderPets()
    await screen.findByText('สมหญิง ใจดี')
    expect(screen.getByText('เลือกเจ้าของ')).toBeInTheDocument()
    expect(screen.getByText('เลือกเจ้าของจากรายการเพื่อดูข้อมูลสัตว์เลี้ยง')).toBeInTheDocument()
  })

  it('(a) shows the Thai pet-count label ("N ตัว") for owners with and without pets', async () => {
    renderPets()
    await screen.findByText('1 ตัว') // ownerA has 1 pet -> petCountOne
    expect(screen.getByText('0 ตัว')).toBeInTheDocument() // ownerNoPets -> petCountOther
  })

  it('(a) OwnerPanel shows Thai "No pets yet. Add one above." for an owner with zero pets', async () => {
    renderPets()
    await screen.findByText('ไม่มี สัตว์เลี้ยง')
    await selectOwner('ไม่มี สัตว์เลี้ยง')
    expect(await screen.findByText('ยังไม่มีสัตว์เลี้ยง เพิ่มได้จากด้านบน')).toBeInTheDocument()
  })

  it('(b)/(c) owner list + empty right panel has no Latin residue and no raw key leakage', async () => {
    const { container } = renderPets()
    await screen.findByText('สมหญิง ใจดี')
    assertNoLatinResidue(container)
    assertNoRawKeyLeak(container)
  })
})

// ─── I18N-12: owner detail (OwnerPanel) ────────────────────────────────────
describe('ClinicPets — Thai i18n (I18N-12): owner detail', () => {
  it('(a)/(d) Deactivate is gated by a Thai window.confirm message with the {name} token and S-5 wording', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await openOwnerDetail()
    await userEvent.click(screen.getByTitle('ลบ')) // common.delete
    expect(confirmSpy).toHaveBeenCalledWith('ปิดใช้งาน สมหญิง ใจดี ใช่หรือไม่?')
    confirmSpy.mockRestore()
  })

  it('(a) delete failure falls back to the Thai "Failed to delete" message when the server sends none', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    deleteMock.mockRejectedValueOnce(new Error('network down'))
    await openOwnerDetail()
    await userEvent.click(screen.getByTitle('ลบ'))
    expect(await screen.findByText('ลบไม่สำเร็จ')).toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('(a) reactivate failure falls back to the Thai "Failed to reactivate" message', async () => {
    const inactiveOwner = { ...ownerA, isActive: false }
    ownerDetails[1] = inactiveOwner
    putMock.mockRejectedValueOnce(new Error('network down'))
    await openOwnerDetail()
    await userEvent.click(screen.getByText('เปิดใช้งานเจ้าของอีกครั้ง'))
    expect(await screen.findByText('เปิดใช้งานอีกครั้งไม่สำเร็จ')).toBeInTheDocument()
    ownerDetails[1] = ownerA
  })

  it('(a) Pets heading and Add Pet button render in Thai', async () => {
    await openOwnerDetail()
    expect(screen.getByText('สัตว์เลี้ยง (1)')).toBeInTheDocument()
    expect(screen.getByText('เพิ่มสัตว์เลี้ยง')).toBeInTheDocument()
  })

  it('(a) the pet card shows the Thai species label, not the raw stored value', async () => {
    await openOwnerDetail()
    expect(screen.getByText('สุนัข')).toBeInTheDocument()
    expect(screen.queryByText('canine')).not.toBeInTheDocument()
  })

  it('(b)/(c) owner detail panel has no Latin residue and no raw key leakage', async () => {
    await openOwnerDetail()
    const panel = screen.getByText('somying@example.com').closest('.overflow-y-auto') as HTMLElement
    assertNoLatinResidue(panel)
    assertNoRawKeyLeak(panel)
  })
})

// ─── I18N-12: Pet Profile — Overview tab ───────────────────────────────────
describe('ClinicPets — Thai i18n (I18N-12): Pet Profile Overview tab', () => {
  it('(a) hero chips show Thai species/gender labels and the Thai age label, never the raw stored value', async () => {
    await openPetDetail()
    expect(screen.getByText('รับเป็นผู้ป่วยใน')).toBeInTheDocument() // admitToInpatient
    expect(screen.getAllByText('สุนัข').length).toBeGreaterThan(0) // speciesCanine
    expect(screen.getAllByText('เพศผู้').length).toBeGreaterThan(0) // genderMale
    expect(screen.queryByText('canine')).not.toBeInTheDocument()
    expect(screen.queryByText('male')).not.toBeInTheDocument()
  })

  it('(a) every Overview row label and translated value renders in Thai, dates via formatDate (R-2)', async () => {
    await openPetDetail()
    expect(screen.getByText('ชนิดสัตว์')).toBeInTheDocument()
    expect(screen.getByText('สายพันธุ์')).toBeInTheDocument()
    expect(screen.getByText('เพศ')).toBeInTheDocument()
    expect(screen.getByText('วันเกิด')).toBeInTheDocument()
    // 2020-01-01 -> th-TH-u-ca-gregory: Gregorian year, Thai month abbreviation (G-1)
    expect(screen.getByText('01 ม.ค. 2020')).toBeInTheDocument()
    expect(screen.getByText('น้ำหนัก')).toBeInTheDocument()
    expect(screen.getByText('20 กก.')).toBeInTheDocument() // kgUnit
    expect(screen.getByText('สีขน')).toBeInTheDocument()
    expect(screen.getByText('หมายเลขไมโครชิป')).toBeInTheDocument()
    expect(screen.getByText('ภูมิแพ้')).toBeInTheDocument()
    expect(screen.getByText('โรคประจำตัว')).toBeInTheDocument()
  })

  it('(a) the allergy alert banner uses the {value} token, not string concatenation (R-3)', async () => {
    await openPetDetail()
    expect(screen.getByText('ภูมิแพ้: ละอองเกสร')).toBeInTheDocument()
  })

  it('(b)/(c) Overview tab has no Latin residue and no raw key leakage', async () => {
    await openPetDetail()
    assertNoLatinResidue(panelFor('ข้อมูลสัตว์เลี้ยง'))
    assertNoRawKeyLeak(panelFor('ข้อมูลสัตว์เลี้ยง'))
  })
})

// ─── I18N-12: Pet Profile — Medical / Vaccinations tabs ────────────────────
describe('ClinicPets — Thai i18n (I18N-12): Medical and Vaccinations tabs', () => {
  it('(a) Medical tab shows the Thai visit fallback, formatted date, and "View all in EMR"', async () => {
    await openPetDetail()
    await userEvent.click(screen.getByText('ประวัติการรักษา')) // tabMedical
    expect(screen.getByText('ตรวจทั่วไป')).toBeInTheDocument() // fixture assessment
    expect(screen.getByText('21 ก.ค. 2026')).toBeInTheDocument()
    expect(screen.getByText('ดูทั้งหมดในเวชระเบียน')).toBeInTheDocument()
  })

  it('(a) Medical tab shows the Thai S-15 no-access message without emr.view, not "no records yet"', async () => {
    authState.permissions = authState.permissions.filter(p => p !== 'emr.view')
    petDetails[10] = { ...petA, medicalRecords: [] }
    await openPetDetail()
    await userEvent.click(screen.getByText('ประวัติการรักษา'))
    expect(screen.getByText('คุณไม่มีสิทธิ์เข้าถึงข้อมูลทางคลินิก')).toBeInTheDocument()
    expect(screen.queryByText('ยังไม่มีประวัติการรักษา')).not.toBeInTheDocument()
    petDetails[10] = petA
  })

  it('(a) Vaccinations tab shows Thai Add Vaccination, the Due token, and formatted dates', async () => {
    await openPetDetail()
    await userEvent.click(screen.getByText('วัคซีน')) // tabVaccinations
    expect(screen.getByText('เพิ่มบันทึกวัคซีน')).toBeInTheDocument()
    expect(screen.getByText('ครบกำหนด: 01 ม.ค. 2027')).toBeInTheDocument()
    expect(screen.getByText('01 ม.ค. 2026')).toBeInTheDocument()
  })

  it('(a) Vaccinations tab shows the Thai empty state for a pet with no vaccinations', async () => {
    petDetails[10] = { ...petA, vaccinations: [] }
    await openPetDetail()
    await userEvent.click(screen.getByText('วัคซีน'))
    expect(screen.getByText('ยังไม่มีประวัติการฉีดวัคซีน')).toBeInTheDocument()
    petDetails[10] = petA
  })

  it('(b)/(c) Medical and Vaccinations tabs have no Latin residue and no raw key leakage', async () => {
    await openPetDetail()
    await userEvent.click(screen.getByText('ประวัติการรักษา'))
    assertNoLatinResidue(panelFor('ข้อมูลสัตว์เลี้ยง'))
    await userEvent.click(screen.getByText('วัคซีน'))
    assertNoLatinResidue(panelFor('ข้อมูลสัตว์เลี้ยง'))
    assertNoRawKeyLeak(panelFor('ข้อมูลสัตว์เลี้ยง'))
  })
})

// ─── I18N-12: modals ────────────────────────────────────────────────────────
describe('ClinicPets — Thai i18n (I18N-12): AddOwnerModal / EditOwnerModal', () => {
  it('(a) AddOwnerModal renders its Thai title and Save/Cancel labels', async () => {
    renderPets()
    await screen.findByText('สมหญิง ใจดี')
    await userEvent.click(screen.getByText('เพิ่มเจ้าของใหม่'))
    const panel = panelFor('เจ้าของใหม่')
    expect(within(panel).getByText('ยกเลิก')).toBeInTheDocument() // common.cancel
    expect(within(panel).getByText('บันทึกข้อมูลเจ้าของ')).toBeInTheDocument() // saveOwner
  })

  it('(a) EditOwnerModal renders its Thai title and Save Changes label', async () => {
    await openOwnerDetail()
    await userEvent.click(screen.getByTitle('แก้ไข')) // common.edit
    const panel = panelFor('แก้ไขข้อมูลเจ้าของ')
    expect(within(panel).getByText('บันทึกการเปลี่ยนแปลง')).toBeInTheDocument()
  })

  it('(b)/(c) AddOwnerModal has no Latin residue and no raw key leakage', async () => {
    renderPets()
    await screen.findByText('สมหญิง ใจดี')
    await userEvent.click(screen.getByText('เพิ่มเจ้าของใหม่'))
    const panel = panelFor('เจ้าของใหม่')
    assertNoLatinResidue(panel)
    assertNoRawKeyLeak(panel)
  })
})

describe('ClinicPets — Thai i18n (I18N-12): AddPetModal / EditPetModal', () => {
  async function openAddPetModal() {
    await openOwnerDetail()
    await userEvent.click(screen.getByText('เพิ่มสัตว์เลี้ยง'))
    await screen.findByText('สัตว์เลี้ยงใหม่')
  }

  it('(a) AddPetModal renders its Thai title, owner prefix, and species/gender option labels', async () => {
    await openAddPetModal()
    expect(screen.getByText('เจ้าของ: สมหญิง ใจดี')).toBeInTheDocument()
    const panel = panelFor('สัตว์เลี้ยงใหม่')
    expect(within(panel).getByText('สุนัข')).toBeInTheDocument()
    expect(within(panel).getByText('แมว')).toBeInTheDocument()
    expect(within(panel).getByText('นก')).toBeInTheDocument()
    expect(within(panel).getByText('เพศผู้')).toBeInTheDocument()
    expect(within(panel).getByText('เพศเมีย')).toBeInTheDocument()
  })

  it('R-1: submitting AddPetModal posts the raw English species/gender values, not the Thai labels', async () => {
    await openAddPetModal()
    const panel = panelFor('สัตว์เลี้ยงใหม่')
    await userEvent.type(within(panel).getByPlaceholderText('ชื่อสัตว์เลี้ยง'), 'บัดดี้')
    const selects = panel.querySelectorAll('select')
    await userEvent.selectOptions(selects[1], 'female') // gender select
    await userEvent.click(within(panel).getByText('บันทึกข้อมูลสัตว์เลี้ยง'))

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/api/pets', expect.objectContaining({
      species: 'canine', gender: 'female',
    })))
  })

  it('(a) EditPetModal renders its Thai title and pre-translated species/gender selects', async () => {
    await openPetDetail()
    await userEvent.click(screen.getByLabelText('แก้ไขข้อมูลสัตว์เลี้ยง')) // editPet aria
    const panel = panelFor('แก้ไขข้อมูลสัตว์เลี้ยง')
    expect(within(panel).getByText('บันทึกการเปลี่ยนแปลง')).toBeInTheDocument()
  })

  it('(b)/(c) AddPetModal has no Latin residue and no raw key leakage', async () => {
    await openAddPetModal()
    const panel = panelFor('สัตว์เลี้ยงใหม่')
    assertNoLatinResidue(panel)
    assertNoRawKeyLeak(panel)
  })
})

describe('ClinicPets — Thai i18n (I18N-12): AddVaccinationModal', () => {
  async function openAddVaccinationModal() {
    await openPetDetail()
    await userEvent.click(screen.getByText('วัคซีน'))
    await userEvent.click(screen.getByText('เพิ่มบันทึกวัคซีน'))
    await screen.findByText('บันทึกการฉีดวัคซีน')
  }

  it('(a) renders the Thai title, field labels, and Save/Cancel', async () => {
    await openAddVaccinationModal()
    const panel = panelFor('บันทึกการฉีดวัคซีน')
    expect(within(panel).getByText('วันที่ฉีด')).toBeInTheDocument()
    expect(within(panel).getByText('วันนัดฉีดครั้งถัดไป (ไม่จำเป็น)')).toBeInTheDocument()
    expect(within(panel).getByText('ยกเลิก')).toBeInTheDocument()
    expect(within(panel).getByText('บันทึก')).toBeInTheDocument() // common.save
  })

  it('(b)/(c) has no Latin residue and no raw key leakage', async () => {
    await openAddVaccinationModal()
    const panel = panelFor('บันทึกการฉีดวัคซีน')
    assertNoLatinResidue(panel)
    assertNoRawKeyLeak(panel)
  })
})

// ─── I18N-12/A-13: AdmitModal opened FROM Pets ─────────────────────────────
describe('ClinicPets — Thai i18n (I18N-12, A-13): AdmitModal from Pet Profile', () => {
  it('opens fully in Thai with no residual English from its Inpatient-native strings', async () => {
    await openPetDetail()
    // Both Pets' own trigger button and the AdmitModal's own h3 title read
    // "รับเป็นผู้ป่วยใน" (F-8 shared semantic) — the trigger is a <button>,
    // so target it specifically to avoid an ambiguous match.
    await userEvent.click(screen.getByRole('button', { name: /รับเป็นผู้ป่วยใน/ }))
    const title = await screen.findByText('รับเป็นผู้ป่วยใน', { selector: 'h3' })
    const panel = title.closest('.bg-surface') as HTMLElement
    expect(within(panel).getByPlaceholderText('สาเหตุที่รับเข้ารักษา')).toBeInTheDocument()
    expect(within(panel).getByPlaceholderText('หมายเลขกรง (ไม่จำเป็น)')).toBeInTheDocument()
    expect(within(panel).getByText('สัตวแพทย์ผู้รับผิดชอบ (ไม่จำเป็น)')).toBeInTheDocument()
    expect(within(panel).getByText('ยกเลิก')).toBeInTheDocument()
    assertNoLatinResidue(panel)
    assertNoRawKeyLeak(panel)
  })
})
