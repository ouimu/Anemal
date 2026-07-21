/**
 * Test Suite: sub-3.4 — Subscription status & quota enforcement (Phase 8 / T-5D-04)
 * @qa-agent | Protocol: qa-protocols.md §2 (RBAC) + §3 (edge cases)
 *
 * Quota enforcement is now DB-backed (Plan + TenantQuota tables).
 * Effective quota = tenant_quotas override ?? plan default ?? fallback (branches:1, users:5).
 * Quota exceeded → 409 QUOTA_EXCEEDED (replaces legacy 402 PLAN_LIMIT_REACHED).
 *
 * Run: npx jest --testPathPattern=subscription.test
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../app'
import prisma from '../config/db'
import { signToken } from '../config/jwt'
import bcrypt from 'bcrypt'
import { seedUserRoles, cleanupUserRoles } from '../tests/helpers/seedUserRoles'

let server: Server
let tid: number
let adminToken: string, staffToken: string
let doctorRoleId: number, staffRoleId: number
const SUB = `sub-${Date.now()}`

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })
  const hash = await bcrypt.hash('TestPass1!', 10)
  const ts = Date.now()

  // Create a starter plan with maxUsers=3 so enforcement fires at 3 active users
  const plan = await prisma.plan.upsert({
    where: { key: 'test_starter' },
    update: { maxUsers: 3, maxPets: 2 },
    create: { key: 'test_starter', name: 'Test Starter', maxBranches: 1, maxUsers: 3, maxOwners: 500, maxPets: 2 },
  })

  const t = await prisma.tenant.create({ data: { name: 'Sub Clinic', subdomain: SUB, planId: plan.id } })
  tid = t.id

  // Start with two active users (admin + staff)
  const [adminRole, staffRole, doctorRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor',       tenantId: null } }),
  ])
  staffRoleId = staffRole.id
  doctorRoleId = doctorRole.id
  const admin = await prisma.user.create({ data: { tenantId: tid, name: 'Admin', username: `sub_adm_${ts % 100000}`, email: `sub-admin-${ts}@t.local`, passwordHash: hash, roleId: adminRole.id } })
  const staff = await prisma.user.create({ data: { tenantId: tid, name: 'Staff', username: `sub_stf_${ts % 100000}`, email: `sub-staff-${ts}@t.local`, passwordHash: hash, roleId: staffRole.id } })
  adminToken = signToken({ userId: admin.id, tenantId: tid, plane: 'clinic', permSetVersion: 1, role: 'admin' })
  staffToken = signToken({ userId: staff.id, tenantId: tid, plane: 'clinic', permSetVersion: 1, role: 'staff' })

  await seedUserRoles(prisma, [
    { userId: admin.id, tenantId: tid, roleKey: 'clinic_admin' },
    { userId: staff.id, tenantId: tid, roleKey: 'clinic_staff' },
  ])
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await cleanupUserRoles(prisma, [tid])
  await prisma.pet.deleteMany({ where: { tenantId: tid } })
  await prisma.owner.deleteMany({ where: { tenantId: tid } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.tenantQuota.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
  await prisma.plan.deleteMany({ where: { key: 'test_starter' } })
})

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

describe('sub-3.4 — Subscription status & quota enforcement', () => {
  test('sub-01: admin sees quota status with effective limits', async () => {
    const res = await request(server).get('/api/subscription/status').set(auth(adminToken)).expect(200)
    expect(res.body.data.quota.maxUsers).toBe(3)
    expect(res.body.data.usage.users).toBe(2)
    expect(res.body.data.withinLimits.users).toBe(true)
  })

  test('sub-02: staff can read subscription status → 200', async () => {
    await request(server).get('/api/subscription/status').set(auth(staffToken)).expect(200)
  })

  test('sub-03: user creation blocked once quota is reached → 409 QUOTA_EXCEEDED', async () => {
    const ts = Date.now()
    // 2 active users already; plan limit is 3 → one more succeeds, the next is blocked
    await request(server).post('/users').set(auth(adminToken))
      .send({ name: 'Doc', username: `sub_doc_${ts % 100000}`, email: `sub-doc-${ts}@t.local`, password: 'TestPass1!', roleId: doctorRoleId }).expect(201)
    const res = await request(server).post('/users').set(auth(adminToken))
      .send({ name: 'Extra', username: `sub_ext_${ts % 100000}`, email: `sub-extra-${ts}@t.local`, password: 'TestPass1!', roleId: staffRoleId }).expect(409)
    expect(res.body.code).toBe('QUOTA_EXCEEDED')
    expect(res.body.details.resource).toBe('users')
    expect(res.body.details.limit).toBe(3)
  })

  test('sub-04: pet creation blocked once quota is reached → 409 QUOTA_EXCEEDED', async () => {
    // Need an owner to attach pets to
    const owner = await prisma.owner.create({ data: { tenantId: tid, firstName: 'Pet', lastName: 'Owner', phone: `0800000${Date.now() % 10000}` } })
    await prisma.pet.create({ data: { tenantId: tid, ownerId: owner.id, name: 'Pet 1', species: 'Dog', isActive: true } })
    await request(server).post('/api/pets').set(auth(adminToken))
      .send({ ownerId: owner.id, name: 'Pet 2', species: 'Cat' }).expect(201)
    const res = await request(server).post('/api/pets').set(auth(adminToken))
      .send({ ownerId: owner.id, name: 'Pet 3', species: 'Cat' }).expect(409)
    expect(res.body.code).toBe('QUOTA_EXCEEDED')
    expect(res.body.details.resource).toBe('pets')
    expect(res.body.details.limit).toBe(2)
  })

  test('sub-05: unlimited maxPets (null) never blocks pet creation', async () => {
    await prisma.plan.update({ where: { key: 'test_starter' }, data: { maxPets: null } })
    const owner = await prisma.owner.create({ data: { tenantId: tid, firstName: 'Unlimited', lastName: 'Owner', phone: `0900000${Date.now() % 10000}` } })
    await prisma.pet.create({ data: { tenantId: tid, ownerId: owner.id, name: 'P1', species: 'Dog', isActive: true } })
    await prisma.pet.create({ data: { tenantId: tid, ownerId: owner.id, name: 'P2', species: 'Dog', isActive: true } })
    await request(server).post('/api/pets').set(auth(adminToken))
      .send({ ownerId: owner.id, name: 'P3', species: 'Dog' }).expect(201)
    await prisma.plan.update({ where: { key: 'test_starter' }, data: { maxPets: 2 } }) // restore for other tests
  })
})
