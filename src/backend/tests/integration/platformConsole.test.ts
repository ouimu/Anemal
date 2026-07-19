// @qa-agent — Integration tests: Phase 8 (T-5D-02/03/04) Platform Console
//
// Covers:
//   T-5D-02  Customer (tenant) management API — /platform/customers/*
//   T-5D-03  Plan + quota APIs               — /platform/plans/*, /:id/quota
//   T-5D-04  Quota enforcement               — branch/owner/user create → 409
//   Plane isolation (clinic vs platform) and the TENANT_SUSPENDED auth gate.
//
// Strategy (adversarial, deterministic):
//   - All platform routes are exercised over HTTP with a real platform JWT.
//   - Quota ENFORCEMENT is verified through the service layer against a
//     throwaway tenant whose quota override is set via the platform API.
//     Driving the full clinic create-flow for a brand-new tenant is impossible
//     (it has no users/roles to mint a clinic token), so we assert the guard
//     functions directly — they are the security boundary the routes call.
//   - Every row created by this suite is torn down in afterAll.

import request from 'supertest'
import { Server } from 'http'
import { PrismaClient } from '@prisma/client'
import app from '../../app'
import * as subscriptionService from '../../services/subscription.service'
import * as branchService from '../../services/branch.service'
import * as ownerService from '../../services/owner.service'
import { getTenantWithPlanAndQuota } from '../../models/platform-customers.repository'

const prisma = new PrismaClient()
let server: Server

const PLATFORM_EMAIL = process.env.PLATFORM_ADMIN_EMAIL || 'admin@anemal.app'
const PLATFORM_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin1!'

// Unique-ish suffix so re-runs don't collide on subdomain/key unique constraints.
const SFX = `qa${Date.now().toString(36)}`

let platformToken: string
let clinicToken: string

// Track created rows for cleanup.
const createdTenantIds: number[] = []
const createdPlanIds: number[] = []

async function getPlatformToken(): Promise<string> {
  const res = await request(server)
    .post('/platform/auth/login')
    .send({ email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD })
  return res.body.data?.token
}

async function getClinicToken(): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain: 'dev-clinic', username: 'admin_a', password: 'AdminPass1!' })
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  return step2.body.data?.token
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
  platformToken = await getPlatformToken()
  clinicToken = await getClinicToken()
})

afterAll(async () => {
  // Clean up quota overrides, provisioning rows, tenants, and plans created by this suite.
  if (createdTenantIds.length) {
    // CO-1 (ADR-0015): createCustomer() now auto-creates a clinic_admin user +
    // user_roles row per tenant; user_roles.tenantId has no cascade delete, so
    // it must be cleared before the tenant row itself is removed.
    await prisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.tenantQuota.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.tenantProvisioning.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.platformAuditLog.deleteMany({ where: { targetTenantId: { in: createdTenantIds } } })
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } })
  }
  if (createdPlanIds.length) {
    await prisma.plan.deleteMany({ where: { id: { in: createdPlanIds } } })
  }
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

// ─────────────────────────────────────────────────────────────────────────────
// Plane isolation (CRITICAL)
// ─────────────────────────────────────────────────────────────────────────────
describe('Plane isolation', () => {
  it('❌ clinic-plane JWT → GET /platform/customers → 403', async () => {
    const res = await request(server)
      .get('/platform/customers')
      .set('Authorization', `Bearer ${clinicToken}`)
    expect(res.status).toBe(403)
  })

  it('❌ platform JWT → GET /users (clinic route) → 403', async () => {
    const res = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(403)
  })

  it('❌ no token → GET /platform/customers → 401', async () => {
    const res = await request(server).get('/platform/customers')
    expect(res.status).toBe(401)
  })

  it('❌ platform JWT → GET /api/branches (clinic route) → 403', async () => {
    const res = await request(server)
      .get('/api/branches')
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-5D-03 Plan management (defined first — customer tests depend on a plan)
// ─────────────────────────────────────────────────────────────────────────────
describe('T-5D-03 Plan management', () => {
  let createdPlanId: number

  it('✅ GET /platform/plans returns an array', async () => {
    const res = await request(server)
      .get('/platform/plans')
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('✅ POST /platform/plans creates a plan with quota fields → 201', async () => {
    const res = await request(server)
      .post('/platform/plans')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        key: `plan_${SFX}_a`,
        name: 'QA Plan A',
        priceMonth: 19,
        maxBranches: 1,
        maxUsers: 3,
        maxOwners: 100,
      })
    expect(res.status).toBe(201)
    expect(res.body.data.id).toBeDefined()
    expect(res.body.data.maxUsers).toBe(3)
    createdPlanId = res.body.data.id
    createdPlanIds.push(createdPlanId)
  })

  it('✅ PUT /platform/plans/:id updates the plan', async () => {
    const res = await request(server)
      .put(`/platform/plans/${createdPlanId}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'QA Plan A (renamed)', maxUsers: 5 })
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('QA Plan A (renamed)')
    expect(res.body.data.maxUsers).toBe(5)
  })

  it('✅ DELETE /platform/plans/:id with NO tenant assigned → 200, isRetired=true', async () => {
    // Fresh plan with no tenants assigned.
    const create = await request(server)
      .post('/platform/plans')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ key: `plan_${SFX}_retire`, name: 'QA Retire Plan', maxBranches: 1, maxUsers: 2 })
    const retireId = create.body.data.id
    createdPlanIds.push(retireId)

    const res = await request(server)
      .delete(`/platform/plans/${retireId}`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    // Service normalizes: isActive=false → isRetired=true
    expect(res.body.data.isRetired).toBe(true)
  })

  it('❌ DELETE /platform/plans/:id with a tenant assigned → 409 PLAN_IN_USE', async () => {
    // Plan with a tenant pointed at it.
    const planRes = await request(server)
      .post('/platform/plans')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ key: `plan_${SFX}_inuse`, name: 'QA In-Use Plan', maxBranches: 1, maxUsers: 2 })
    const planId = planRes.body.data.id
    createdPlanIds.push(planId)

    const tenantRes = await request(server)
      .post('/platform/customers')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'QA InUse Tenant', subdomain: `qa-inuse-${SFX}`, planId })
    createdTenantIds.push(tenantRes.body.data.id)

    const res = await request(server)
      .delete(`/platform/plans/${planId}`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('PLAN_IN_USE')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-5D-02 Customer (tenant) management
// ─────────────────────────────────────────────────────────────────────────────
describe('T-5D-02 Customer management', () => {
  let planId: number
  let customerId: number

  beforeAll(async () => {
    const planRes = await request(server)
      .post('/platform/plans')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ key: `plan_${SFX}_cust`, name: 'QA Customer Plan', maxBranches: 2, maxUsers: 3, maxOwners: 50 })
    planId = planRes.body.data.id
    createdPlanIds.push(planId)
  })

  it('✅ GET /platform/customers returns array with at least one tenant', async () => {
    const res = await request(server)
      .get('/platform/customers')
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThanOrEqual(1)
  })

  it('✅ POST /platform/customers with valid body → 201, plan assigned', async () => {
    const res = await request(server)
      .post('/platform/customers')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'QA Customer One', subdomain: `qa-cust-${SFX}`, planId })
    expect(res.status).toBe(201)
    expect(res.body.data.id).toBeDefined()
    expect(res.body.data.planId).toBe(planId)
    customerId = res.body.data.id
    createdTenantIds.push(customerId)
  })

  it('❌ POST /platform/customers with duplicate subdomain → 409', async () => {
    const res = await request(server)
      .post('/platform/customers')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'QA Dup', subdomain: `qa-cust-${SFX}`, planId })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('SUBDOMAIN_CONFLICT')
  })

  it('✅ GET /platform/customers/:id returns tenant with flat quota fields', async () => {
    const res = await request(server)
      .get(`/platform/customers/${customerId}`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(customerId)
    // Service normalizes to flat CustomerDetail shape (no nested plan object)
    expect(res.body.data.maxUsers).toBe(3)
    expect(res.body.data.planName).toBeDefined()
  })

  it('pc-maxpets-01: getTenantWithPlanAndQuota includes maxPets from plan and override', async () => {
    const row = await getTenantWithPlanAndQuota(customerId)
    expect(row).not.toBeNull()
    expect(row!.plan).toHaveProperty('maxPets')
    expect(typeof row!.plan!.maxPets === 'number' || row!.plan!.maxPets === null).toBe(true)
    if (row!.quota) {
      expect(row!.quota).toHaveProperty('maxPets')
      expect(typeof row!.quota.maxPets === 'number' || row!.quota.maxPets === null).toBe(true)
    }
  })

  it('✅ PUT /platform/customers/:id updates name and subdomain', async () => {
    const newSub = `qa-cust-${SFX}-renamed`
    const res = await request(server)
      .put(`/platform/customers/${customerId}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'QA Customer One (renamed)', subdomain: newSub })
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('QA Customer One (renamed)')
    expect(res.body.data.subdomain).toBe(newSub)
  })

  it('✅ POST /:id/suspend → 200, isActive=false, audit log written', async () => {
    const res = await request(server)
      .post(`/platform/customers/${customerId}/suspend`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.isActive).toBe(false)

    const log = await prisma.platformAuditLog.findFirst({
      where: { targetTenantId: customerId, action: 'tenant.suspend' },
    })
    expect(log).toBeTruthy()
  })

  it('❌ after suspend: clinic-plane request for that tenant → 401 TENANT_SUSPENDED', async () => {
    // Mint a clinic token whose tenantId points at the suspended tenant.
    // The tenant has no users, so we forge a token via the same signer the app uses.
    const { signToken } = await import('../../config/jwt')
    const suspendedToken = signToken({
      userId: 999999,
      tenantId: customerId,
      branchId: 0,
      plane: 'clinic',
      permSetVersion: 1,
      role: 'admin',
    })

    const res = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${suspendedToken}`)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('TENANT_SUSPENDED')
  })

  it('✅ POST /:id/reactivate → 200, isActive=true, audit log written, clinic gate reopens', async () => {
    const res = await request(server)
      .post(`/platform/customers/${customerId}/reactivate`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.isActive).toBe(true)

    const log = await prisma.platformAuditLog.findFirst({
      where: { targetTenantId: customerId, action: 'tenant.reactivate' },
    })
    expect(log).toBeTruthy()

    // The auth gate must no longer reject this tenant's clinic token with TENANT_SUSPENDED.
    const { signToken } = await import('../../config/jwt')
    const tok = signToken({
      userId: 999999, tenantId: customerId, branchId: 0, plane: 'clinic', permSetVersion: 1, role: 'admin',
    })
    const after = await request(server).get('/users').set('Authorization', `Bearer ${tok}`)
    // Not TENANT_SUSPENDED anymore (will be 403 on permission, but the tenant gate passed).
    expect(after.body.code).not.toBe('TENANT_SUSPENDED')
  })

  it('✅ GET /:id/quota shows plan defaults when no override', async () => {
    const res = await request(server)
      .get(`/platform/customers/${customerId}/quota`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.plan.maxUsers).toBe(3)
    expect(res.body.data.override).toBeNull()
    expect(res.body.data.effective.maxUsers).toBe(3)
  })

  it('✅ PUT /:id/quota sets override; subsequent GET reflects override values', async () => {
    const put = await request(server)
      .put(`/platform/customers/${customerId}/quota`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ maxUsers: 10 })
    expect(put.status).toBe(200)

    const get = await request(server)
      .get(`/platform/customers/${customerId}/quota`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(get.status).toBe(200)
    expect(get.body.data.override.maxUsers).toBe(10)
    expect(get.body.data.effective.maxUsers).toBe(10) // override wins over plan default 3
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-5D-03 Effective-quota resolution semantics (override ?? plan ?? null)
// ─────────────────────────────────────────────────────────────────────────────
describe('T-5D-03 Effective quota resolution', () => {
  let planId: number
  let tenantId: number

  beforeAll(async () => {
    // Plan: maxUsers=3, maxOwners=null (unlimited)
    const planRes = await request(server)
      .post('/platform/plans')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ key: `plan_${SFX}_eff`, name: 'QA Eff Plan', maxBranches: 1, maxUsers: 3, maxOwners: null })
    planId = planRes.body.data.id
    createdPlanIds.push(planId)

    const tRes = await request(server)
      .post('/platform/customers')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'QA Eff Tenant', subdomain: `qa-eff-${SFX}`, planId })
    tenantId = tRes.body.data.id
    createdTenantIds.push(tenantId)
  })

  it('✅ override maxUsers=10 over plan maxUsers=3 → effective=10', async () => {
    await request(server)
      .put(`/platform/customers/${tenantId}/quota`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ maxUsers: 10 })
    const res = await request(server)
      .get(`/platform/customers/${tenantId}/quota`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.body.data.effective.maxUsers).toBe(10)
  })

  it('✅ no override on maxBranches → effective falls back to plan default (1)', async () => {
    const res = await request(server)
      .get(`/platform/customers/${tenantId}/quota`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.body.data.effective.maxBranches).toBe(1)
  })

  it('✅ plan maxOwners=null + no owner override → effective maxOwners=null (unlimited)', async () => {
    const res = await request(server)
      .get(`/platform/customers/${tenantId}/quota`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.body.data.effective.maxOwners).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-5D-04 Quota enforcement (service-layer guards — the boundary the routes call)
// ─────────────────────────────────────────────────────────────────────────────
describe('T-5D-04 Quota enforcement', () => {
  let planId: number
  let tenantId: number

  beforeAll(async () => {
    // Plan with tight limits. maxUsers=4 (not 2): CO-1 (ADR-0015) now auto-creates
    // one real clinic_admin user per tenant at POST /platform/customers time, and
    // this block's own fixture adds one more ('QA User 1') — headroom keeps the
    // "unlimited override" assertion below meaningful instead of a coincidental pass.
    const planRes = await request(server)
      .post('/platform/plans')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ key: `plan_${SFX}_quota`, name: 'QA Quota Plan', maxBranches: 1, maxUsers: 4, maxOwners: 1 })
    planId = planRes.body.data.id
    createdPlanIds.push(planId)

    const tRes = await request(server)
      .post('/platform/customers')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'QA Quota Tenant', subdomain: `qa-quota-${SFX}`, planId })
    tenantId = tRes.body.data.id
    createdTenantIds.push(tenantId)
  })

  // Set a quota override via the platform API and assert the write succeeds.
  // NOTE: the PUT /:id/quota schema uses .positive(), so 0 is NOT a valid override
  // (covered separately below). All overrides here are positive.
  async function setOverride(body: Record<string, number | null>): Promise<void> {
    const res = await request(server)
      .put(`/platform/customers/${tenantId}/quota`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send(body)
    if (res.status !== 200) {
      throw new Error(`setOverride failed: ${res.status} ${JSON.stringify(res.body)}`)
    }
  }

  it('❌ users at limit → assertCanAddUser throws 409 QUOTA_EXCEEDED resource=users', async () => {
    // Seed one active user so current(1) >= limit(1) → next add blocked.
    await prisma.user.create({
      data: {
        tenantId, name: 'QA User 1', username: `qa_user1_${SFX}`, email: `qa-user-1-${SFX}@x.test`,
        passwordHash: 'x', role: 'staff', isActive: true,
      },
    })
    await setOverride({ maxUsers: 1 })
    await expect(subscriptionService.assertCanAddUser(tenantId)).rejects.toMatchObject({
      statusCode: 409,
      code: 'QUOTA_EXCEEDED',
      resource: 'users',
      limit: 1,
    })
  })

  it('❌ branch at limit → branchService.createBranch throws 409 resource=branches', async () => {
    // Seed one active branch so current(1) >= limit(1) → next create blocked.
    await prisma.branch.create({ data: { tenantId, name: 'QA Existing Branch', isActive: true } })
    await setOverride({ maxBranches: 1 })
    await expect(
      branchService.createBranch(tenantId, { name: 'QA Branch' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'QUOTA_EXCEEDED', resource: 'branches', limit: 1 })
  })

  it('❌ owner at limit → ownerService.createOwner throws 409 resource=owners', async () => {
    // Seed one owner so current(1) >= limit(1) → next create blocked.
    await prisma.owner.create({ data: { tenantId, firstName: 'QA', lastName: 'Existing', phone: '0810000000' } })
    await setOverride({ maxOwners: 1 })
    await expect(
      ownerService.createOwner(tenantId, { firstName: 'QA', lastName: 'Owner', phone: '0800000000' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'QUOTA_EXCEEDED', resource: 'owners', limit: 1 })
  })

  it('✅ override maxUsers=null (unlimited) → assertCanAddUser passes even though plan caps at 4', async () => {
    await setOverride({ maxUsers: null })
    await expect(subscriptionService.assertCanAddUser(tenantId)).resolves.toBeUndefined()
  })

  it('❌ maxUsers=0 (boundary): write a 0 limit directly, first add blocked immediately', async () => {
    // The platform API rejects maxUsers=0 (Zod .positive()) — see API-gap test below.
    // We write the 0 override directly to exercise the enforcement boundary current(0) >= limit(0).
    // Use a dedicated tenant with zero users to make current === 0 explicit.
    const t = await prisma.tenant.create({ data: { name: 'QA Zero Tenant', subdomain: `qa-zero-${SFX}` } })
    createdTenantIds.push(t.id)
    await prisma.tenantQuota.create({ data: { tenantId: t.id, maxUsers: 0, updatedById: null } })
    await expect(subscriptionService.assertCanAddUser(t.id)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
      limit: 0,
      current: 0,
    })
  })

  it('⚠️ API gap: PUT /:id/quota with maxUsers=0 is rejected (400) — 0 limits unrepresentable via API', async () => {
    const res = await request(server)
      .put(`/platform/customers/${tenantId}/quota`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ maxUsers: 0 })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-5D-05 Per-tenant provisioning (S3/SMTP/SMS/LINE) — secret masking, plane
// isolation, settings route rename. PII MUST NOT leak: secrets are masked on
// every response; plaintext is never returned.
//
// Verified service behavior (against the code under test):
//   - GET /:id/provisioning on a tenant with NO row → 404 (controller returns
//     {success:false} when service yields null; service does NOT auto-create).
//   - maskSecret() does NOT return the literal '••••' for non-trivial secrets;
//     it returns '••••••••' + last4. So 'test-key-123' → '••••••••-123'.
//     Tests therefore assert (a) plaintext NEVER returned and (b) a mask prefix
//     is present — not an exact-equals on '••••'.
// ─────────────────────────────────────────────────────────────────────────────
describe('T-5D-05 Provisioning endpoints', () => {
  let tenantId: number

  beforeAll(async () => {
    const planRes = await request(server)
      .post('/platform/plans')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ key: `plan_prov_${SFX}`, name: 'QA Prov Plan', maxBranches: 1, maxUsers: 5 })
    const planId = planRes.body.data.id
    createdPlanIds.push(planId)

    const tRes = await request(server)
      .post('/platform/customers')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'QA Provisioning Tenant', subdomain: `qa-prov-${SFX}`, planId })
    tenantId = tRes.body.data.id
    createdTenantIds.push(tenantId)
  })

  it('✅ GET /:id/provisioning on a fresh tenant (no row) → 404', async () => {
    const res = await request(server)
      .get(`/platform/customers/${tenantId}/provisioning`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })

  it('✅ PUT /:id/provisioning with S3 fields → 200, non-secret fields returned as-is', async () => {
    const res = await request(server)
      .put(`/platform/customers/${tenantId}/provisioning`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ s3Bucket: 'qa-bucket', s3Prefix: 'qa/prefix', s3Region: 'ap-southeast-1' })
    expect(res.status).toBe(200)
    expect(res.body.data.s3Bucket).toBe('qa-bucket')
    expect(res.body.data.s3Prefix).toBe('qa/prefix')
    expect(res.body.data.s3Region).toBe('ap-southeast-1')
  })

  it('✅ PUT with secret baseSmsApiKey → 200, response is MASKED (plaintext never returned)', async () => {
    const plaintext = 'test-key-123'
    const res = await request(server)
      .put(`/platform/customers/${tenantId}/provisioning`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ baseSmsApiKey: plaintext })
    expect(res.status).toBe(200)
    // Plaintext MUST NOT appear in the response.
    expect(res.body.data.baseSmsApiKey).not.toBe(plaintext)
    // A mask prefix is present (maskSecret → '••••••••'+last4).
    expect(res.body.data.baseSmsApiKey).toMatch(/^•+/)
    // And it is not the encrypted ciphertext either (ciphertext has no mask char).
    expect(res.body.data.baseSmsApiKey).toContain('••••')
  })

  it('✅ GET after PUT with secret → still masked, confirming plaintext never returned', async () => {
    const res = await request(server)
      .get(`/platform/customers/${tenantId}/provisioning`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.baseSmsApiKey).not.toBe('test-key-123')
    expect(res.body.data.baseSmsApiKey).toMatch(/^•+/)
  })

  it('✅ PUT then GET → non-secret fields (s3*) roundtrip correctly', async () => {
    await request(server)
      .put(`/platform/customers/${tenantId}/provisioning`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ s3Bucket: 'roundtrip-bucket', smtpHost: 'smtp.example.test', smtpPort: 587, smtpUser: 'mailer' })
    const res = await request(server)
      .get(`/platform/customers/${tenantId}/provisioning`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.s3Bucket).toBe('roundtrip-bucket')
    expect(res.body.data.smtpHost).toBe('smtp.example.test')
    expect(res.body.data.smtpPort).toBe(587)
    expect(res.body.data.smtpUser).toBe('mailer')
    // Earlier-written S3 fields are not clobbered by the partial update above.
    expect(res.body.data.s3Region).toBe('ap-southeast-1')
  })

  it('❌ clinic-plane token → GET /:id/provisioning → 403 (plane isolation)', async () => {
    const res = await request(server)
      .get(`/platform/customers/${tenantId}/provisioning`)
      .set('Authorization', `Bearer ${clinicToken}`)
    expect(res.status).toBe(403)
  })

  it('❌ clinic-plane token → PUT /:id/provisioning → 403 (plane isolation, write path)', async () => {
    const res = await request(server)
      .put(`/platform/customers/${tenantId}/provisioning`)
      .set('Authorization', `Bearer ${clinicToken}`)
      .send({ s3Bucket: 'evil' })
    expect(res.status).toBe(403)
  })

  it('✅ audit log: PUT writes a platform_audit_logs row action=provisioning.update', async () => {
    // Trigger a fresh update to guarantee at least one row for this tenant.
    await request(server)
      .put(`/platform/customers/${tenantId}/provisioning`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ baseSmsProvider: 'twilio' })
    const log = await prisma.platformAuditLog.findFirst({
      where: { targetTenantId: tenantId, action: 'provisioning.update' },
    })
    expect(log).toBeTruthy()
    expect(log?.action).toBe('provisioning.update')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-5D-05 Settings route rename: /admin/system-settings → /platform/settings
// ─────────────────────────────────────────────────────────────────────────────
describe('T-5D-05 Settings route rename', () => {
  it('✅ GET /platform/settings with platform token → 200 (renamed route mounted)', async () => {
    const res = await request(server)
      .get('/platform/settings')
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('❌ GET /admin/system-settings with platform token → 404 (old mount removed)', async () => {
    const res = await request(server)
      .get('/admin/system-settings')
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PRE-6: Audit log coverage — customer create/update and plan CRUD
// ─────────────────────────────────────────────────────────────────────────────
describe('PRE-6 Audit log coverage', () => {
  let auditCustomerId: number
  let auditPlanId: number
  let auditSetupPlanId: number

  beforeAll(async () => {
    const planRes = await request(server)
      .post('/platform/plans')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ key: `plan_auditsetup_${SFX}`, name: 'QA Audit Setup Plan', maxBranches: 1, maxUsers: 5 })
    auditSetupPlanId = planRes.body.data.id
    createdPlanIds.push(auditSetupPlanId)
  })

  it('✅ audit log written on customer create (action=customer.create)', async () => {
    const res = await request(server)
      .post('/platform/customers')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'QA Audit Customer', subdomain: `qa-audit-${SFX}`, planId: auditSetupPlanId })
    expect(res.status).toBe(201)
    auditCustomerId = res.body.data.id
    createdTenantIds.push(auditCustomerId)

    const log = await prisma.platformAuditLog.findFirst({
      where: { targetTenantId: auditCustomerId, action: 'customer.create' },
    })
    expect(log).toBeTruthy()
  })

  it('✅ audit log written on customer update (action=customer.update)', async () => {
    const res = await request(server)
      .put(`/platform/customers/${auditCustomerId}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'QA Audit Customer (updated)' })
    expect(res.status).toBe(200)

    const log = await prisma.platformAuditLog.findFirst({
      where: { targetTenantId: auditCustomerId, action: 'customer.update' },
    })
    expect(log).toBeTruthy()
  })

  it('✅ audit log written on plan create (action=plan.create)', async () => {
    const res = await request(server)
      .post('/platform/plans')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ key: `plan_audit_${SFX}`, name: 'QA Audit Plan', maxBranches: 1, maxUsers: 1 })
    expect(res.status).toBe(201)
    auditPlanId = res.body.data.id
    createdPlanIds.push(auditPlanId)

    const log = await prisma.platformAuditLog.findFirst({
      where: { action: 'plan.create', details: { path: ['planId'], equals: auditPlanId } },
    })
    expect(log).toBeTruthy()
  })

  it('✅ audit log written on plan update (action=plan.update)', async () => {
    const res = await request(server)
      .put(`/platform/plans/${auditPlanId}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'QA Audit Plan (updated)' })
    expect(res.status).toBe(200)

    const log = await prisma.platformAuditLog.findFirst({
      where: { action: 'plan.update', details: { path: ['planId'], equals: auditPlanId } },
    })
    expect(log).toBeTruthy()
  })

  it('✅ audit log written on plan retire (action=plan.delete)', async () => {
    const res = await request(server)
      .delete(`/platform/plans/${auditPlanId}`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)

    const log = await prisma.platformAuditLog.findFirst({
      where: { action: 'plan.delete', details: { path: ['planId'], equals: auditPlanId } },
    })
    expect(log).toBeTruthy()
    // Remove from cleanup since it's already retired (isActive=false, still exists as a row).
    // The afterAll plan cleanup targets the plan row itself which still exists.
  })
})
