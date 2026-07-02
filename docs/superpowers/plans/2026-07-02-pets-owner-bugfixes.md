# Pets & Owner Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 bugs in Pets & Owner: Add Owner form input overflow, incomplete Pet Overview tab, and vaccination save permission failure for clinic_staff.

**Architecture:** All 3 fixes touch `src/frontend/src/views/clinic/ClinicPets.tsx` plus one backend RBAC change (new `vaccination.create` permission replacing the overly-broad `emr.create` check on the vaccination route). No schema migration needed — `Pet.weightKg` already exists in Prisma schema and backend DTO; it was just never collected by the Add Pet form.

**Tech Stack:** React 18 + TypeScript (frontend, Vitest + Testing Library), Node/Express + Prisma (backend, Jest + Supertest).

## Global Constraints

- Multi-tenancy: no DB query changes in this plan touch tenant-scoped tables directly — RBAC change only touches system role `vaccination.create` grant (`tenantId: null` rows).
- `clinic_admin` must remain WITHOUT `emr.create` and WITHOUT the new `vaccination.create` — unchanged, per existing design decision (`seed-rbac.ts:109`).
- `medical-record.routes.ts` is NOT touched — stays `emr.create`-gated, doctor-only.
- i18n: any new user-facing label needs both EN (`src/frontend/src/i18n/index.ts` lines ~170-186) and TH (lines ~462-477) keys, following the `clinic.pets.*Optional` naming pattern already used.
- Full design context: `docs/superpowers/specs/2026-07-02-pets-owner-bugfixes-design.md`.

---

### Task 1: Fix Add Owner form Last Name input overflow

**Files:**
- Modify: `src/frontend/src/views/clinic/ClinicPets.tsx:62-65`
- Test: `src/frontend/src/__tests__/ClinicPets.i18n.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (pure CSS fix).

- [ ] **Step 1: Write the failing test**

Add to `src/frontend/src/__tests__/ClinicPets.i18n.test.tsx`, inside the existing `describe('ClinicPets — Thai i18n', ...)` block:

```tsx
  it('First and Last Name inputs allow shrinking below content width (no overflow)', async () => {
    render(<ClinicPets />)
    await userEvent.click(screen.getByText(/เพิ่มเจ้าของใหม่/i))
    const firstName = screen.getByPlaceholderText(/^ชื่อ$/)
    const lastName = screen.getByPlaceholderText(/นามสกุล/i)
    expect(firstName.className).toContain('min-w-0')
    expect(lastName.className).toContain('min-w-0')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run src/__tests__/ClinicPets.i18n.test.tsx`
Expected: FAIL — `expect(received).toContain(expected)` on `firstName.className` (no `min-w-0` present).

- [ ] **Step 3: Fix the CSS**

In `src/frontend/src/views/clinic/ClinicPets.tsx`, change lines 63-64 from:

```tsx
            <input required className="flex-1 bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.firstName')} value={form.firstName} onChange={set('firstName')} />
            <input required className="flex-1 bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.lastName')} value={form.lastName} onChange={set('lastName')} />
```

to:

```tsx
            <input required className="flex-1 min-w-0 bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.firstName')} value={form.firstName} onChange={set('firstName')} />
            <input required className="flex-1 min-w-0 bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.lastName')} value={form.lastName} onChange={set('lastName')} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run src/__tests__/ClinicPets.i18n.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicPets.tsx src/frontend/src/__tests__/ClinicPets.i18n.test.tsx
git commit -m "fix: prevent Add Owner Last Name input from overflowing card"
```

---

### Task 2: Add weightKg field to Add Pet form

**Files:**
- Modify: `src/frontend/src/views/clinic/ClinicPets.tsx:82,90-91,109-121,167-181`
- Modify: `src/frontend/src/i18n/index.ts:179,471` (insert new key near `microchipOptional`)
- Test: `src/frontend/src/__tests__/ClinicPets.i18n.test.tsx`

**Interfaces:**
- Consumes: `AddPetModal`'s existing `form` state pattern (`useState`, `set(k)` helper) from Task-independent existing code.
- Produces: `form.weightKg: string` in `AddPetModal`'s local state; POST `/api/pets` payload gains `weightKg: number | null`. Backend already accepts this (`src/backend/services/pet.service.ts:13`, `z.number().positive().optional().nullable()`) — no backend change needed.

- [ ] **Step 1: Add i18n keys**

In `src/frontend/src/i18n/index.ts`, EN section, after line 179 (`'clinic.pets.microchipOptional': 'Microchip ID (optional)',`):

```ts
  'clinic.pets.weightOptional': 'Weight in kg (optional)',
```

TH section, after line 471 (`'clinic.pets.microchipOptional': 'หมายเลขไมโครชิป (ไม่จำเป็น)',`):

```ts
  'clinic.pets.weightOptional': 'น้ำหนัก กก. (ไม่จำเป็น)',
```

- [ ] **Step 2: Export AddPetModal for testability**

`AddPetModal` is currently a private (non-exported) function inside `ClinicPets.tsx`. Export it so it can be rendered in isolation for the test in Step 3 — a minimal, non-breaking change.

In `src/frontend/src/views/clinic/ClinicPets.tsx`, change line 80 from:

```tsx
function AddPetModal({ ownerId, ownerName, onClose, onSuccess }: { ownerId: number; ownerName: string; onClose: () => void; onSuccess: () => void }) {
```

to:

```tsx
export function AddPetModal({ ownerId, ownerName, onClose, onSuccess }: { ownerId: number; ownerName: string; onClose: () => void; onSuccess: () => void }) {
```

- [ ] **Step 3: Write the failing test**

Create `src/frontend/src/__tests__/AddPetModal.test.tsx`:

```tsx
// src/frontend/src/__tests__/AddPetModal.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const postMock = vi.fn().mockResolvedValue({ data: { data: { id: 1 } } })
vi.mock('../utils/api', () => ({
  default: { post: (...args: unknown[]) => postMock(...args) },
}))
vi.mock('../hooks/usePhotoUpload', () => ({
  usePhotoUpload: () => ({ uploadPhoto: vi.fn(), isUploading: false, uploadError: '' }),
}))

import { AddPetModal } from '../views/clinic/ClinicPets'

describe('AddPetModal — weightKg field', () => {
  it('renders a weight input with the correct placeholder', () => {
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    expect(screen.getByPlaceholderText(/weight in kg/i)).toBeInTheDocument()
  })

  it('submits weightKg as a number in the create-pet payload', async () => {
    postMock.mockClear()
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/pet name/i), 'Rex')
    await userEvent.type(screen.getByPlaceholderText(/weight in kg/i), '12.5')
    await userEvent.click(screen.getByText('Save Pet'))
    expect(postMock).toHaveBeenCalledWith('/api/pets', expect.objectContaining({ weightKg: 12.5 }))
  })

  it('submits weightKg as null when left blank', async () => {
    postMock.mockClear()
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/pet name/i), 'Rex')
    await userEvent.click(screen.getByText('Save Pet'))
    expect(postMock).toHaveBeenCalledWith('/api/pets', expect.objectContaining({ weightKg: null }))
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run src/__tests__/AddPetModal.test.tsx`
Expected: FAIL — `getByPlaceholderText(/weight in kg/i)` finds no element (weight input doesn't exist yet), and second/third tests fail on the same missing element.

- [ ] **Step 5: Implement the weight field**

In `src/frontend/src/views/clinic/ClinicPets.tsx`, change line 82 from:

```tsx
  const [form, setForm] = useState({ name: '', species: 'canine', breed: '', color: '', gender: '', birthDate: '', microchipId: '', allergies: '', underlyingConditions: '' })
```

to:

```tsx
  const [form, setForm] = useState({ name: '', species: 'canine', breed: '', color: '', gender: '', birthDate: '', weightKg: '', microchipId: '', allergies: '', underlyingConditions: '' })
```

Change the submit payload at lines 109-121 from:

```tsx
      await api.post('/api/pets', {
        ownerId,
        name: form.name,
        species: form.species,
        breed: form.breed || null,
        color: form.color || null,
        gender: form.gender || null,
        birthDate: form.birthDate || null,
        microchipId: form.microchipId || null,
        allergies: form.allergies || null,
        underlyingConditions: form.underlyingConditions || null,
        photoUrl,
      })
```

to:

```tsx
      await api.post('/api/pets', {
        ownerId,
        name: form.name,
        species: form.species,
        breed: form.breed || null,
        color: form.color || null,
        gender: form.gender || null,
        birthDate: form.birthDate || null,
        weightKg: form.weightKg ? Number(form.weightKg) : null,
        microchipId: form.microchipId || null,
        allergies: form.allergies || null,
        underlyingConditions: form.underlyingConditions || null,
        photoUrl,
      })
```

Add the weight input in the form JSX, after the breed/color row (line 185, after the closing `</div>` of that flex row) and before the birthDate input (line 186):

```tsx
          <div className="flex gap-md">
            <input className="flex-1 bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.breedOptional')} value={form.breed} onChange={set('breed')} />
            <input className="flex-1 bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.colorOptional')} value={form.color} onChange={set('color')} />
          </div>
          <input type="number" step="0.01" min="0" className="bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" placeholder={t('clinic.pets.weightOptional')} value={form.weightKg} onChange={set('weightKg')} />
          <input type="date" className="bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" value={form.birthDate} onChange={set('birthDate')} />
```

(This replaces the original standalone breed/color `<div>` + `birthDate` input block at lines 182-186 with the version above that inserts the new weight input between them.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run src/__tests__/AddPetModal.test.tsx src/__tests__/ClinicPets.i18n.test.tsx`
Expected: PASS (all tests in both files).

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicPets.tsx src/frontend/src/i18n/index.ts src/frontend/src/__tests__/AddPetModal.test.tsx
git commit -m "feat: add weight field to Add Pet form"
```

---

### Task 3: Expand Pet Overview tab to show all captured fields

**Files:**
- Modify: `src/frontend/src/views/clinic/ClinicPets.tsx:312-325`
- Test: `src/frontend/src/__tests__/PetOverview.test.tsx` (new)

**Interfaces:**
- Consumes: `Pet` interface (`ClinicPets.tsx:11`) — already has all needed fields (`species, breed, color, birthDate, gender, weightKg, microchipId, allergies, underlyingConditions`). `PetDetail` component (`ClinicPets.tsx:248-358`) — not exported; export it for this task's test, same pattern as Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Export PetDetail for testability**

In `src/frontend/src/views/clinic/ClinicPets.tsx`, change line 248 from:

```tsx
function PetDetail({ petId, onAddVaccination }: { petId: number; onAddVaccination: () => void }) {
```

to:

```tsx
export function PetDetail({ petId, onAddVaccination }: { petId: number; onAddVaccination: () => void }) {
```

- [ ] **Step 2: Write the failing test**

Create `src/frontend/src/__tests__/PetOverview.test.tsx`:

```tsx
// src/frontend/src/__tests__/PetOverview.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockPet = {
  id: 1, ownerId: 1, name: 'Rex', species: 'canine', breed: 'Labrador', color: 'Golden',
  birthDate: '2020-01-15', gender: 'male', weightKg: 22.4, microchipId: 'CHIP123',
  allergies: 'Pollen', underlyingConditions: 'None', isActive: true,
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { data: mockPet }, isLoading: false }),
}))

import { PetDetail } from '../views/clinic/ClinicPets'

describe('PetDetail — Overview tab', () => {
  it('shows species, breed, gender, weight, microchipId, allergies, and underlyingConditions', () => {
    render(<PetDetail petId={1} onAddVaccination={vi.fn()} />)
    expect(screen.getByText('Species')).toBeInTheDocument()
    expect(screen.getByText('canine')).toBeInTheDocument()
    expect(screen.getByText('Breed')).toBeInTheDocument()
    expect(screen.getByText('Labrador')).toBeInTheDocument()
    expect(screen.getByText('Gender')).toBeInTheDocument()
    expect(screen.getByText('male')).toBeInTheDocument()
    expect(screen.getByText('Microchip ID')).toBeInTheDocument()
    expect(screen.getByText('CHIP123')).toBeInTheDocument()
    expect(screen.getByText('Allergies')).toBeInTheDocument()
    expect(screen.getByText('Pollen')).toBeInTheDocument()
    expect(screen.getByText('Underlying conditions')).toBeInTheDocument()
    expect(screen.getByText('22.4 kg')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run src/__tests__/PetOverview.test.tsx`
Expected: FAIL — `getByText('Species')` not found (Overview tab currently only renders Weight/Color/Date of birth).

- [ ] **Step 4: Implement the expanded Overview tab**

In `src/frontend/src/views/clinic/ClinicPets.tsx`, change lines 312-325 from:

```tsx
      {tab === 'Overview' && (
        <div className="flex flex-col gap-md">
          {[
            { label: 'Weight', value: pet.weightKg ? `${pet.weightKg} kg` : '—' },
            { label: 'Color', value: pet.color ?? '—' },
            { label: 'Date of birth', value: pet.birthDate ? new Date(pet.birthDate).toLocaleDateString() : '—' },
          ].map(r => (
            <div key={r.label} className="flex justify-between items-center min-h-[48px] border-b border-outline-variant/50 py-sm">
              <span className="text-body-sm text-on-surface-variant">{r.label}</span>
              <span className="text-body-sm font-medium">{r.value}</span>
            </div>
          ))}
        </div>
      )}
```

to:

```tsx
      {tab === 'Overview' && (
        <div className="flex flex-col gap-md">
          {[
            { label: 'Species', value: pet.species ?? '—' },
            { label: 'Breed', value: pet.breed ?? '—' },
            { label: 'Gender', value: pet.gender ?? '—' },
            { label: 'Date of birth', value: pet.birthDate ? new Date(pet.birthDate).toLocaleDateString() : '—' },
            { label: 'Weight', value: pet.weightKg ? `${pet.weightKg} kg` : '—' },
            { label: 'Color', value: pet.color ?? '—' },
            { label: 'Microchip ID', value: pet.microchipId ?? '—' },
            { label: 'Allergies', value: pet.allergies ?? '—' },
            { label: 'Underlying conditions', value: pet.underlyingConditions ?? '—' },
          ].map(r => (
            <div key={r.label} className="flex justify-between items-center min-h-[48px] border-b border-outline-variant/50 py-sm">
              <span className="text-body-sm text-on-surface-variant">{r.label}</span>
              <span className="text-body-sm font-medium">{r.value}</span>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run src/__tests__/PetOverview.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Run the full frontend suite to check for regressions**

Run: `cd src/frontend && npx vitest run`
Expected: All tests pass, including the pre-existing `ClinicPets.i18n.test.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicPets.tsx src/frontend/src/__tests__/PetOverview.test.tsx
git commit -m "feat: show all captured pet fields on Overview tab"
```

---

### Task 4: Add vaccination.create permission (backend RBAC)

**Files:**
- Modify: `src/backend/prisma/seed-rbac.ts:22-90` (permission catalogue), `:131-148` (doctor role), `:150-169` (clinic_staff role)
- Modify: `src/backend/routes/vaccination.routes.ts:14`
- Test: `src/backend/tests/integration/vaccination-create-permission.test.ts` (new)

**Interfaces:**
- Consumes: existing `requirePermission` from `src/backend/middlewares/permission.middleware.ts:65` (no signature change).
- Produces: new permission code `'vaccination.create'`, granted to `doctor` and `clinic_staff` system roles. `POST /api/vaccinations` now requires `vaccination.create` instead of `emr.create`. `clinic_admin` and `emr.create`-only holders no longer have vaccination-create access via `emr.create` alone (doctor is re-granted explicitly).

- [ ] **Step 1: Write the failing integration test**

Create `src/backend/tests/integration/vaccination-create-permission.test.ts`, following the existing pattern in `src/backend/tests/integration/vaccination-worklist.test.ts`:

```ts
// src/backend/tests/integration/vaccination-create-permission.test.ts
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { clearPermCache } from '../../services/permission.service'

const SUBDOMAIN = 'vax-create-perm-test'
const PASSWORD  = 'TestPass1!'

let server: Server
let tid = 0
let petId = 0
let staffToken  = ''
let doctorToken = ''
let adminToken  = ''

async function login(username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain: SUBDOMAIN, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const passwordHash = await bcrypt.hash(PASSWORD, 4)

  const tenant = await prisma.tenant.create({ data: { name: 'Vax Create Perm Test', subdomain: SUBDOMAIN } })
  tid = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId: tid, name: 'Main' } })

  const owner = await prisma.owner.create({ data: { tenantId: tid, firstName: 'Jane', lastName: 'Doe', phone: '0800000000' } })
  const pet = await prisma.pet.create({ data: { tenantId: tid, ownerId: owner.id, name: 'Rex', species: 'canine' } })
  petId = pet.id

  const staffRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const adminRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })

  const staffUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Staff VCP', username: 'staff_vcp', email: 'staff@vcp.test', passwordHash, role: 'staff', roleId: staffRole.id },
  })
  await prisma.userRole.create({ data: { userId: staffUser.id, roleId: staffRole.id, tenantId: tid } })
  await prisma.userBranch.create({ data: { userId: staffUser.id, branchId: branch.id, tenantId: tid } })

  const doctorUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Doctor VCP', username: 'doctor_vcp', email: 'doctor@vcp.test', passwordHash, role: 'doctor', roleId: doctorRole.id },
  })
  await prisma.userRole.create({ data: { userId: doctorUser.id, roleId: doctorRole.id, tenantId: tid } })
  await prisma.userBranch.create({ data: { userId: doctorUser.id, branchId: branch.id, tenantId: tid } })

  const adminUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Admin VCP', username: 'admin_vcp', email: 'admin@vcp.test', passwordHash, role: 'admin', roleId: adminRole.id },
  })
  await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id, tenantId: tid } })

  staffToken  = await login('staff_vcp')
  doctorToken = await login('doctor_vcp')
  adminToken  = await login('admin_vcp')
})

afterAll(async () => {
  clearPermCache()
  await prisma.vaccination.deleteMany({ where: { pet: { tenantId: tid } } })
  await prisma.userBranch.deleteMany({ where: { tenantId: tid } })
  await prisma.userRole.deleteMany({ where: { tenantId: tid } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.pet.deleteMany({ where: { tenantId: tid } })
  await prisma.owner.deleteMany({ where: { tenantId: tid } })
  await prisma.branch.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
  await prisma.$disconnect()

  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('POST /api/vaccinations — vaccination.create permission', () => {
  it('clinic_staff can create a vaccination record', async () => {
    const res = await request(server)
      .post('/api/vaccinations')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ petId, vaccineName: 'Rabies', administeredAt: new Date().toISOString() })
    expect(res.status).toBe(201)
  })

  it('doctor can still create a vaccination record', async () => {
    const res = await request(server)
      .post('/api/vaccinations')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ petId, vaccineName: 'Rabies', administeredAt: new Date().toISOString() })
    expect(res.status).toBe(201)
  })

  it('clinic_admin is denied (403) — does not have vaccination.create', async () => {
    const res = await request(server)
      .post('/api/vaccinations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ petId, vaccineName: 'Rabies', administeredAt: new Date().toISOString() })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('vaccination.create')
  })

  it('clinic_staff is still denied (403) on medical-record creation — emr.create not granted', async () => {
    const res = await request(server)
      .post('/api/medical-records')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ petId, assessment: 'Checkup' })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('emr.create')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest tests/integration/vaccination-create-permission.test.ts --runInBand`
Expected: FAIL — `clinic_staff can create a vaccination record` gets 403 (not 201); `clinic_admin is denied` test may already pass by coincidence since `emr.create` also denies admin today, but the error message assertion `toContain('vaccination.create')` fails because the current error is about `emr.create`.

- [ ] **Step 3: Add the permission to the catalogue**

In `src/backend/prisma/seed-rbac.ts`, add a new entry to the `PERMISSIONS` array after line 39 (`emr.attach`):

```ts
  { code: 'vaccination.create',        module: 'emr',          action: 'create',      description: 'Record a vaccination administration' },
```

- [ ] **Step 4: Grant to doctor and clinic_staff**

In the `doctor` role definition (`seed-rbac.ts:134-147`), change:

```ts
      'emr.view', 'emr.create', 'emr.edit', 'emr.attach',
```

to:

```ts
      'emr.view', 'emr.create', 'emr.edit', 'emr.attach', 'vaccination.create',
```

In the `clinic_staff` role definition (`seed-rbac.ts:153-168`), change:

```ts
      'emr.view', 'emr.attach',
```

to:

```ts
      'emr.view', 'emr.attach', 'vaccination.create',
```

- [ ] **Step 5: Switch the route guard**

In `src/backend/routes/vaccination.routes.ts`, change line 14 from:

```ts
router.post('/',        requirePlane('clinic'), requirePermission('emr.create'), validate(createVaccinationSchema), handleCreateVaccination)
```

to:

```ts
router.post('/',        requirePlane('clinic'), requirePermission('vaccination.create'), validate(createVaccinationSchema), handleCreateVaccination)
```

- [ ] **Step 6: Re-seed the local/test database**

Run: `cd src/backend && npm run db:seed`
Expected: console output ends with `[seed-rbac] RBAC seed complete.` — this applies the new permission and role grants to the DB the test suite runs against.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd src/backend && npx jest tests/integration/vaccination-create-permission.test.ts --runInBand`
Expected: PASS (4 tests).

- [ ] **Step 8: Run the existing vaccination-worklist test to check for regressions**

Run: `cd src/backend && npx jest tests/integration/vaccination-worklist.test.ts --runInBand`
Expected: PASS — note `doctorToken` in that file's comment says "doctor token with emr.create"; doctor still has `emr.create` unchanged, so this remains true. The `POST /api/vaccinations with administeredExternally` test uses `doctorToken`, which now also needs `vaccination.create` (granted in Step 4) — still passes.

- [ ] **Step 9: Commit**

```bash
git add src/backend/prisma/seed-rbac.ts src/backend/routes/vaccination.routes.ts src/backend/tests/integration/vaccination-create-permission.test.ts
git commit -m "feat: add vaccination.create permission, grant to doctor and clinic_staff"
```

---

### Task 5: Guard "Add Vaccination" button by permission

**Files:**
- Modify: `src/frontend/src/views/clinic/ClinicPets.tsx:338-344`
- Test: `src/frontend/src/__tests__/PetOverview.test.tsx` (extend, or add to same file)

**Interfaces:**
- Consumes: `Can` from `src/frontend/src/components/Can.tsx` (default export, `perm: string` prop) — the live component used by `UserManagementTab.tsx:6`. Do NOT use `src/frontend/src/guards/Can.tsx` (dead code).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Add to `src/frontend/src/__tests__/PetOverview.test.tsx` (created in Task 3), add the `authStore` mock and a new `describe` block:

```tsx
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { hasPermission: (code: string) => boolean }) => unknown) =>
    selector({ hasPermission: (code: string) => mockPermissions.includes(code) }),
}))

let mockPermissions: string[] = []
```

Move `let mockPermissions: string[] = []` to the top of the file (before the `vi.mock` calls, since `vi.mock` factories are hoisted — declare it with `var` or reference via a mutable object to avoid the hoisting issue). Use this exact top-of-file structure instead:

```tsx
// src/frontend/src/__tests__/PetOverview.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockPet = {
  id: 1, ownerId: 1, name: 'Rex', species: 'canine', breed: 'Labrador', color: 'Golden',
  birthDate: '2020-01-15', gender: 'male', weightKg: 22.4, microchipId: 'CHIP123',
  allergies: 'Pollen', underlyingConditions: 'None', isActive: true,
}

const state: { permissions: string[] } = { permissions: [] }

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { data: mockPet }, isLoading: false }),
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { hasPermission: (code: string) => boolean }) => unknown) =>
    selector({ hasPermission: (code: string) => state.permissions.includes(code) }),
}))

import { PetDetail } from '../views/clinic/ClinicPets'

describe('PetDetail — Overview tab', () => {
  it('shows species, breed, gender, weight, microchipId, allergies, and underlyingConditions', () => {
    render(<PetDetail petId={1} onAddVaccination={vi.fn()} />)
    expect(screen.getByText('Species')).toBeInTheDocument()
    expect(screen.getByText('canine')).toBeInTheDocument()
    expect(screen.getByText('Breed')).toBeInTheDocument()
    expect(screen.getByText('Labrador')).toBeInTheDocument()
    expect(screen.getByText('Gender')).toBeInTheDocument()
    expect(screen.getByText('male')).toBeInTheDocument()
    expect(screen.getByText('Microchip ID')).toBeInTheDocument()
    expect(screen.getByText('CHIP123')).toBeInTheDocument()
    expect(screen.getByText('Allergies')).toBeInTheDocument()
    expect(screen.getByText('Pollen')).toBeInTheDocument()
    expect(screen.getByText('Underlying conditions')).toBeInTheDocument()
    expect(screen.getByText('22.4 kg')).toBeInTheDocument()
  })
})

describe('PetDetail — Add Vaccination button permission guard', () => {
  beforeEach(() => { state.permissions = [] })

  it('hides Add Vaccination button when user lacks vaccination.create', async () => {
    render(<PetDetail petId={1} onAddVaccination={vi.fn()} />)
    await userEvent.click(screen.getByText('Vaccinations'))
    expect(screen.queryByText('Add Vaccination')).not.toBeInTheDocument()
  })

  it('shows Add Vaccination button when user has vaccination.create', async () => {
    state.permissions = ['vaccination.create']
    render(<PetDetail petId={1} onAddVaccination={vi.fn()} />)
    await userEvent.click(screen.getByText('Vaccinations'))
    expect(screen.getByText('Add Vaccination')).toBeInTheDocument()
  })
})
```

This replaces the entire content of `src/frontend/src/__tests__/PetOverview.test.tsx` from Task 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run src/__tests__/PetOverview.test.tsx`
Expected: FAIL — `hides Add Vaccination button when user lacks vaccination.create` fails because the button currently renders unconditionally (`screen.queryByText('Add Vaccination')` IS in the document).

- [ ] **Step 3: Add the Can guard**

In `src/frontend/src/views/clinic/ClinicPets.tsx`, add the import at the top of the file (after line 6, `import { useT } from '../../i18n'`):

```tsx
import Can from '../../components/Can'
```

Change lines 340-344 from:

```tsx
          <div className="flex justify-end mb-md">
            <button onClick={onAddVaccination} className="flex items-center gap-sm bg-primary text-primary-on rounded-lg px-md py-sm min-h-[44px] text-body-sm font-semibold hover:bg-primary/90 transition-colors">
              <MaterialIcon name="add" size={18} />Add Vaccination
            </button>
          </div>
```

to:

```tsx
          <div className="flex justify-end mb-md">
            <Can perm="vaccination.create">
              <button onClick={onAddVaccination} className="flex items-center gap-sm bg-primary text-primary-on rounded-lg px-md py-sm min-h-[44px] text-body-sm font-semibold hover:bg-primary/90 transition-colors">
                <MaterialIcon name="add" size={18} />Add Vaccination
              </button>
            </Can>
          </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run src/__tests__/PetOverview.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full frontend suite to check for regressions**

Run: `cd src/frontend && npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicPets.tsx src/frontend/src/__tests__/PetOverview.test.tsx
git commit -m "fix: hide Add Vaccination button for roles without vaccination.create"
```

---

### Task 6: Update RBAC docs and write the prod deploy runbook note

**Files:**
- Modify: `.claude/skills/anemal-rbac-matrix/references/permission-matrix.md:24-38,82-98`

**Interfaces:**
- Consumes: nothing (docs only).
- Produces: nothing (docs only).

- [ ] **Step 1: Add vaccination.create to the permission grid**

In `.claude/skills/anemal-rbac-matrix/references/permission-matrix.md`, after line 38 (`| \`emr.attach\` | EMR (lab/X-ray files) | - | E | V |`), add:

```
| `vaccination.create` | EMR / Clinical (vaccination only) | - | E | E |
```

- [ ] **Step 2: Add the route mapping**

After line 98 (`| | POST \`/:id/attachments\` | \`emr.attach\` |`), add a new row:

```
| `vaccination.routes` | GET | `emr.view` |
| | POST `/` | `vaccination.create` |
```

- [ ] **Step 3: Add a note on the narrower-permission decision**

After the existing "Notes on key business decisions" bullet list (after line 78, `  \`emr.attach\` (upload lab/X-ray) and \`prescriptions.dispense\` (hand out what the doctor ordered).`), add:

```
- **Vaccination administration uses its own `vaccination.create` code**, separate from
  `emr.create` (full SOAP-note/medical-record creation). `clinic_staff` holds
  `vaccination.create` (vet techs administer vaccines under doctor supervision) but NOT
  `emr.create` — they cannot write medical-record/SOAP notes.
```

- [ ] **Step 4: Add the prod deploy runbook note**

At the end of `.claude/skills/anemal-rbac-matrix/references/permission-matrix.md`, after the existing "## 5. Multi-role addendum (CR-01)" section, add a new section:

```markdown

## 6. Applying seed-rbac.ts changes to production

`seedRbac()` (`src/backend/prisma/seed-rbac.ts`) has NO automatic trigger in this repo — no
Dockerfile, CI/CD workflow, or app-boot hook runs it. After any change to `PERMISSIONS` or
`SYSTEM_ROLES`, an operator must manually run `npm run db:seed` against the target database.

**Before running in production**, diff current system-role grants against the updated seed
file to catch any permission that was manually granted outside the seed (re-running
`seedRbac()` deletes any `RolePermission` row on a system role whose code is not in the
current seed definition — see `seed-rbac.ts:228-236`):

```sql
SELECT cr.key AS role, rp."permissionCode"
FROM "role_permissions" rp
JOIN "clinic_roles" cr ON cr.id = rp."roleId"
WHERE cr."isSystem" = true
ORDER BY cr.key, rp."permissionCode";
```

Compare the output against `SYSTEM_ROLES` in `seed-rbac.ts`. Any code present in prod but
absent from the seed file will be revoked on the next `npm run db:seed` run — confirm that's
intended before proceeding.
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/anemal-rbac-matrix/references/permission-matrix.md
git commit -m "docs: document vaccination.create permission and seed-rbac deploy runbook"
```
