// Phase 8 (T-5B-00) — RBAC PRE-ENFORCEMENT REGRESSION GUARD
// @qa-agent — HARD GATE. Must be CI-green BEFORE any T-5B-01 route-enforcement PR opens.
//
// PURPOSE: document the CURRENT clinic-API access each system role enjoys, BEFORE
// requirePermission()/requirePlane() enforcement lands in 5-B. This file is purely
// observational — it adds NO middleware. The same assertions must continue to pass
// after enforcement, because every happy-path uses a clinic_admin token (broadest role),
// and admin/doctor/staff are only asserted on endpoints they reach today.
//
// PM flag F2 (pm-scope-check.md): test users are created with their `roleId` pointing to
// the seeded system ClinicRole (key + tenantId:null), not just the legacy `role` string.
// This future-proofs the tokens for T-5A-05 (JWT extension adds roleId+permVersion). If
// the system roles are not seeded in this test DB, roleId is left null — the regression
// baseline still holds because login currently mints tokens from the legacy `role` string.
// NOTE: the model is `prisma.clinicRole` (mapped to table `roles`); the task brief's
// `prisma.role` is the legacy alias — `clinicRole` is the correct Prisma client accessor.

import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'

const SUB = 'rbac-rg-guard'
const SUB2 = 'rbac-rg-guard-2'
const PASSWORD = 'TestPass1!'

let server: Server
let tid = 0
let tid2 = 0
let adminToken = ''
let doctorToken = ''
let staffToken = ''
let admin2Token = ''
let petId = 0
let pet2Id = 0

async function login(subdomain: string, username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}

// Resolve a seeded system role id by key (tenantId IS NULL). ADR-0019 made
// User.roleId NOT NULL, so every fixture user needs a real id — the system
// roles are always seeded by jest-global-setup.js, so this throws (rather
// than falling back to null) if that invariant is ever broken.
async function systemRoleId(key: string): Promise<number> {
  const role = await prisma.clinicRole.findFirstOrThrow({ where: { key, tenantId: null } })
  return role.id
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const t = await prisma.tenant.create({ data: { name: 'RBAC RG Guard', subdomain: SUB } })
  const t2 = await prisma.tenant.create({ data: { name: 'RBAC RG Guard 2', subdomain: SUB2 } })
  tid = t.id
  tid2 = t2.id

  // Each tenant needs an active branch — inventory endpoints are branch-scoped and the
  // user's token carries branchId (set from user.branchId at login).
  const branch1 = await prisma.branch.create({ data: { tenantId: tid, name: 'RG Main' } })
  const branch2 = await prisma.branch.create({ data: { tenantId: tid2, name: 'RG2 Main' } })

  // F2: link test users to seeded system roles where available.
  const adminRoleId = await systemRoleId('clinic_admin')
  const doctorRoleId = await systemRoleId('doctor')
  const staffRoleId = await systemRoleId('clinic_staff')

  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  await prisma.user.createMany({
    data: [
      { tenantId: tid,  branchId: branch1.id, name: 'Admin RG',  username: 'admin_rg',  email: 'admin@rg.test',  passwordHash, roleId: adminRoleId },
      { tenantId: tid,  branchId: branch1.id, name: 'Doctor RG', username: 'doctor_rg', email: 'doctor@rg.test', passwordHash, roleId: doctorRoleId },
      { tenantId: tid,  branchId: branch1.id, name: 'Staff RG',  username: 'staff_rg',  email: 'staff@rg.test',  passwordHash, roleId: staffRoleId },
      { tenantId: tid2, branchId: branch2.id, name: 'Admin RG2', username: 'admin_rg2', email: 'admin@rg2.test', passwordHash, roleId: adminRoleId },
    ],
  })

  // Create UserRole join-table rows — required for resolvePermissions to return non-empty set
  // after requirePermission() enforcement lands. Without these rows every request 403s.
  const [adminRole, doctorRole, staffRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor',       tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
  ])
  const [uAdmin, uDoctor, uStaff, uAdmin2] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { tenantId: tid,  username: 'admin_rg'  } }),
    prisma.user.findFirstOrThrow({ where: { tenantId: tid,  username: 'doctor_rg' } }),
    prisma.user.findFirstOrThrow({ where: { tenantId: tid,  username: 'staff_rg'  } }),
    prisma.user.findFirstOrThrow({ where: { tenantId: tid2, username: 'admin_rg2' } }),
  ])
  await prisma.userRole.createMany({
    data: [
      { userId: uAdmin.id,  roleId: adminRole.id,  tenantId: tid  },
      { userId: uDoctor.id, roleId: doctorRole.id, tenantId: tid  },
      { userId: uStaff.id,  roleId: staffRole.id,  tenantId: tid  },
      { userId: uAdmin2.id, roleId: adminRole.id,  tenantId: tid2 },
    ],
    skipDuplicates: true,
  })

  await prisma.userBranch.createMany({
    data: [
      { tenantId: tid, userId: uDoctor.id, branchId: branch1.id },
      { tenantId: tid, userId: uStaff.id,  branchId: branch1.id },
    ],
    skipDuplicates: true,
  })

  adminToken  = await login(SUB,  'admin_rg')
  doctorToken = await login(SUB,  'doctor_rg')
  staffToken  = await login(SUB,  'staff_rg')
  admin2Token = await login(SUB2, 'admin_rg2')

  // Seed one owner+pet per tenant via the API (so EMR list has a valid petId and the
  // isolation test has at least one own-tenant pet to compare). Uses admin tokens.
  petId = await seedPet(adminToken)
  pet2Id = await seedPet(admin2Token)
})

async function seedPet(token: string): Promise<number> {
  const ownerRes = await request(server)
    .post('/api/owners')
    .set('Authorization', `Bearer ${token}`)
    .send({ firstName: 'RG', lastName: 'Owner', phone: '02-000-0000' })
  expect(ownerRes.status).toBe(201)
  const ownerId = ownerRes.body.data.id

  const petRes = await request(server)
    .post('/api/pets')
    .set('Authorization', `Bearer ${token}`)
    .send({ ownerId, name: 'RG Pet', species: 'dog' })
  expect(petRes.status).toBe(201)
  return petRes.body.data.id
}

afterAll(async () => {
  await prisma.userRole.deleteMany({ where: { tenantId: { in: [tid, tid2] } } })
  await prisma.user.deleteMany({ where: { tenantId: { in: [tid, tid2] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tid, tid2] } } })
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30000)

// Some endpoints return 404 when their collection is empty / requires a sub-resource id.
// We accept that as "reachable & authorized" for the pre-enforcement baseline.
const REACHABLE = [200, 404]

describe('Auth baseline — unauthenticated requests rejected', () => {
  it('no token → 401', async () => {
    const res = await request(server).get('/api/pets')
    expect(res.status).toBe(401)
  })

  it('invalid/garbage token → 401', async () => {
    const res = await request(server).get('/api/pets').set('Authorization', 'Bearer not-a-real-token')
    expect(res.status).toBe(401)
  })
})

describe('Pets — admin/doctor/staff can list', () => {
  it.each([
    ['admin', () => adminToken],
    ['doctor', () => doctorToken],
    ['staff', () => staffToken],
  ])('%s GET /api/pets → 200', async (_role, getTok) => {
    const res = await request(server).get('/api/pets').set('Authorization', `Bearer ${getTok()}`)
    expect(res.status).toBe(200)
  })
})

describe('Appointments — admin/doctor/staff can list', () => {
  it.each([
    ['admin', () => adminToken],
    ['doctor', () => doctorToken],
    ['staff', () => staffToken],
  ])('%s GET /api/appointments → 200', async (_role, getTok) => {
    const res = await request(server).get('/api/appointments').set('Authorization', `Bearer ${getTok()}`)
    expect(res.status).toBe(200)
  })
})

describe('EMR — admin/doctor can list medical records for a pet', () => {
  // GET /api/medical-records requires a petId query param (else 400 validation).
  // Baseline: with a valid own-tenant petId the endpoint is reachable & authorized.
  it.each([
    ['admin', () => adminToken],
    ['doctor', () => doctorToken],
  ])('%s GET /api/medical-records?petId=... → 200|404', async (_role, getTok) => {
    const res = await request(server)
      .get(`/api/medical-records?petId=${petId}`)
      .set('Authorization', `Bearer ${getTok()}`)
    expect(REACHABLE).toContain(res.status)
  })
})

describe('Inventory — admin/staff can list products', () => {
  it.each([
    ['admin', () => adminToken],
    ['staff', () => staffToken],
  ])('%s GET /api/products → 200', async (_role, getTok) => {
    const res = await request(server).get('/api/products').set('Authorization', `Bearer ${getTok()}`)
    expect(res.status).toBe(200)
  })
})

describe('Billing — admin can list invoices', () => {
  it('admin GET /api/invoices → 200', async () => {
    const res = await request(server).get('/api/invoices').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
  })
})

describe('Settings — admin can read clinic settings', () => {
  it('admin GET /api/settings/clinic → 200', async () => {
    const res = await request(server).get('/api/settings/clinic').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.tenantId).toBe(tid)
  })
})

describe('Tenant isolation — two tenants return non-overlapping pet lists', () => {
  it('tenant 1 and tenant 2 admins each see only their own pets', async () => {
    const r1 = await request(server).get('/api/pets').set('Authorization', `Bearer ${adminToken}`)
    const r2 = await request(server).get('/api/pets').set('Authorization', `Bearer ${admin2Token}`)
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)

    // listPets returns { pets, total, page, limit }
    const ids1: number[] = (r1.body.data.pets ?? []).map((p: { id: number }) => p.id)
    const ids2: number[] = (r2.body.data.pets ?? []).map((p: { id: number }) => p.id)

    // Each tenant sees its own seeded pet, never the other's.
    expect(ids1).toContain(petId)
    expect(ids1).not.toContain(pet2Id)
    expect(ids2).toContain(pet2Id)
    expect(ids2).not.toContain(petId)

    const overlap = ids1.filter(id => ids2.includes(id))
    expect(overlap).toHaveLength(0)
  })

  it('tenant 2 admin reading clinic settings sees only its own tenantId', async () => {
    const res = await request(server).get('/api/settings/clinic').set('Authorization', `Bearer ${admin2Token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.tenantId).toBe(tid2)
  })
})
