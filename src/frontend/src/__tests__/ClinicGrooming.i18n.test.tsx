// src/frontend/src/__tests__/ClinicGrooming.i18n.test.tsx
//
// I18N-4 (BA sign-off A-10 method): Thai-render coverage for ClinicGrooming,
// sibling to (not inside) views/clinic/__tests__/ClinicGrooming.test.tsx and
// ClinicGrooming.bookingModal.test.tsx, which stay the English-mode
// no-regression net (A-9) and are not touched by this file.
//
// Fixture pet/owner/groomer names are Thai (X-5) so the Latin-residue scan
// below isn't tripped up by legitimate free-text/name content (E-2).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../store/uiStore', () => ({
  useUiStore: (s: (s: { language: string }) => unknown) => s({ language: 'th' }),
}))

const fixtureBooking = {
  id: 1,
  petId: 1,
  groomerId: 2,
  serviceType: 'Bath & Dry',
  scheduledAt: '2026-09-21T09:00:00',
  durationMin: 60,
  status: 'scheduled',
  specialInstructions: '',
  notes: '',
  pet: { id: 1, name: 'บัดดี้', species: 'Dog' },
  groomer: { id: 2, name: 'สมชาย' },
}

const searchResults = [
  { petId: 9, petName: 'มะลิ', species: 'Cat', ownerId: 9, ownerName: 'วิภา ทดสอบ', phone: '0898765432' },
]

const staff = [{ id: 2, name: 'สมชาย', role: { key: 'clinic_staff' } }]

vi.mock('../utils/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { data: [] } })),
    post: vi.fn(() => Promise.resolve({ data: { success: true } })),
    put: vi.fn(() => Promise.resolve({ data: { success: true } })),
  },
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) =>
    queryKey[0] === 'owner-search'
      ? { data: searchResults, isLoading: false }
      : queryKey[0] === 'staff-list'
      ? { data: staff, isLoading: false }
      : { data: [fixtureBooking], isLoading: false, isError: false }, // 'grooming'
  useMutation: ({ mutationFn }: { mutationFn: (vars: unknown) => unknown }) => ({
    mutate: (vars: unknown) => mutationFn(vars),
    isPending: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import ClinicGrooming from '../views/clinic/ClinicGrooming'

/** E-3: Dialog's own shared close-button aria-label stays English by design
 *  (it lives outside the 4 in-scope files, backlogged separately). */
const EXEMPT_STRINGS = new Set(['Close dialog'])

/** Every visible-text / placeholder / title / aria-label / <option> string in
 *  `container`, excluding Material Symbols icon ligatures (MaterialIcon
 *  renders the icon's font-ligature name, e.g. "add", "close", as literal
 *  text content — that is not user-facing prose and isn't part of R-7's
 *  in-scope surface list). */
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

describe('ClinicGrooming — Thai i18n (I18N-4)', () => {
  it('(a) renders key Thai strings on the main queue view', () => {
    render(<ClinicGrooming />)
    expect(screen.getByText('คิวอาบน้ำตัดขน')).toBeInTheDocument() // queueTitle
    expect(screen.getByText('จองคิวใหม่')).toBeInTheDocument() // newBooking
    expect(screen.getByText('นัดไว้แล้ว')).toBeInTheDocument() // statusScheduled (fixture booking)
    expect(screen.getByText('อาบน้ำ-เป่าขน')).toBeInTheDocument() // serviceBathDry (fixture booking)
  })

  it('(b)/(c) main queue view has no Latin residue and no raw key leakage', () => {
    const { container } = render(<ClinicGrooming />)
    assertNoLatinResidue(container)
    assertNoRawKeyLeak(container)
  })

  it('(a) renders key Thai strings inside the booking modal', () => {
    render(<ClinicGrooming />)
    fireEvent.click(screen.getByText('จองคิวใหม่'))
    expect(screen.getByText('จองคิวอาบน้ำตัดขน')).toBeInTheDocument() // dialog title
    expect(screen.getByText('สัตว์เลี้ยง')).toBeInTheDocument() // patientLabel
    expect(screen.getByPlaceholderText('ค้นหาด้วยชื่อสัตว์เลี้ยง ชื่อเจ้าของ หรือเบอร์โทร…')).toBeInTheDocument()
    expect(screen.getByText('ยืนยันการจอง')).toBeInTheDocument() // bookAppointment
    expect(screen.getByText('ยกเลิก')).toBeInTheDocument() // common.cancel
  })

  it('(b)/(c) booking modal has no Latin residue and no raw key leakage', () => {
    const { container } = render(<ClinicGrooming />)
    fireEvent.click(screen.getByText('จองคิวใหม่'))
    assertNoLatinResidue(container)
    assertNoRawKeyLeak(container)
  })

  it('R-1: the raw serviceType value is never rendered as visible text (only its Thai label is)', () => {
    render(<ClinicGrooming />)
    expect(screen.queryByText('Bath & Dry')).toBeNull()
  })
})
