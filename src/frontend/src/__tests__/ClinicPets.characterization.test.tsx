// src/frontend/src/__tests__/ClinicPets.characterization.test.tsx
//
// Phase 7 / Lane D — Gate 0 characterization tests for ClinicPets.tsx.
// This file is ADDITIVE: docs/superpowers/plans/2026-09-16-phase7-god-components-arch-audit.md
// §1 rates existing coverage INSUFFICIENT — two of the four existing test
// files mount only named sub-exports (`PetDetail`/`OwnerPanel`), and the two
// that mount the default export mock `@tanstack/react-query` wholesale, so no
// fetch-triggered state change and zero modal submit/error/close path is
// exercised anywhere today. This file locks down CURRENT behaviour (including
// behaviour that looks wrong) for all five modals — AddOwnerModal,
// EditOwnerModal, AddPetModal, EditPetModal, AddVaccinationModal — plus the
// owner-list board states, so the upcoming useModalSubmit-hook +
// fieldClass-const extraction (arch audit §2.2) has a baseline to prove
// itself against.
//
// Do not edit the four existing ClinicPets*.test.tsx files — their test
// names must survive into the Gate 4 test-set-equality comparison verbatim.
// This file uses a real component mount + real `api` mock (matching
// ClinicInpatient.characterization.test.tsx's harness), not a wholesale
// `@tanstack/react-query` mock, so fetch-triggered state changes are
// genuinely exercised.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

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

// Matches the wholesale-mock pattern already used by
// ClinicPetsOwnerList.test.tsx / ClinicPetsMedicalTab.test.tsx for this
// store — a mutable fixture object read through the real selector shape.
const authState: { permissions: string[] } = { permissions: [] }
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { hasPermission: (code: string) => boolean }) => unknown) =>
    selector({ hasPermission: (code: string) => authState.permissions.includes(code) }),
}))

import ClinicPets from '../views/clinic/ClinicPets'

// ─── Fixtures ──────────────────────────────────────────────────────────────
const ownerA = {
  id: 1, firstName: 'Jane', lastName: 'Doe', phone: '0812345678', email: 'jane@example.com',
  address: '123 Main St', lineId: 'jane_line', idCardType: 'thai_id', idCardNumber: '1234567890123',
  isActive: true,
  pets: [{ id: 10, ownerId: 1, name: 'Rex', species: 'canine', isActive: true }],
}

const ownerNoPets = {
  id: 2, firstName: 'No', lastName: 'Pets', phone: '0899999999', isActive: true, pets: [],
}

const petA = {
  id: 10, ownerId: 1, name: 'Rex', species: 'canine', breed: 'Labrador', color: 'Brown',
  gender: 'male', birthDate: '2020-01-01T00:00:00.000Z', weightKg: 20, microchipId: 'CHIP123',
  allergies: '', underlyingConditions: '', isActive: true,
  medicalRecords: [], vaccinations: [],
}

/**
 * Stubs every GET endpoint ClinicPets/PetDetail/OwnerPanel touch. Owner and
 * pet detail lists are overridable so individual tests can point selectedId
 * at fixtures that don't exist in `owners`.
 */
function stubGet(
  owners: { id: number }[] = [ownerA, ownerNoPets],
  ownerDetails: Record<number, unknown> = { 1: ownerA, 2: ownerNoPets },
  petDetails: Record<number, unknown> = { 10: petA },
) {
  getMock.mockImplementation((url: string) => {
    if (url === '/api/owners') return Promise.resolve({ data: { data: { owners } } })
    const ownerMatch = url.match(/^\/api\/owners\/(\d+)$/)
    if (ownerMatch) {
      const id = Number(ownerMatch[1])
      return Promise.resolve({ data: { data: ownerDetails[id] } })
    }
    const petMatch = url.match(/^\/api\/pets\/(\d+)$/)
    if (petMatch) {
      const id = Number(petMatch[1])
      return Promise.resolve({ data: { data: petDetails[id] } })
    }
    return Promise.resolve({ data: { data: null } })
  })
}

beforeEach(() => {
  authState.permissions = ['crm.edit', 'crm.delete', 'vaccination.create', 'emr.view']
  postMock.mockReset()
  putMock.mockReset()
  deleteMock.mockReset()
  getMock.mockReset()
  postMock.mockResolvedValue({ data: { data: { id: 999 } } })
  putMock.mockResolvedValue({ data: { data: {} } })
  deleteMock.mockResolvedValue({ status: 204 })
})

function renderPets() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ClinicPets />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { queryClient, container }
}

async function selectOwner(name = 'Jane Doe') {
  await userEvent.click(screen.getByText(name))
}

async function selectPet(name = 'Rex') {
  await userEvent.click(screen.getByText(name))
}

async function openOwnerDetail() {
  stubGet()
  renderPets()
  await screen.findByText('Jane Doe')
  await selectOwner()
  // The phone number renders in both the left-panel row and the detail
  // header, so wait on the email — it only renders in the detail panel.
  await screen.findByText('jane@example.com')
}

async function openPetDetail() {
  await openOwnerDetail()
  await selectPet()
  await screen.findByText('Pet Profile')
}

// Every modal in this file shares one shell shape: an outer backdrop `div`
// (`fixed inset-0 bg-black/40 z-50 ...`, NO onClick handler per the arch
// audit's table — "Backdrop closes: no", "X control: no" for every
// ClinicPets modal) wrapping an inner panel (`bg-surface ...`). Locate the
// panel by its unique header text.
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

// ─── Owner list / board-level states ───────────────────────────────────────
describe('ClinicPets — owner list board states', () => {
  it('shows "Loading…" while the owners query is pending', () => {
    getMock.mockImplementation((url: string) =>
      url === '/api/owners' ? new Promise(() => {}) : Promise.resolve({ data: { data: null } })
    )
    renderPets()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows "No owners found." when the owners list is empty', async () => {
    stubGet([])
    renderPets()
    expect(await screen.findByText('No owners found.')).toBeInTheDocument()
  })

  it('shows the "Select an owner" empty state in the right panel before any owner is picked', async () => {
    stubGet()
    renderPets()
    await screen.findByText('Jane Doe')
    expect(screen.getByText('Select an owner')).toBeInTheDocument()
    expect(screen.getByText('Choose an owner from the list to see their pets.')).toBeInTheDocument()
  })

  it('does not render the Show inactive checkbox without crm.delete', async () => {
    authState.permissions = []
    stubGet()
    renderPets()
    await screen.findByText('Jane Doe')
    expect(screen.queryByLabelText(/show inactive/i)).not.toBeInTheDocument()
  })

  it('OwnerPanel shows "No pets yet. Add one above." for an owner with zero pets', async () => {
    stubGet()
    renderPets()
    await screen.findByText('No Pets')
    await selectOwner('No Pets')
    expect(await screen.findByText('No pets yet. Add one above.')).toBeInTheDocument()
  })
})

// ─── AddOwnerModal ──────────────────────────────────────────────────────────
describe('ClinicPets — AddOwnerModal', () => {
  async function openAddOwnerModal() {
    stubGet()
    renderPets()
    await screen.findByText('Jane Doe')
    await userEvent.click(screen.getByText('Add New Owner'))
    await screen.findByText('New Owner')
  }

  it('opens with the literal header "New Owner" (untranslated — pinned as-is)', async () => {
    await openAddOwnerModal()
    expect(screen.getByText('New Owner')).toBeInTheDocument()
  })

  it('Cancel unmounts the modal', async () => {
    await openAddOwnerModal()
    await userEvent.click(within(panelFor('New Owner')).getByText('Cancel'))
    expect(screen.queryByText('New Owner')).not.toBeInTheDocument()
  })

  it('current behaviour: backdrop click does NOT close the modal (no onClick on the backdrop)', async () => {
    await openAddOwnerModal()
    fireEvent.click(backdropFor('New Owner'))
    expect(screen.getByText('New Owner')).toBeInTheDocument()
  })

  it('current behaviour: there is no X / close control in this modal', async () => {
    await openAddOwnerModal()
    expect(within(panelFor('New Owner')).queryByText('close')).not.toBeInTheDocument()
  })

  it('idCardType "thai_id" reveals a maxLength=13 numeric ID input; "passport" reveals a maxLength=20 text input', async () => {
    await openAddOwnerModal()
    const select = screen.getByLabelText('ID card type')
    expect(screen.queryByPlaceholderText('ID card number (13 digits)')).not.toBeInTheDocument()

    await userEvent.selectOptions(select, 'thai_id')
    const thaiInput = screen.getByPlaceholderText('ID card number (13 digits)') as HTMLInputElement
    expect(thaiInput.maxLength).toBe(13)

    await userEvent.selectOptions(select, 'passport')
    expect(screen.queryByPlaceholderText('ID card number (13 digits)')).not.toBeInTheDocument()
    const passportInput = screen.getByPlaceholderText('Passport number') as HTMLInputElement
    expect(passportInput.maxLength).toBe(20)
  })

  it('submit happy path posts the normalized payload and closes on success', async () => {
    await openAddOwnerModal()
    await userEvent.type(screen.getByPlaceholderText('First name'), 'New')
    await userEvent.type(screen.getByPlaceholderText('Last name'), 'Owner')
    await userEvent.type(screen.getByPlaceholderText('Phone number'), '0800000000')
    await userEvent.type(screen.getByPlaceholderText('Email (optional)'), 'new@example.com')

    await userEvent.click(screen.getByText('Save Owner'))

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/api/owners', {
      firstName: 'New', lastName: 'Owner', phone: '0800000000', email: 'new@example.com',
      address: null, lineId: null, idCardType: null, idCardNumber: null,
    }))
    await waitFor(() => expect(screen.queryByText('New Owner')).not.toBeInTheDocument())
  })

  it('current behaviour: the lineId field has no input control in this modal, so it is always submitted as null', async () => {
    await openAddOwnerModal()
    await userEvent.type(screen.getByPlaceholderText('First name'), 'A')
    await userEvent.type(screen.getByPlaceholderText('Last name'), 'B')
    await userEvent.type(screen.getByPlaceholderText('Phone number'), '000')
    await userEvent.click(screen.getByText('Save Owner'))

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/api/owners', expect.objectContaining({ lineId: null })))
  })

  it('idCardNumber is normalized to null when idCardType is left empty, even if a number was typed then the type cleared', async () => {
    await openAddOwnerModal()
    await userEvent.type(screen.getByPlaceholderText('First name'), 'A')
    await userEvent.type(screen.getByPlaceholderText('Last name'), 'B')
    await userEvent.type(screen.getByPlaceholderText('Phone number'), '000')
    await userEvent.selectOptions(screen.getByLabelText('ID card type'), 'thai_id')
    await userEvent.type(screen.getByPlaceholderText('ID card number (13 digits)'), '1112223334445')
    await userEvent.selectOptions(screen.getByLabelText('ID card type'), '')

    await userEvent.click(screen.getByText('Save Owner'))
    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/api/owners', expect.objectContaining({ idCardType: null, idCardNumber: null })))
  })

  it('submit error path shows the server error message and keeps the modal open', async () => {
    postMock.mockRejectedValueOnce({ response: { data: { error: 'Phone already registered' } } })
    await openAddOwnerModal()
    await userEvent.type(screen.getByPlaceholderText('First name'), 'A')
    await userEvent.type(screen.getByPlaceholderText('Last name'), 'B')
    await userEvent.type(screen.getByPlaceholderText('Phone number'), '000')
    await userEvent.click(screen.getByText('Save Owner'))

    expect(await screen.findByText('Phone already registered')).toBeInTheDocument()
    expect(screen.getByText('New Owner')).toBeInTheDocument()
  })

  it('submit error with no server error field falls back to "Failed to save"', async () => {
    postMock.mockRejectedValueOnce(new Error('network down'))
    await openAddOwnerModal()
    await userEvent.type(screen.getByPlaceholderText('First name'), 'A')
    await userEvent.type(screen.getByPlaceholderText('Last name'), 'B')
    await userEvent.type(screen.getByPlaceholderText('Phone number'), '000')
    await userEvent.click(screen.getByText('Save Owner'))

    expect(await screen.findByText('Failed to save')).toBeInTheDocument()
  })

  it('the Save button shows "Saving…" and is disabled while the request is in flight', async () => {
    let resolvePost: (v: unknown) => void = () => {}
    postMock.mockImplementationOnce(() => new Promise(res => { resolvePost = res }))
    await openAddOwnerModal()
    await userEvent.type(screen.getByPlaceholderText('First name'), 'A')
    await userEvent.type(screen.getByPlaceholderText('Last name'), 'B')
    await userEvent.type(screen.getByPlaceholderText('Phone number'), '000')
    await userEvent.click(screen.getByText('Save Owner'))

    const savingBtn = await screen.findByText('Saving…')
    expect(savingBtn).toBeDisabled()
    resolvePost({ data: { data: {} } })
    await waitFor(() => expect(screen.queryByText('New Owner')).not.toBeInTheDocument())
  })
})

// ─── EditOwnerModal ─────────────────────────────────────────────────────────
describe('ClinicPets — EditOwnerModal', () => {
  async function openEditOwnerModal() {
    await openOwnerDetail()
    await userEvent.click(screen.getByTitle('Edit'))
    await screen.findByText('Edit Owner')
  }

  it('does not render the Edit control without crm.edit', async () => {
    authState.permissions = []
    await openOwnerDetail()
    expect(screen.queryByTitle('Edit')).not.toBeInTheDocument()
  })

  it('pre-populates every field from the selected owner', async () => {
    await openEditOwnerModal()
    expect(screen.getByDisplayValue('Jane')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Doe')).toBeInTheDocument()
    expect(screen.getByDisplayValue('0812345678')).toBeInTheDocument()
    expect(screen.getByDisplayValue('jane@example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('123 Main St')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1234567890123')).toBeInTheDocument()
  })

  it('Cancel unmounts the modal', async () => {
    await openEditOwnerModal()
    await userEvent.click(within(panelFor('Edit Owner')).getByText('Cancel'))
    expect(screen.queryByText('Edit Owner')).not.toBeInTheDocument()
  })

  it('current behaviour: backdrop click does NOT close the modal', async () => {
    await openEditOwnerModal()
    fireEvent.click(backdropFor('Edit Owner'))
    expect(screen.getByText('Edit Owner')).toBeInTheDocument()
  })

  it('submit happy path PUTs the normalized payload, preserving the un-editable lineId, and closes on success', async () => {
    await openEditOwnerModal()
    const firstName = screen.getByDisplayValue('Jane')
    await userEvent.clear(firstName)
    await userEvent.type(firstName, 'Janet')
    await userEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => expect(putMock).toHaveBeenCalledWith('/api/owners/1', {
      firstName: 'Janet', lastName: 'Doe', phone: '0812345678', email: 'jane@example.com',
      address: '123 Main St', lineId: 'jane_line', idCardType: 'thai_id', idCardNumber: '1234567890123',
    }))
    await waitFor(() => expect(screen.queryByText('Edit Owner')).not.toBeInTheDocument())
  })

  it('submit error path shows the server error message and keeps the modal open', async () => {
    putMock.mockRejectedValueOnce({ response: { data: { error: 'Duplicate phone' } } })
    await openEditOwnerModal()
    await userEvent.click(screen.getByText('Save Changes'))

    expect(await screen.findByText('Duplicate phone')).toBeInTheDocument()
    expect(screen.getByText('Edit Owner')).toBeInTheDocument()
  })
})

// ─── AddPetModal ────────────────────────────────────────────────────────────
describe('ClinicPets — AddPetModal', () => {
  async function openAddPetModal() {
    await openOwnerDetail()
    await userEvent.click(screen.getByText('Add Pet'))
    await screen.findByText('New Pet')
  }

  it('shows the owner name in the modal subtitle', async () => {
    await openAddPetModal()
    expect(screen.getByText('Owner: Jane Doe')).toBeInTheDocument()
  })

  it('Cancel unmounts the modal', async () => {
    await openAddPetModal()
    await userEvent.click(within(panelFor('New Pet')).getByText('Cancel'))
    expect(screen.queryByText('New Pet')).not.toBeInTheDocument()
  })

  it('current behaviour: backdrop click does NOT close the modal', async () => {
    await openAddPetModal()
    fireEvent.click(backdropFor('New Pet'))
    expect(screen.getByText('New Pet')).toBeInTheDocument()
  })

  it('species defaults to "Canine" (first option preselected)', async () => {
    await openAddPetModal()
    const speciesSelect = screen.getByDisplayValue('Canine') as HTMLSelectElement
    expect(speciesSelect.value).toBe('canine')
  })

  it('submit happy path posts the normalized payload and closes on success', async () => {
    await openAddPetModal()
    await userEvent.type(screen.getByPlaceholderText('Pet name'), 'Buddy')
    await userEvent.type(screen.getByPlaceholderText('Weight in kg (optional)'), '15')

    await userEvent.click(screen.getByText('Save Pet'))

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/api/pets', {
      ownerId: 1, name: 'Buddy', species: 'canine', breed: null, color: null, gender: null,
      birthDate: null, weightKg: 15, microchipId: null, allergies: null, underlyingConditions: null,
    }))
    await waitFor(() => expect(screen.queryByText('New Pet')).not.toBeInTheDocument())
  })

  it('submit error path shows the server error message and keeps the modal open', async () => {
    postMock.mockRejectedValueOnce({ response: { data: { error: 'Name required' } } })
    await openAddPetModal()
    await userEvent.type(screen.getByPlaceholderText('Pet name'), 'Buddy')
    await userEvent.click(screen.getByText('Save Pet'))

    expect(await screen.findByText('Name required')).toBeInTheDocument()
    expect(screen.getByText('New Pet')).toBeInTheDocument()
  })

  it('current behaviour: a failed (non-fatal) photo upload after a successful pet create still closes the modal with no visible error', async () => {
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    await openAddPetModal()
    await userEvent.type(screen.getByPlaceholderText('Pet name'), 'Buddy')

    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)

    // Call 1 = POST /api/pets (create), call 2 = POST /api/pets/:id/photo
    // (upload) — queued in that order so the upload specifically fails.
    postMock.mockResolvedValueOnce({ data: { data: { id: 55 } } })
    postMock.mockRejectedValueOnce({ response: { data: { error: 'Upload failed' } } })
    await userEvent.click(screen.getByText('Save Pet'))

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(2))
    expect(postMock).toHaveBeenNthCalledWith(2, '/api/pets/55/photo', expect.any(FormData), expect.anything())
    await waitFor(() => expect(screen.queryByText('New Pet')).not.toBeInTheDocument())
    expect(screen.queryByText('Upload failed')).not.toBeInTheDocument()
  })
})

// ─── EditPetModal ───────────────────────────────────────────────────────────
describe('ClinicPets — EditPetModal', () => {
  async function openEditPetModal() {
    await openPetDetail()
    await userEvent.click(screen.getByLabelText('Edit Pet'))
    await screen.findByText('Edit Pet')
  }

  it('does not render the Edit Pet control without crm.edit', async () => {
    authState.permissions = []
    await openPetDetail()
    expect(screen.queryByLabelText('Edit Pet')).not.toBeInTheDocument()
  })

  it('pre-populates every field from the selected pet, slicing the ISO birthDate to yyyy-MM-dd', async () => {
    await openEditPetModal()
    expect(screen.getByDisplayValue('Rex')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Labrador')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Brown')).toBeInTheDocument()
    expect(screen.getByDisplayValue('20')).toBeInTheDocument()
    expect(screen.getByDisplayValue('CHIP123')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2020-01-01')).toBeInTheDocument()
  })

  it('Cancel unmounts the modal', async () => {
    await openEditPetModal()
    await userEvent.click(within(panelFor('Edit Pet')).getByText('Cancel'))
    expect(screen.queryByText('Edit Pet')).not.toBeInTheDocument()
  })

  it('current behaviour: backdrop click does NOT close the modal', async () => {
    await openEditPetModal()
    fireEvent.click(backdropFor('Edit Pet'))
    expect(screen.getByText('Edit Pet')).toBeInTheDocument()
  })

  it('submit happy path (no photo change) PUTs the normalized payload, invalidates the pet query, and closes', async () => {
    await openEditPetModal()
    const name = screen.getByDisplayValue('Rex')
    await userEvent.clear(name)
    await userEvent.type(name, 'Rexy')
    await userEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => expect(putMock).toHaveBeenCalledWith('/api/pets/10', {
      name: 'Rexy', species: 'canine', breed: 'Labrador', color: 'Brown', gender: 'male',
      birthDate: '2020-01-01', weightKg: 20, microchipId: 'CHIP123', allergies: null, underlyingConditions: null,
    }))
    await waitFor(() => expect(screen.queryByText('Edit Pet')).not.toBeInTheDocument())
  })

  it('submit error path (no photo) shows the server error message and keeps the modal open', async () => {
    putMock.mockRejectedValueOnce({ response: { data: { error: 'Weight out of range' } } })
    await openEditPetModal()
    await userEvent.click(screen.getByText('Save Changes'))

    expect(await screen.findByText('Weight out of range')).toBeInTheDocument()
    expect(screen.getByText('Edit Pet')).toBeInTheDocument()
  })

  // Drives the real `usePhotoUpload` hook (this file does not mock it —
  // see the header comment), matching how QA's own probe exercised the
  // formatError suppression branch useModalSubmit's `uploadError` param
  // restructured. Zero coverage existed anywhere for this branch before
  // (EditPetModal.test.tsx hard-mocks usePhotoUpload with uploadError: '').
  it('photo-upload failure on save shows the upload error and does not call PUT', async () => {
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    await openEditPetModal()
    const file = new File(['x'], 'new-photo.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)

    postMock.mockRejectedValueOnce({ response: { data: { error: 'Upload failed' } } })
    await userEvent.click(screen.getByText('Save Changes'))

    expect(await screen.findByText('Upload failed')).toBeInTheDocument()
    expect(putMock).not.toHaveBeenCalled()
    expect(screen.getByText('Edit Pet')).toBeInTheDocument()
  })

  it('current behaviour: after a photo-upload failure, a retried save whose PUT then fails shows no error message at all (pre-existing bug, pinned not fixed — see the formatError comment in ClinicPets.tsx)', async () => {
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    await openEditPetModal()
    const file = new File(['x'], 'new-photo.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)

    // First attempt: photo upload fails, banner shows the upload-specific error.
    postMock.mockRejectedValueOnce({ response: { data: { error: 'Upload failed' } } })
    await userEvent.click(screen.getByText('Save Changes'))
    expect(await screen.findByText('Upload failed')).toBeInTheDocument()

    // Retry: photo upload now succeeds (so uploadError clears), but the PUT
    // fails. formatError's `uploadError` check reflects the *previous*
    // render (truthy, from the first failure), so it suppresses this
    // attempt's message too — and since the successful re-upload clears
    // uploadError, nothing at all ends up on screen.
    putMock.mockRejectedValueOnce({ response: { data: { error: 'Weight out of range' } } })
    await userEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => expect(putMock).toHaveBeenCalled())
    expect(screen.queryByText('Weight out of range')).not.toBeInTheDocument()
    expect(screen.queryByText('Upload failed')).not.toBeInTheDocument()
    expect(screen.getByText('Edit Pet')).toBeInTheDocument()
  })
})

// ─── AddVaccinationModal ────────────────────────────────────────────────────
describe('ClinicPets — AddVaccinationModal', () => {
  async function openVaccinationsTab() {
    await openPetDetail()
    await userEvent.click(screen.getByText('Vaccinations'))
  }

  async function openAddVaccinationModal() {
    await openVaccinationsTab()
    await userEvent.click(screen.getByText('Add Vaccination'))
    await screen.findByText('Record Vaccination')
  }

  it('does not render the Add Vaccination control without vaccination.create', async () => {
    authState.permissions = []
    await openVaccinationsTab()
    expect(screen.queryByText('Add Vaccination')).not.toBeInTheDocument()
  })

  it('shows "No vaccination records yet." for a pet with an empty vaccinations array', async () => {
    await openVaccinationsTab()
    expect(screen.getByText('No vaccination records yet.')).toBeInTheDocument()
  })

  it('Cancel unmounts the modal', async () => {
    await openAddVaccinationModal()
    await userEvent.click(within(panelFor('Record Vaccination')).getByText('Cancel'))
    expect(screen.queryByText('Record Vaccination')).not.toBeInTheDocument()
  })

  it('current behaviour: backdrop click does NOT close the modal', async () => {
    await openAddVaccinationModal()
    fireEvent.click(backdropFor('Record Vaccination'))
    expect(screen.getByText('Record Vaccination')).toBeInTheDocument()
  })

  // "Date administered" is a plain <label> with no htmlFor/id association in
  // the source (unlike every other labeled field in this file), so
  // getByLabelText cannot resolve it — locate the date input directly.
  function dateAdministeredInput(): HTMLInputElement {
    return panelFor('Record Vaccination').querySelector('input[type="date"]') as HTMLInputElement
  }

  it('submit happy path posts the normalized payload including petId and closes on success', async () => {
    await openAddVaccinationModal()
    await userEvent.type(screen.getByPlaceholderText('Vaccine name'), 'Rabies')
    fireEvent.change(dateAdministeredInput(), { target: { value: '2026-01-01' } })

    await userEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/api/vaccinations', {
      petId: 10, vaccineName: 'Rabies', administeredAt: '2026-01-01', nextDueAt: null, batchNo: null, notes: null,
    }))
    await waitFor(() => expect(screen.queryByText('Record Vaccination')).not.toBeInTheDocument())
  })

  it('current behaviour: there is no "notes" input rendered, so notes is always submitted as null', async () => {
    await openAddVaccinationModal()
    await userEvent.type(screen.getByPlaceholderText('Vaccine name'), 'Rabies')
    fireEvent.change(dateAdministeredInput(), { target: { value: '2026-01-01' } })
    await userEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/api/vaccinations', expect.objectContaining({ notes: null })))
  })

  it('submit error path shows the server error message and keeps the modal open', async () => {
    postMock.mockRejectedValueOnce({ response: { data: { error: 'Vaccine rejected by server' } } })
    await openAddVaccinationModal()
    await userEvent.type(screen.getByPlaceholderText('Vaccine name'), 'Rabies')
    fireEvent.change(dateAdministeredInput(), { target: { value: '2026-01-01' } })
    await userEvent.click(screen.getByText('Save'))

    expect(await screen.findByText('Vaccine rejected by server')).toBeInTheDocument()
    expect(screen.getByText('Record Vaccination')).toBeInTheDocument()
  })
})

// ─── OwnerPanel delete / reactivate — flagged untested by the arch audit ───
describe('ClinicPets — OwnerPanel delete / reactivate (arch audit: untested)', () => {
  it('Delete is gated behind window.confirm and calls DELETE on accept', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openOwnerDetail()
    await userEvent.click(screen.getByTitle('Delete'))

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('/api/owners/1'))
    confirmSpy.mockRestore()
  })

  it('declining the confirm dialog does not call DELETE', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await openOwnerDetail()
    await userEvent.click(screen.getByTitle('Delete'))

    expect(deleteMock).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('Delete failure shows an inline error message', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    deleteMock.mockRejectedValueOnce({ response: { data: { error: 'Owner has open invoices' } } })
    await openOwnerDetail()
    await userEvent.click(screen.getByTitle('Delete'))

    expect(await screen.findByText('Owner has open invoices')).toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('Reactivate is offered instead of Edit/Delete for an inactive owner and PUTs isActive: true', async () => {
    const inactiveOwner = { ...ownerA, isActive: false }
    stubGet([inactiveOwner, ownerNoPets], { 1: inactiveOwner, 2: ownerNoPets })
    renderPets()
    await screen.findByText('Jane Doe')
    await selectOwner()
    await screen.findByText('Reactivate Owner')

    expect(screen.queryByTitle('Edit')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Reactivate Owner'))
    await waitFor(() => expect(putMock).toHaveBeenCalledWith('/api/owners/1', { isActive: true }))
  })

  it('Reactivate failure shows an inline error message', async () => {
    const inactiveOwner = { ...ownerA, isActive: false }
    stubGet([inactiveOwner, ownerNoPets], { 1: inactiveOwner, 2: ownerNoPets })
    putMock.mockRejectedValueOnce({ response: { data: { error: 'Cannot reactivate' } } })
    renderPets()
    await screen.findByText('Jane Doe')
    await selectOwner()
    await screen.findByText('Reactivate Owner')

    await userEvent.click(screen.getByText('Reactivate Owner'))
    expect(await screen.findByText('Cannot reactivate')).toBeInTheDocument()
  })
})
