# Appointment Tenant-Ownership Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a clinic user from booking an appointment with another tenant's `doctorId` or `petId` by validating tenant ownership in the service layer before insert.

**Architecture:** Add `findDoctorById(tenantId, id)` to `appointment.repository.ts` (tenant-scoped, active, doctor-role match — reuses the OR-match pattern already in `findDoctorsForBranch`). In `appointment.service.ts`, `createAppointment` and `createWalkIn` call this plus the existing `petRepo.findPetById(tenantId, petId)` before their current logic, throwing `AppointmentError(..., 404)` on a miss — same convention as `pet.service.ts`'s `findOwner` check.

**Tech Stack:** Node/Express, Prisma, Jest + supertest (existing integration test harness in `src/backend/tests/integration/`).

## Global Constraints

- Every query must include `tenantId` (CLAUDE.md multi-tenancy rule).
- 404 on cross-tenant reference mismatch (project convention, see `pet.service.ts:50`).
- No schema change, no new endpoint (Ponytail-gate scope).

---

### Task 1: `findDoctorById` repository function + unit-style repo tests

**Files:**
- Modify: `src/backend/models/appointment.repository.ts`
- Test: `src/backend/tests/integration/appointmentDoctors.test.ts` (append `describe` block)

**Interfaces:**
- Produces: `findDoctorById(tenantId: number, id: number): Promise<{ id: number; name: string } | null>` — tenant-scoped, `isActive`, doctor-role match.

- [ ] **Step 1: Write the failing tests**

Append to `src/backend/tests/integration/appointmentDoctors.test.ts`, after the existing `findDoctorsForBranch` describe block (before the `GET /api/appointments/doctors` describe block) — add the import at the top and the new describe block:

Change line 12 from:
```ts
import { findDoctorsForBranch } from '../../models/appointment.repository'
```
to:
```ts
import { findDoctorsForBranch, findDoctorById } from '../../models/appointment.repository'
```

Insert this new describe block (after line 177, before `describe('GET /api/appointments/doctors'`):
```ts
describe('findDoctorById (repository)', () => {
  it('returns the doctor when tenant matches', async () => {
    const doctorUser = await prisma.user.findFirstOrThrow({ where: { tenantId: tid, username: 'doctor_a' } })
    const result = await findDoctorById(tid, doctorUser.id)
    expect(result?.name).toBe('Dr. Branch A')
  })

  it('returns null for a doctor belonging to another tenant', async () => {
    const otherBranch = await prisma.branch.create({ data: { tenantId: otherTid, name: 'Cross-Tenant Branch' } })
    const passwordHash = await bcrypt.hash(PASSWORD, 10)
    const otherDoctor = await prisma.user.create({
      data: { tenantId: otherTid, username: 'doctor_crosscheck', name: 'Dr. Cross Tenant', passwordHash, role: 'doctor', isActive: true },
    })
    await prisma.userBranch.create({ data: { tenantId: otherTid, userId: otherDoctor.id, branchId: otherBranch.id } })
    await prisma.userRole.create({ data: { tenantId: otherTid, userId: otherDoctor.id, roleId: doctorSystemRoleId } })

    const result = await findDoctorById(tid, otherDoctor.id)
    expect(result).toBeNull()
  })

  it('returns null for a non-doctor user in the same tenant', async () => {
    const staffUser = await prisma.user.findFirstOrThrow({ where: { tenantId: tid, username: 'staff_a' } })
    const result = await findDoctorById(tid, staffUser.id)
    expect(result).toBeNull()
  })

  it('returns null for a deactivated doctor', async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10)
    const inactiveDoctor = await prisma.user.create({
      data: { tenantId: tid, username: 'doctor_inactive_byid', name: 'Dr. Inactive ById', passwordHash, role: 'doctor', branchId: branchAId, isActive: false },
    })
    await prisma.userRole.create({ data: { tenantId: tid, userId: inactiveDoctor.id, roleId: doctorSystemRoleId } })

    const result = await findDoctorById(tid, inactiveDoctor.id)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest appointmentDoctors --runInBand`
Expected: FAIL — `findDoctorById is not a function` (or TS compile error: no exported member `findDoctorById`).

- [ ] **Step 3: Implement `findDoctorById`**

In `src/backend/models/appointment.repository.ts`, after the existing `findDoctorsForBranch` function (after line 53), add:

```ts
/**
 * Single doctor lookup for tenant-ownership validation before booking.
 * Same doctor-role match as findDoctorsForBranch; no branch filter.
 */
export async function findDoctorById(tenantId: number, id: number) {
  const doctorSystemRole = await prisma.clinicRole.findFirst({
    where:  { key: 'doctor', tenantId: null, isSystem: true },
    select: { id: true },
  })
  const doctorRoleMatch = doctorSystemRole
    ? [{ key: 'doctor' }, { sourceRoleId: doctorSystemRole.id }]
    : [{ key: 'doctor' }]

  return prisma.user.findFirst({
    where: {
      id,
      tenantId,
      isActive: true,
      userRoles: {
        some: {
          tenantId,
          role: { OR: doctorRoleMatch },
        },
      },
    },
    select: { id: true, name: true },
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest appointmentDoctors --runInBand`
Expected: PASS (all describe blocks, including the 4 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/models/appointment.repository.ts src/backend/tests/integration/appointmentDoctors.test.ts
git commit -m "feat(appointments): add findDoctorById repository query for tenant-ownership checks"
```

---

### Task 2: Service-layer tenant-ownership checks in `createAppointment` / `createWalkIn`

**Files:**
- Modify: `src/backend/services/appointment.service.ts`

**Interfaces:**
- Consumes: `findDoctorById(tenantId, id)` from Task 1; `petRepo.findPetById(tenantId, id)` (existing, `src/backend/models/pet.repository.ts:31`, returns `null` if not found/inactive/wrong tenant).
- Produces: `createAppointment` and `createWalkIn` now throw `AppointmentError('Pet not found', 404)` / `AppointmentError('Doctor not found', 404)` before creating the row.

- [ ] **Step 1: Update imports and add ownership checks**

In `src/backend/services/appointment.service.ts`, change line 3 from:
```ts
import * as appointmentRepo from '../models/appointment.repository'
```
to:
```ts
import * as appointmentRepo from '../models/appointment.repository'
import * as petRepo from '../models/pet.repository'
```

Replace `createAppointment` (lines 64-78) with:
```ts
export async function createAppointment(tenantId: number, branchId: number | null, data: CreateAppointmentInput) {
  const pet = await petRepo.findPetById(tenantId, data.petId)
  if (!pet) throw new AppointmentError('Pet not found', 404)

  const doctor = await appointmentRepo.findDoctorById(tenantId, data.doctorId)
  if (!doctor) throw new AppointmentError('Doctor not found', 404)

  const start = new Date(data.scheduledAt)
  const end   = new Date(start.getTime() + data.durationMin * 60_000)

  const conflicts = await appointmentRepo.countDoctorConflicts(tenantId, branchId, data.doctorId, start, end)
  if (conflicts > 0) {
    throw new AppointmentError('Doctor already has an appointment in this time slot', 409)
  }

  // Soft doctor-shift check (Phase 4) — warns but does not block.
  const warning = branchId ? await shiftWarning(tenantId, branchId, data.doctorId, start) : null

  const appt = await appointmentRepo.createAppointment(tenantId, branchId, data, start)
  return { ...appt, shiftWarning: warning }
}
```

Replace `createWalkIn` (lines 80-82) with:
```ts
export async function createWalkIn(tenantId: number, branchId: number | null, petId: number, doctorId: number, reason?: string | null) {
  const pet = await petRepo.findPetById(tenantId, petId)
  if (!pet) throw new AppointmentError('Pet not found', 404)

  const doctor = await appointmentRepo.findDoctorById(tenantId, doctorId)
  if (!doctor) throw new AppointmentError('Doctor not found', 404)

  return appointmentRepo.createWalkIn(tenantId, branchId, petId, doctorId, reason)
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p src/backend`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/backend/services/appointment.service.ts
git commit -m "fix(appointments): validate doctorId/petId tenant ownership before booking"
```

---

### Task 3: Integration tests — cross-tenant doctorId/petId on both endpoints

**Files:**
- Create: `src/backend/tests/integration/appointmentTenantOwnership.test.ts`

**Interfaces:**
- Consumes: `app` (`src/backend/app.ts` default export), `prisma` (`src/backend/config/db.ts` default export). Same login helper pattern as `appointmentDoctors.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/backend/tests/integration/appointmentTenantOwnership.test.ts`:
```ts
/**
 * Tenant-ownership validation — cross-tenant doctorId/petId must 404, not silently attach.
 */
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'

const SUB = 'appt-tenant-own-test'
const PASSWORD = 'TestPass1!'

let server: Server
let tid = 0
let otherTid = 0
let branchId = 0
let staffToken = ''
let ownDoctorId = 0
let ownPetId = 0
let otherDoctorId = 0
let otherPetId = 0

async function login(username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain: SUB, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const tenant = await prisma.tenant.create({ data: { name: 'Appt Tenant Own Test', subdomain: SUB } })
  tid = tenant.id
  const otherTenant = await prisma.tenant.create({ data: { name: 'Appt Tenant Own Test — Other', subdomain: SUB + '-other' } })
  otherTid = otherTenant.id

  const branch = await prisma.branch.create({ data: { tenantId: tid, name: 'Main' } })
  branchId = branch.id
  const otherBranch = await prisma.branch.create({ data: { tenantId: otherTid, name: 'Other Main' } })

  const [staffRole, doctorRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } }),
  ])

  const passwordHash = await bcrypt.hash(PASSWORD, 10)

  const staffUser = await prisma.user.create({
    data: { tenantId: tid, username: 'staff_tenant_own', name: 'Staff Own', passwordHash, role: 'staff', branchId, isActive: true },
  })
  await prisma.userBranch.create({ data: { tenantId: tid, userId: staffUser.id, branchId } })
  await prisma.userRole.create({ data: { tenantId: tid, userId: staffUser.id, roleId: staffRole.id } })
  staffToken = await login('staff_tenant_own')

  const ownDoctor = await prisma.user.create({
    data: { tenantId: tid, username: 'doctor_own', name: 'Dr. Own', passwordHash, role: 'doctor', branchId, isActive: true },
  })
  await prisma.userBranch.create({ data: { tenantId: tid, userId: ownDoctor.id, branchId } })
  await prisma.userRole.create({ data: { tenantId: tid, userId: ownDoctor.id, roleId: doctorRole.id } })
  ownDoctorId = ownDoctor.id

  const ownOwner = await prisma.owner.create({ data: { tenantId: tid, firstName: 'Own', lastName: 'Owner', phone: '0810000001' } })
  const ownPet = await prisma.pet.create({ data: { tenantId: tid, ownerId: ownOwner.id, name: 'Own Pet', species: 'dog' } })
  ownPetId = ownPet.id

  const otherDoctor = await prisma.user.create({
    data: { tenantId: otherTid, username: 'doctor_other_tenant_own', name: 'Dr. Other', passwordHash, role: 'doctor', branchId: otherBranch.id, isActive: true },
  })
  await prisma.userBranch.create({ data: { tenantId: otherTid, userId: otherDoctor.id, branchId: otherBranch.id } })
  await prisma.userRole.create({ data: { tenantId: otherTid, userId: otherDoctor.id, roleId: doctorRole.id } })
  otherDoctorId = otherDoctor.id

  const otherOwner = await prisma.owner.create({ data: { tenantId: otherTid, firstName: 'Other', lastName: 'Owner', phone: '0810000002' } })
  const otherPet = await prisma.pet.create({ data: { tenantId: otherTid, ownerId: otherOwner.id, name: 'Other Pet', species: 'cat' } })
  otherPetId = otherPet.id
})

afterAll(async () => {
  await prisma.pet.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.owner.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.userRole.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.userBranch.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.user.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.branch.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tid, otherTid] } } })
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('POST /api/appointments — tenant ownership', () => {
  it('404s on a cross-tenant doctorId', async () => {
    const res = await request(server)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ petId: ownPetId, doctorId: otherDoctorId, scheduledAt: new Date(Date.now() + 3600_000).toISOString(), durationMin: 30 })
    expect(res.status).toBe(404)
  })

  it('404s on a cross-tenant petId', async () => {
    const res = await request(server)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ petId: otherPetId, doctorId: ownDoctorId, scheduledAt: new Date(Date.now() + 7200_000).toISOString(), durationMin: 30 })
    expect(res.status).toBe(404)
  })
})

describe('POST /api/appointments/walk-in — tenant ownership', () => {
  it('404s on a cross-tenant doctorId', async () => {
    const res = await request(server)
      .post('/api/appointments/walk-in')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ petId: ownPetId, doctorId: otherDoctorId })
    expect(res.status).toBe(404)
  })

  it('404s on a cross-tenant petId', async () => {
    const res = await request(server)
      .post('/api/appointments/walk-in')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ petId: otherPetId, doctorId: ownDoctorId })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to verify current behavior**

Run: `npx jest appointmentTenantOwnership --runInBand`
Expected: PASS if Task 2 already landed (checks run in task order); if run standalone before Task 2, expect FAIL (status 201 instead of 404).

- [ ] **Step 3: Run full appointment test suite to confirm no regressions**

Run: `npx jest appointment --runInBand`
Expected: PASS — all of `appointmentDoctors.test.ts`, `appointments-month.test.ts`, `appointmentTenantOwnership.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/backend/tests/integration/appointmentTenantOwnership.test.ts
git commit -m "test(appointments): cross-tenant doctorId/petId booking must 404"
```
