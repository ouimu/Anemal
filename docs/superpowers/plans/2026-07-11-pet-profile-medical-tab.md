# Plan — Item 2: Pet Profile Medical Tab (Step 4)

Branch: `feature/pet-medical-tab-emr-rollup`
Refs: `2026-07-11-pet-profile-medical-tab-brainstorm.md`, `-tasks.md`, `-grill.md` (ADR-0012)
BA sign-off: SIGNED OFF WITH CHANGES. Grill: 6 findings, all resolved.

Scope: backend (permission-conditional include) + frontend (`ClinicPets.tsx`,
`ClinicEMR.tsx`) + docs (`04-pet-owner.md`). No schema change, no new
endpoints, no new permission codes (reuses `crm.view`, `emr.view`,
`vaccination.create`).

## Task 1 — backend: gate `medicalRecords`/`vaccinations` on `emr.view` (~5 min)

Files:
- Modify: `src/backend/models/pet.repository.ts:31-44` (`findPetById`)
- Modify: `src/backend/services/pet.service.ts:42-46` (`getPet`)
- Modify: `src/backend/controllers/pet.controller.ts:15-20` (`handleGetPet`)
- Test: `src/backend/tests/integration/pet-medical-degradation.test.ts` (new)

`pet.repository.ts` — make the EMR includes conditional, default `true` so
`updatePet`'s internal `getPet` existence check (which doesn't care about the
extra fields) needs no call-site change:

```ts
export function findPetById(tenantId: number, id: number, includeEmr = true) {
  return prisma.pet.findFirst({
    where: { id, tenantId, isActive: true },
    include: {
      owner: true,
      ...(includeEmr ? {
        vaccinations: { orderBy: { administeredAt: 'desc' } },
        medicalRecords: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { id: true, createdAt: true, assessment: true, doctorId: true },
        },
      } : {}),
    },
  })
}
```

`pet.service.ts`:

```ts
export async function getPet(tenantId: number, id: number, includeEmr = true) {
  const pet = await petRepo.findPetById(tenantId, id, includeEmr)
  if (!pet) throw new PetError('Pet not found', 404)
  return pet
}
```

`pet.controller.ts` — resolve the caller's permission set and pass it through
(mirrors `requirePermission`'s own use of `resolvePermissions`):

```ts
import { resolvePermissions } from '../services/permission.service'
// ...
export async function handleGetPet(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await resolvePermissions(req.context!.userId, req.context!.tenantId)
    const data = await getPet(req.context!.tenantId, parseInt(req.params.id), perms.has('emr.view'))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
```

Test (new file, modeled on `vaccination-create-permission.test.ts`'s
tenant/role/login setup):

```ts
// src/backend/tests/integration/pet-medical-degradation.test.ts
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { clearPermCache } from '../../services/permission.service'

const SUBDOMAIN = 'pet-med-degrade-test'
const PASSWORD  = 'TestPass1!'

let server: Server
let tid = 0
let petId = 0
let doctorToken = ''   // holds emr.view
let staffToken  = ''   // clinic_staff holds emr.view too — use a custom no-emr.view role instead

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  const tenant = await prisma.tenant.create({ data: { name: 'Pet Med Degrade Test', subdomain: SUBDOMAIN } })
  tid = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId: tid, name: 'Main' } })
  const owner = await prisma.owner.create({ data: { tenantId: tid, firstName: 'Jane', lastName: 'Doe', phone: '0800000000' } })
  const pet = await prisma.pet.create({ data: { tenantId: tid, ownerId: owner.id, name: 'Rex', species: 'canine' } })
  petId = pet.id

  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  await prisma.medicalRecord.create({ data: { tenantId: tid, petId, doctorId: 1, assessment: 'Checkup' } })
  await prisma.vaccination.create({ data: { tenantId: tid, petId, vaccineName: 'Rabies', administeredAt: new Date() } })

  // Custom role cloned from clinic_staff with emr.view/emr.attach toggled off (per BA CORR-1 —
  // removing a permission is never escalation, so this clone is always permitted).
  const clinicStaffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
  const staffPerms = await prisma.rolePermission.findMany({ where: { roleId: clinicStaffRole.id } })
  const noEmrRole = await prisma.clinicRole.create({ data: { tenantId: tid, key: 'no_emr_staff', name: 'No-EMR Staff', isSystem: false } })
  for (const rp of staffPerms) {
    if (rp.permissionCode.startsWith('emr.')) continue
    await prisma.rolePermission.create({ data: { roleId: noEmrRole.id, permissionCode: rp.permissionCode } })
  }

  const doctorUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Doctor PMD', username: 'doctor_pmd', email: 'doctor@pmd.test', passwordHash, role: 'doctor', roleId: doctorRole.id },
  })
  await prisma.userRole.create({ data: { userId: doctorUser.id, roleId: doctorRole.id, tenantId: tid } })
  await prisma.userBranch.create({ data: { userId: doctorUser.id, branchId: branch.id, tenantId: tid } })

  const noEmrUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Staff PMD', username: 'staff_pmd', email: 'staff@pmd.test', passwordHash, role: 'staff', roleId: noEmrRole.id },
  })
  await prisma.userRole.create({ data: { userId: noEmrUser.id, roleId: noEmrRole.id, tenantId: tid } })
  await prisma.userBranch.create({ data: { userId: noEmrUser.id, branchId: branch.id, tenantId: tid } })

  async function login(username: string): Promise<string> {
    const step1 = await request(server).post('/auth/login').send({ subdomain: SUBDOMAIN, username, password: PASSWORD })
    if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
    const { pendingToken, branches } = step1.body.data
    const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
    return step2.body.data.token as string
  }
  doctorToken = await login('doctor_pmd')
  staffToken  = await login('staff_pmd')
})

afterAll(async () => {
  clearPermCache()
  await prisma.medicalRecord.deleteMany({ where: { tenantId: tid } })
  await prisma.vaccination.deleteMany({ where: { pet: { tenantId: tid } } })
  await prisma.rolePermission.deleteMany({ where: { role: { tenantId: tid } } })
  await prisma.userBranch.deleteMany({ where: { tenantId: tid } })
  await prisma.userRole.deleteMany({ where: { tenantId: tid } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.clinicRole.deleteMany({ where: { tenantId: tid } })
  await prisma.pet.deleteMany({ where: { tenantId: tid } })
  await prisma.owner.deleteMany({ where: { tenantId: tid } })
  await prisma.branch.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('GET /api/pets/:id — emr.view-gated medicalRecords/vaccinations', () => {
  it('doctor (has emr.view) sees medicalRecords and vaccinations', async () => {
    const res = await request(server).get(`/api/pets/${petId}`).set('Authorization', `Bearer ${doctorToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.medicalRecords).toHaveLength(1)
    expect(res.body.data.vaccinations).toHaveLength(1)
  })

  it('custom role without emr.view gets neither field, but still sees the pet', async () => {
    const res = await request(server).get(`/api/pets/${petId}`).set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Rex')
    expect(res.body.data.medicalRecords).toBeUndefined()
    expect(res.body.data.vaccinations).toBeUndefined()
  })
})
```

Run: `npm test -- pet-medical-degradation` (backend workspace)
Expected: 2/2 PASS

Commit: `feat(pet): gate medicalRecords/vaccinations include on emr.view (PET-MED-2)`

## Task 2 — frontend: Medical tab drill-in + degraded empty state (~5 min)

Files:
- Modify: `src/frontend/src/views/clinic/ClinicPets.tsx` (imports, `PetDetail`, Medical tab block ~615-624)
- Test: `src/frontend/src/__tests__/ClinicPetsMedicalTab.test.tsx` (new)

Add imports and hooks in `PetDetail` (near existing `useState`/`useQuery`):

```tsx
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
// ...
export function PetDetail({ petId, onAddVaccination }: { petId: number; onAddVaccination: () => void }) {
  const navigate = useNavigate()
  const hasPermission = useAuthStore(s => s.hasPermission)
  // ...existing state...
```

Replace the Medical tab block (lines 615-624):

```tsx
{tab === 'Medical' && (
  <div>
    {pet.medicalRecords?.length ? (
      <>
        {pet.medicalRecords.map(r => (
          <div key={r.id} className="flex justify-between items-center min-h-[48px] border-b border-outline-variant/50 py-sm">
            <span className="text-body-sm">{r.assessment ?? 'Visit'}</span>
            <span className="text-body-sm text-on-surface-variant">{new Date(r.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
        <Can perm="emr.view">
          <button
            type="button"
            onClick={() => navigate(`/clinic/emr?petId=${pet.id}`)}
            className="mt-md text-body-sm font-semibold text-primary hover:underline"
          >
            View all in EMR
          </button>
        </Can>
      </>
    ) : (
      <p className="text-body-sm text-on-surface-variant py-lg">
        {hasPermission('emr.view') ? 'No medical records yet.' : "You don't have access to clinical records."}
      </p>
    )}
  </div>
)}
```

Test (new file):

```tsx
// src/frontend/src/__tests__/ClinicPetsMedicalTab.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { PetDetail } from '../views/clinic/ClinicPets'
import { useAuthStore } from '../store/authStore'
import api from '../utils/api'

jest.mock('../utils/api')

function renderPetDetail() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PetDetail petId={1} onAddVaccination={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PetDetail — Medical tab', () => {
  beforeEach(() => {
    useAuthStore.setState({ permissions: ['crm.view', 'emr.view'], permissionsLoaded: true })
  })

  it('shows "View all in EMR" link when emr.view is held and records exist', async () => {
    ;(api.get as jest.Mock).mockResolvedValue({ data: { data: {
      id: 1, name: 'Rex', species: 'canine',
      medicalRecords: [{ id: 1, createdAt: new Date().toISOString(), assessment: 'Checkup' }],
    } } })
    renderPetDetail()
    fireEvent.click(await screen.findByText('Medical'))
    expect(await screen.findByText('View all in EMR')).toBeInTheDocument()
  })

  it('shows degraded message when emr.view is absent (field omitted by server)', async () => {
    useAuthStore.setState({ permissions: ['crm.view'], permissionsLoaded: true })
    ;(api.get as jest.Mock).mockResolvedValue({ data: { data: { id: 1, name: 'Rex', species: 'canine' } } })
    renderPetDetail()
    fireEvent.click(await screen.findByText('Medical'))
    expect(await screen.findByText("You don't have access to clinical records.")).toBeInTheDocument()
  })

  it('shows normal empty state when emr.view held but no records', async () => {
    ;(api.get as jest.Mock).mockResolvedValue({ data: { data: { id: 1, name: 'Rex', species: 'canine', medicalRecords: [] } } })
    renderPetDetail()
    fireEvent.click(await screen.findByText('Medical'))
    expect(await screen.findByText('No medical records yet.')).toBeInTheDocument()
  })
})
```

Run: `npm test -- ClinicPetsMedicalTab` (frontend workspace)
Expected: 3/3 PASS

Commit: `feat(pets): Medical tab drill-in link + emr.view-aware empty state (PET-MED-1, PET-MED-2)`

## Task 3 — frontend: `ClinicEMR.tsx` reads `?petId=` on mount (~3 min)

Files:
- Modify: `src/frontend/src/views/clinic/ClinicEMR.tsx:393` (add `useSearchParams` effect near `selectedPetId` state)
- Test: `src/frontend/src/__tests__/ClinicEMR.petIdParam.test.tsx` (new)

```tsx
import { useSearchParams } from 'react-router-dom'
// ... inside the component, right after:
const [selectedPetId, setSelectedPetId] = useState<number | null>(null)
const [searchParams] = useSearchParams()

useEffect(() => {
  const petId = searchParams.get('petId')
  if (petId) setSelectedPetId(parseInt(petId, 10))
}, [searchParams])
```

Test (new file):

```tsx
// src/frontend/src/__tests__/ClinicEMR.petIdParam.test.tsx
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ClinicEMR from '../views/clinic/ClinicEMR'
import api from '../utils/api'

jest.mock('../utils/api')

describe('ClinicEMR — ?petId= deep link', () => {
  it('pre-selects the pet from the petId query param', async () => {
    ;(api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/pets/42') return Promise.resolve({ data: { data: { id: 42, name: 'Rex', species: 'canine' } } })
      return Promise.resolve({ data: { data: [] } })
    })
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/clinic/emr?petId=42']}>
          <ClinicEMR />
        </MemoryRouter>
      </QueryClientProvider>
    )
    expect(await screen.findByText('Rex')).toBeInTheDocument()
  })
})
```

Run: `npm test -- ClinicEMR.petIdParam` (frontend workspace)
Expected: 1/1 PASS

Commit: `feat(emr): support ?petId= deep link from Pet Profile drill-in (PET-MED-1)`

## Task 4 — frontend: Vaccinations tab degrade + hide Add Vaccination button (~4 min)

Files:
- Modify: `src/frontend/src/views/clinic/ClinicPets.tsx` (Vaccinations tab block ~626-644)
- Test: extend `src/frontend/src/__tests__/ClinicPetsMedicalTab.test.tsx`

Replace the Vaccinations tab block:

```tsx
{tab === 'Vaccinations' && (
  <div>
    {pet.vaccinations !== undefined && (
      <div className="flex justify-end mb-md">
        <Can perm="vaccination.create">
          <button onClick={onAddVaccination} className="flex items-center gap-sm bg-primary text-primary-on rounded-lg px-md py-sm min-h-[44px] text-body-sm font-semibold hover:bg-primary/90 transition-colors">
            <MaterialIcon name="add" size={18} />Add Vaccination
          </button>
        </Can>
      </div>
    )}
    {pet.vaccinations?.length ? pet.vaccinations.map(v => (
      <div key={v.id} className="flex justify-between items-center min-h-[48px] border-b border-outline-variant/50 py-sm">
        <div>
          <p className="text-body-sm font-medium">{v.vaccineName}</p>
          {v.nextDueAt && <p className="text-label-md text-on-surface-variant">Due: {new Date(v.nextDueAt).toLocaleDateString()}</p>}
        </div>
        <span className="text-body-sm text-on-surface-variant">{new Date(v.administeredAt).toLocaleDateString()}</span>
      </div>
    )) : (
      <p className="text-body-sm text-on-surface-variant py-lg">
        {hasPermission('emr.view') ? 'No vaccination records yet.' : "You don't have access to clinical records."}
      </p>
    )}
  </div>
)}
```

Add to `ClinicPetsMedicalTab.test.tsx`:

```tsx
it('hides Add Vaccination button when vaccinations is absent (emr.view denied)', async () => {
  useAuthStore.setState({ permissions: ['crm.view'], permissionsLoaded: true })
  ;(api.get as jest.Mock).mockResolvedValue({ data: { data: { id: 1, name: 'Rex', species: 'canine' } } })
  renderPetDetail()
  fireEvent.click(await screen.findByText('Vaccinations'))
  expect(screen.queryByText('Add Vaccination')).not.toBeInTheDocument()
  expect(await screen.findByText("You don't have access to clinical records.")).toBeInTheDocument()
})
```

Run: `npm test -- ClinicPetsMedicalTab` (frontend workspace)
Expected: 4/4 PASS

Commit: `feat(pets): hide Add Vaccination when vaccinations omitted (PET-MED-2 CORR-2)`

## Task 5 — docs: reconcile naming + document new behavior (~3 min)

Files:
- Modify: `.claude/skills/anemal-screen-specs/references/04-pet-owner.md`
  - Lines 106/116: rename "Medical History" → "Medical" (match code's `TABS` const).
  - Line 164: fix stale "Owner edit / pet edit modals (create-only today)" — `EditPetModal` exists; update to reflect it's implemented.
  - Add a short subsection documenting: the "View all in EMR" drill-in (→ `ClinicEMR.tsx?petId=`), the `emr.view` server-side gate on `medicalRecords`/`vaccinations`, and the degraded empty-state copy.

No test (docs-only task). Verify by grep: `grep -c "Medical History" 04-pet-owner.md` → 0 after edit.

Commit: `docs(specs): reconcile Medical tab naming + document EMR drill-in/degradation (PET-MED-3)`

## Out of scope (do not implement in this branch)
- Structuring free-text allergies into discrete/coded entries (backlog).
- Folding discharged-admission/inpatient care history into this rollup (ADR-0011 deferral, separate future item).
- Permission-cache staleness on live role edits (pre-existing, global; grill Finding 6).
- Branch-level isolation hardening beyond existing `tenant_id` scoping (unaffected by this change — grill Finding 5).

## File list (exact)
- `src/backend/models/pet.repository.ts` (edit)
- `src/backend/services/pet.service.ts` (edit)
- `src/backend/controllers/pet.controller.ts` (edit)
- `src/backend/tests/integration/pet-medical-degradation.test.ts` (new)
- `src/frontend/src/views/clinic/ClinicPets.tsx` (edit)
- `src/frontend/src/views/clinic/ClinicEMR.tsx` (edit)
- `src/frontend/src/__tests__/ClinicPetsMedicalTab.test.tsx` (new)
- `src/frontend/src/__tests__/ClinicEMR.petIdParam.test.tsx` (new)
- `.claude/skills/anemal-screen-specs/references/04-pet-owner.md` (edit)

9 files (6 edit, 3 new), 5 tasks, 0 new dependencies, 0 new API endpoints,
0 new permission codes, 0 migrations — sized for the Ponytail gate (Step 5).
