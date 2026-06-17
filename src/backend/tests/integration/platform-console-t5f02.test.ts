// @qa-agent — Integration tests: T-5F-02 Platform Console (usage endpoint + plane isolation)
//
// SCOPE NOTE (read before extending):
//   T-5F-02's *backend* surface that was NOT already covered by platformConsole.test.ts
//   (T-5D) or platformAudit.test.ts (T-5F PRE-3) is exactly ONE new route:
//       GET /platform/customers/:id/usage
//   Customer CRUD, suspend/reactivate auth-gate, plan CRUD + soft-retire, quota
//   resolution, the audit filters (from/to/action/tenantId), and plane isolation on
//   customers/plans/settings/audit are already exercised by those two suites. This
//   file therefore concentrates on the usage endpoint and re-asserts plane isolation
//   on it, while cross-referencing the pre-existing coverage so nothing is duplicated.
//
// ADVERSARIAL FINDINGS baked into the assertions:
//   - The task brief claimed the usage payload is `{ branches, staff, owners }` with
//     per-field `current/limit`. The ACTUAL code (usage.service.getPlatformCustomerUsage)
//     returns `{ branches, users, owners, caps, overPlan }` where branches/users/owners
//     are bare counts and `caps` holds the effective quota. Tests assert the REAL shape;
//     the brief's shape is wrong and is recorded as a gap for the dev/PM agents.
//   - There is NO `staff` key. The count field is `users`.
//
// Strategy: live DB + real platform JWT (same pattern as platformConsole.test.ts).
//   Every row created here is torn down in afterAll.

import request from 'supertest'
import { Server } from 'http'
import { PrismaClient } from '@prisma/client'
import app from '../../app'

const prisma = new PrismaClient()
let server: Server

const PLATFORM_EMAIL = process.env.PLATFORM_ADMIN_EMAIL || 'admin@anemal.co'
const PLATFORM_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin1!'

const SFX = `qaf02${Date.now().toString(36)}`

let platformToken: string
let clinicToken: string

const createdTenantIds: number[] = []
const createdPlanIds: number[] = []

async function getPlatformToken(): Promise<string> {
  const res = await request(server)
    .post('/platform/auth/login')
    .send({ email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD })
  return res.body.data?.token
}

async function getClinicToken(): Promise<string> {
  const res = await request(server)
    .post('/auth/login')
    .send({ subdomain: 'dev-clinic', email: 'admin@dev-clinic.com', password: 'AdminPass1!' })
  return res.body.data?.token
}

async function createPlan(body: Record<string, unknown>): Promise<number> {
  const res = await request(server)
    .post('/platform/plans')
    .set('Authorization', `Bearer ${platformToken}`)
    .send(body)
  const id = res.body.data.id
  createdPlanIds.push(id)
  return id
}

async function createCustomer(body: Record<string, unknown>): Promise<number> {
  const res = await request(server)
    .post('/platform/customers')
    .set('Authorization', `Bearer ${platformToken}`)
    .send(body)
  const id = res.body.data.id
  if (id) createdTenantIds.push(id)
  return id
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
  platformToken = await getPlatformToken()
  clinicToken = await getClinicToken()
})

afterAll(async () => {
  if (createdTenantIds.length) {
    // Children first to satisfy FK constraints, then the tenant rows.
    await prisma.user.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.branch.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.owner.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
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
// AC1 — POST /platform/customers requires planId (400 if missing)
//   (Re-asserted here for T-5F-02 because the Add-Customer form's planId
//    requirement is a named acceptance criterion. Validation is Zod .number().)
// ─────────────────────────────────────────────────────────────────────────────
describe('T-5F-02 / AC1 — create customer requires planId', () => {
  it('❌ POST /platform/customers WITHOUT planId → 400 VALIDATION_ERROR', async () => {
    const res = await request(server)
      .post('/platform/customers')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'QA No-Plan', subdomain: `qa-noplan-${SFX}` })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('❌ POST /platform/customers with non-numeric planId → 400', async () => {
    const res = await request(server)
      .post('/platform/customers')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'QA Bad-Plan', subdomain: `qa-badplan-${SFX}`, planId: 'abc' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC2 — GET /platform/customers/:id/usage returns counts + caps
// ─────────────────────────────────────────────────────────────────────────────
describe('T-5F-02 / AC2 — customer usage endpoint', () => {
  let planId: number
  let tenantId: number

  beforeAll(async () => {
    planId = await createPlan({
      key: `plan_${SFX}_usage`, name: 'QA Usage Plan',
      maxBranches: 3, maxUsers: 10, maxOwners: 100,
    })
    tenantId = await createCustomer({ name: 'QA Usage Tenant', subdomain: `qa-usage-${SFX}`, planId })
  })

  it('✅ fresh tenant → 200 with branches/users/owners = 0 and caps = plan defaults', async () => {
    const res = await request(server)
      .get(`/platform/customers/${tenantId}/usage`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const d = res.body.data
    // Actual shape: { branches, users, owners, caps, overPlan }
    expect(d.branches).toBe(0)
    expect(d.users).toBe(0)
    expect(d.owners).toBe(0)
    // Effective caps surfaced for the progress bars (current vs limit on the FE).
    expect(d.caps).toEqual({ maxBranches: 3, maxUsers: 10, maxOwners: 100 })
    expect(d.overPlan).toBe(false)
  })

  it('⚠️ ADVERSARIAL: payload uses `users` not `staff`, and has NO per-field current/limit', async () => {
    const res = await request(server)
      .get(`/platform/customers/${tenantId}/usage`)
      .set('Authorization', `Bearer ${platformToken}`)
    const d = res.body.data
    // The task brief expected `{ branches, staff, owners }` with current/limit — it does not exist.
    expect(d).not.toHaveProperty('staff')
    expect(d).toHaveProperty('users')
    // counts are bare numbers, not { current, limit } objects
    expect(typeof d.branches).toBe('number')
    expect(typeof d.users).toBe('number')
  })

  it('✅ counts reflect real rows: seed 2 branches, 1 user, 3 owners', async () => {
    await prisma.branch.createMany({ data: [
      { tenantId, name: 'B1', isActive: true },
      { tenantId, name: 'B2', isActive: true },
    ] })
    await prisma.user.create({ data: {
      tenantId, name: 'U1', email: `u1-${SFX}@x.test`, passwordHash: 'x', role: 'staff', isActive: true,
    } })
    await prisma.owner.createMany({ data: [
      { tenantId, firstName: 'O', lastName: '1', phone: '0810000001' },
      { tenantId, firstName: 'O', lastName: '2', phone: '0810000002' },
      { tenantId, firstName: 'O', lastName: '3', phone: '0810000003' },
    ] })

    const res = await request(server)
      .get(`/platform/customers/${tenantId}/usage`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.branches).toBe(2)
    expect(res.body.data.users).toBe(1)
    expect(res.body.data.owners).toBe(3)
    // Still within caps (3/10/100) → not over plan.
    expect(res.body.data.overPlan).toBe(false)
  })

  it('✅ overPlan=true when a count exceeds its effective cap (override maxBranches=1, have 2)', async () => {
    await request(server)
      .put(`/platform/customers/${tenantId}/quota`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ maxBranches: 1 })
    const res = await request(server)
      .get(`/platform/customers/${tenantId}/usage`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.caps.maxBranches).toBe(1) // override wins over plan default 3
    expect(res.body.data.overPlan).toBe(true)      // grandfathered over-limit flag
  })

  it('✅ override maxOwners=null CLEARS the override → caps.maxOwners falls back to plan default (100)', async () => {
    // Documented semantics (platform-plans.service.setQuotaOverride): a null field
    // value clears that override dimension back to the PLAN default — it is NOT
    // "set to unlimited". Plan maxOwners here is 100, so effective becomes 100.
    await request(server)
      .put(`/platform/customers/${tenantId}/quota`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ maxOwners: null, maxBranches: 3 })
    const res = await request(server)
      .get(`/platform/customers/${tenantId}/usage`)
      .set('Authorization', `Bearer ${platformToken}`)
    // override.maxOwners is null → effective = override(null) ?? plan(100) = 100
    expect(res.body.data.caps.maxOwners).toBe(100)
  })

  it('✅ true-unlimited owners requires the PLAN itself to have maxOwners=null (clinic_plus model)', async () => {
    // To get effective maxOwners=null (unlimited), the plan must define it as null
    // AND no positive override may exist. Verified via a dedicated plan+tenant so the
    // running tenant’s prior overrides do not interfere.
    const unlimitedPlanId = await createPlan({
      key: `plan_${SFX}_unlim`, name: 'QA Unlimited Plan', maxBranches: 1, maxUsers: 1, maxOwners: null,
    })
    const unlimitedTenantId = await createCustomer({
      name: 'QA Unlimited Tenant', subdomain: `qa-unlim-${SFX}`, planId: unlimitedPlanId,
    })
    const res = await request(server)
      .get(`/platform/customers/${unlimitedTenantId}/usage`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.body.data.caps.maxOwners).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC3 — usage endpoint error / edge handling
// ─────────────────────────────────────────────────────────────────────────────
describe('T-5F-02 / AC3 — usage endpoint edge cases', () => {
  it('❌ non-numeric :id → 400 (controller guards isNaN)', async () => {
    const res = await request(server)
      .get('/platform/customers/not-a-number/usage')
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('❌ unknown tenant id → 404 CUSTOMER_NOT_FOUND (getEffectiveQuota throws)', async () => {
    const res = await request(server)
      .get('/platform/customers/99999999/usage')
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC4 / CRITICAL — plane isolation on the usage route (clinic token → 403, no token → 401)
// ─────────────────────────────────────────────────────────────────────────────
describe('T-5F-02 / AC4 — plane isolation on usage route', () => {
  let tenantId: number

  beforeAll(async () => {
    const planId = await createPlan({ key: `plan_${SFX}_iso`, name: 'QA Iso Plan', maxBranches: 1, maxUsers: 2 })
    tenantId = await createCustomer({ name: 'QA Iso Tenant', subdomain: `qa-iso-${SFX}`, planId })
  })

  it('❌ clinic-plane JWT → GET /:id/usage → 403', async () => {
    const res = await request(server)
      .get(`/platform/customers/${tenantId}/usage`)
      .set('Authorization', `Bearer ${clinicToken}`)
    expect(res.status).toBe(403)
  })

  it('❌ no token → GET /:id/usage → 401', async () => {
    const res = await request(server).get(`/platform/customers/${tenantId}/usage`)
    expect(res.status).toBe(401)
  })

  it('❌ malformed token → GET /:id/usage → 401', async () => {
    const res = await request(server)
      .get(`/platform/customers/${tenantId}/usage`)
      .set('Authorization', 'Bearer not.a.real.token')
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC5 / CRITICAL — suspend immediately blocks that tenant's clinic session.
//   Brief flow: POST /:id/suspend → subsequent GET /auth/me with that tenant's
//   clinic token → 401 (auth.middleware TENANT_SUSPENDED gate). Uses a REAL
//   /auth/login token (not a hand-signed one) so the whole auth path is exercised.
// ─────────────────────────────────────────────────────────────────────────────
describe('T-5F-02 / AC5 — suspend blocks clinic /auth/me', () => {
  let tenantId: number
  let clinicSubdomain: string
  const clinicEmail = `owner-${SFX}@suspendme.test`
  const clinicPassword = 'SuspendPass1!'
  let liveClinicToken: string

  beforeAll(async () => {
    const planId = await createPlan({ key: `plan_${SFX}_susp`, name: 'QA Susp Plan', maxBranches: 1, maxUsers: 5 })
    clinicSubdomain = `qa-susp-${SFX}`
    tenantId = await createCustomer({ name: 'QA Suspend Tenant', subdomain: clinicSubdomain, planId })

    // Seed a real, loginable clinic admin in the new tenant.
    const bcrypt = (await import('bcrypt')).default
    const passwordHash = await bcrypt.hash(clinicPassword, 4)
    const branch = await prisma.branch.create({ data: { tenantId, name: 'Main', isActive: true } })
    await prisma.user.create({
      data: {
        tenantId, branchId: branch.id, name: 'Susp Admin',
        email: clinicEmail, passwordHash, role: 'admin', isActive: true,
      },
    })

    const login = await request(server)
      .post('/auth/login')
      .send({ subdomain: clinicSubdomain, email: clinicEmail, password: clinicPassword })
    expect(login.status).toBe(200)
    liveClinicToken = login.body.data.token
  })

  it('✅ before suspend: GET /auth/me with the clinic token → 200', async () => {
    const res = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${liveClinicToken}`)
    expect(res.status).toBe(200)
  })

  it('✅ POST /platform/customers/:id/suspend → 200, isActive=false', async () => {
    const res = await request(server)
      .post(`/platform/customers/${tenantId}/suspend`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    const row = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { isActive: true } })
    expect(row?.isActive).toBe(false)
  })

  it('❌ after suspend: GET /auth/me with same token → 401 TENANT_SUSPENDED', async () => {
    const res = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${liveClinicToken}`)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('TENANT_SUSPENDED')
  })

  it('❌ after suspend: a fresh /auth/login for that tenant is also rejected', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: clinicSubdomain, email: clinicEmail, password: clinicPassword })
    expect(res.status).toBeGreaterThanOrEqual(401)
    expect(res.status).toBeLessThan(500)
  })

  it('✅ reactivate reopens the clinic gate (GET /auth/me no longer TENANT_SUSPENDED)', async () => {
    const re = await request(server)
      .post(`/platform/customers/${tenantId}/reactivate`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(re.status).toBe(200)
    const res = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${liveClinicToken}`)
    expect(res.body.code).not.toBe('TENANT_SUSPENDED')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC6 — GET /platform/audit supports filters (from, to, action, tenantId).
//   Each platform mutation above already wrote audit rows; here we assert the
//   filter dimensions narrow the result set and that the PII `details` blob is
//   NEVER surfaced (platform-audit.repository omits it — stop-ship if present).
// ─────────────────────────────────────────────────────────────────────────────
describe('T-5F-02 / AC6 — platform audit filters', () => {
  let auditTenantId: number

  beforeAll(async () => {
    // Generate a deterministic, isolated audit trail: create + suspend a tenant.
    const planId = await createPlan({ key: `plan_${SFX}_aud`, name: 'QA Audit Plan', maxBranches: 1, maxUsers: 2 })
    auditTenantId = await createCustomer({ name: 'QA Audit Tenant', subdomain: `qa-aud-${SFX}`, planId })
    await request(server)
      .post(`/platform/customers/${auditTenantId}/suspend`)
      .set('Authorization', `Bearer ${platformToken}`)
  })

  it('✅ unfiltered → paginated envelope { items, total, page, limit }', async () => {
    const res = await request(server)
      .get('/platform/audit')
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.items)).toBe(true)
    expect(typeof res.body.data.total).toBe('number')
    expect(res.body.data.page).toBe(1)
  })

  it('✅ tenantId filter returns only rows for that target tenant', async () => {
    const res = await request(server)
      .get(`/platform/audit?tenantId=${auditTenantId}`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.items.length).toBeGreaterThan(0)
    for (const row of res.body.data.items) {
      expect(row.targetTenantId).toBe(auditTenantId)
    }
  })

  it('✅ action filter returns only matching actions (tenant.suspend)', async () => {
    const res = await request(server)
      .get(`/platform/audit?tenantId=${auditTenantId}&action=tenant.suspend`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.items.length).toBeGreaterThan(0)
    for (const row of res.body.data.items) {
      expect(row.action).toBe('tenant.suspend')
    }
  })

  it('✅ from/to date window narrows results; future window → empty', async () => {
    const future = '2999-01-01'
    const res = await request(server)
      .get(`/platform/audit?from=${future}&to=${future}`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.items.length).toBe(0)
  })

  it('✅ today window (from=to=today) includes the just-written suspend row', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const res = await request(server)
      .get(`/platform/audit?tenantId=${auditTenantId}&from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    // `to` is extended to end-of-day in the controller, so today's rows are in-window.
    expect(res.body.data.items.length).toBeGreaterThan(0)
  })

  it('🔒 CRITICAL: audit rows NEVER expose the PII `details` blob', async () => {
    const res = await request(server)
      .get(`/platform/audit?tenantId=${auditTenantId}`)
      .set('Authorization', `Bearer ${platformToken}`)
    for (const row of res.body.data.items) {
      expect(row).not.toHaveProperty('details')
    }
  })

  it('❌ clinic-plane JWT → GET /platform/audit → 403 (plane isolation)', async () => {
    const res = await request(server)
      .get('/platform/audit')
      .set('Authorization', `Bearer ${clinicToken}`)
    expect(res.status).toBe(403)
  })
})
