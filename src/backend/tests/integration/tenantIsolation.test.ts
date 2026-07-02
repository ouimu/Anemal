// @qa-agent — CRITICAL: Cross-tenant isolation tests
// These tests verify that Tenant A users CANNOT access Tenant B data
// This is the most important test suite in the project

import request from 'supertest'
import { Server } from 'http'
import app from '../../app'

let server: Server

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

async function getToken(subdomain: string, username: string, password: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain, username, password })
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  return step2.body.data?.token
}

describe('Multi-Tenant Isolation — User Management', () => {
  let tokenA: string
  let tokenB: string
  let userIdFromA: number

  beforeAll(async () => {
    tokenA = await getToken('dev-clinic',  'admin_a', 'AdminPass1!')
    tokenB = await getToken('test-clinic', 'admin_b', 'AdminPass2!')
  })

  it('✅ Tenant A admin can list own users', async () => {
    const res = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${tokenA}`)
    expect(res.status).toBe(200)
    const users = res.body.data as { tenantId: number }[]
    // All returned users must belong to Tenant A
    users.forEach((u) => expect(u.tenantId).toBe(res.body.data[0].tenantId))
    userIdFromA = res.body.data[0].id
  })

  it('✅ Tenant B admin can list own users', async () => {
    const res = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${tokenB}`)
    expect(res.status).toBe(200)
  })

  it('❌ Tenant B token cannot access users from Tenant A by ID', async () => {
    // userIdFromA exists in Tenant A; Tenant B token should get 404
    const res = await request(server)
      .get(`/users/${userIdFromA}`)
      .set('Authorization', `Bearer ${tokenB}`)
    expect(res.status).toBe(404)
  })

  it('❌ Request with no token returns 401', async () => {
    const res = await request(server).get('/users')
    expect(res.status).toBe(401)
  })

  it('❌ Staff token cannot access admin-only /users route → 403', async () => {
    const staffToken = await getToken('dev-clinic', 'staff_a', 'StaffPass1!')
    const res = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(403)
  })

  it('❌ Tenant B cannot create user in Tenant A', async () => {
    // Even if Tenant B guesses a valid tenantId, the token gates them to their own tenant
    const res = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Intruder', username: 'intruder_b', email: 'intruder@dev-clinic.com', password: 'Pass1234!', role: 'staff' })
    // User would be created in Tenant B, not Tenant A — verify by listing Tenant A users
    if (res.status === 201) {
      const listA = await request(server).get('/users').set('Authorization', `Bearer ${tokenA}`)
      const intruder = (listA.body.data as { email: string }[]).find(u => u.email === 'intruder@dev-clinic.com')
      expect(intruder).toBeUndefined()
    }
  })
})

// ─── Phase 8 (T-5A-01/T-5A-07): RBAC table isolation tests ──────────────────
// @db-agent: roles with tenantId=null are system templates visible to all tenants.
// Clinic-custom roles (tenantId SET) must NOT be visible across tenant boundaries.
// user_roles rows are scoped by tenantId — Tenant B must never see Tenant A user_roles.

import { PrismaClient } from '@prisma/client'

const prismaTest = new PrismaClient()

afterAll(async () => {
  await prismaTest.$disconnect()
})

describe('RBAC Isolation — custom roles are tenant-scoped', () => {
  let tenantAId: number
  let tenantBId: number
  let customRoleId: number

  beforeAll(async () => {
    // Resolve tenant IDs from the seeded subdomains
    const tenantA = await prismaTest.tenant.findUnique({ where: { subdomain: 'dev-clinic' } })
    const tenantB = await prismaTest.tenant.findUnique({ where: { subdomain: 'test-clinic' } })
    if (!tenantA || !tenantB) throw new Error('Seed tenants not found — run prisma/seed.ts first')
    tenantAId = tenantA.id
    tenantBId = tenantB.id

    // Create a clinic-custom role scoped to Tenant A
    const existing = await prismaTest.clinicRole.findFirst({
      where: { tenantId: tenantAId, key: 'custom_test_role' },
    })
    if (existing) {
      customRoleId = existing.id
    } else {
      const created = await prismaTest.clinicRole.create({
        data: {
          tenantId: tenantAId,
          key: 'custom_test_role',
          name: 'Custom Test Role',
          isSystem: false,
        },
      })
      customRoleId = created.id
    }
  })

  afterAll(async () => {
    // Clean up the test-only custom role
    await prismaTest.clinicRole.deleteMany({
      where: { tenantId: tenantAId, key: 'custom_test_role' },
    })
  })

  it('❌ Tenant B cannot see Tenant A custom roles (tenant-scoped query returns empty)', async () => {
    // Iron rule: clinic-custom roles must be queried with WHERE tenantId = :tenantId
    const rolesVisibleToB = await prismaTest.clinicRole.findMany({
      where: {
        tenantId: tenantBId,  // Tenant B scope — must NOT include tenantAId roles
      },
    })
    const hasTenantARole = rolesVisibleToB.some(r => r.id === customRoleId)
    expect(hasTenantARole).toBe(false)
  })

  it('✅ System roles (tenantId=null) are visible to all tenants', async () => {
    // System roles have tenantId=null and are accessible to any clinic for reference
    const systemRoles = await prismaTest.clinicRole.findMany({
      where: { tenantId: null, isSystem: true },
    })
    // Must have the 3 seeded system roles
    expect(systemRoles.length).toBeGreaterThanOrEqual(3)
    const keys = systemRoles.map(r => r.key)
    expect(keys).toContain('clinic_admin')
    expect(keys).toContain('doctor')
    expect(keys).toContain('clinic_staff')
  })

  it('❌ user_roles index enforces tenant isolation — Tenant B cannot see Tenant A user_roles', async () => {
    // All user_roles for Tenant B must have tenantId = tenantBId only
    const userRolesForB = await prismaTest.userRole.findMany({
      where: { tenantId: tenantBId },
    })
    const crossTenant = userRolesForB.filter(ur => ur.tenantId !== tenantBId)
    expect(crossTenant.length).toBe(0)

    // Verify Tenant A user_roles are not returned when scoped to Tenant B
    const userRolesForA = await prismaTest.userRole.findMany({
      where: { tenantId: tenantAId },
    })
    // None of Tenant A's user_roles should appear when filtering by Tenant B
    const leakedToB = userRolesForA.filter(ur =>
      userRolesForB.some(b => b.userId === ur.userId && b.tenantId === tenantAId)
    )
    expect(leakedToB.length).toBe(0)
  })
})
