/**
 * @qa-agent — Regression suite for the Codex security review fixes on
 * `fix/codex-review-critical-high`. Each describe block maps 1:1 to a finding ID.
 *
 *   CR-01  cross-tenant FK injection on invoice / hospitalization / grooming /
 *          medical-record write paths (the fix added tenant-scoped FK guards inside
 *          the write transaction).
 *   HI-01  a branch-scoped JWT must beat a client-supplied `?branchId=` query param.
 *   HI-03  a `scope: 'branch_select'` pending token must not work as an API token.
 *   HI-04  two concurrent refreshes of the same token must yield exactly one 200.
 *
 * These paths had no regression coverage before this suite — the review's fixes were
 * verified only by reading the diff.
 */
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'

const SUB_A = `codex-reg-a-${Date.now()}`
const SUB_B = `codex-reg-b-${Date.now()}`
const PASSWORD = 'TestPass1!'

let server: Server

// Tenant A
let tidA = 0
let branchA1 = 0
let branchA2 = 0
let adminTokenA = ''      // tenant-wide (branchId null)
let branchStaffTokenA = '' // scoped to branchA1
let doctorAId = 0
let petA = 0
let invoiceA1 = 0 // invoice living in branchA1
let invoiceA2 = 0 // invoice living in branchA2

// Tenant B
let tidB = 0
let branchB = 0
let adminTokenB = ''
let doctorTokenB = ''
let staffTokenB = '' // branch-scoped — invoice creation requires an active branch
let doctorBId = 0
let petB = 0

async function login(subdomain: string, username: string, branchIdx = 0): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[branchIdx].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}

async function pendingTokenFor(subdomain: string, username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain, username, password: PASSWORD })
  expect(step1.body.data.requiresBranchSelection).toBe(true)
  return step1.body.data.pendingToken as string
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const [adminRole, staffRole, doctorRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor',       tenantId: null } }),
  ])
  const passwordHash = await bcrypt.hash(PASSWORD, 10)

  // ── Tenant A: two branches ────────────────────────────────────────────────
  tidA = (await prisma.tenant.create({ data: { name: 'Codex Reg A', subdomain: SUB_A } })).id
  branchA1 = (await prisma.branch.create({ data: { tenantId: tidA, name: 'A Main' } })).id
  branchA2 = (await prisma.branch.create({ data: { tenantId: tidA, name: 'A Second' } })).id

  const adminA = await prisma.user.create({
    data: { tenantId: tidA, username: 'admin_a_reg', name: 'Admin A', passwordHash, roleId: adminRole.id, branchId: null, isActive: true },
  })
  await prisma.userRole.create({ data: { tenantId: tidA, userId: adminA.id, roleId: adminRole.id } })
  adminTokenA = await login(SUB_A, 'admin_a_reg')

  // Branch-scoped staff: assigned to branchA1 only.
  const staffA = await prisma.user.create({
    data: { tenantId: tidA, username: 'staff_a_reg', name: 'Staff A', passwordHash, roleId: staffRole.id, branchId: branchA1, isActive: true },
  })
  await prisma.userBranch.create({ data: { tenantId: tidA, userId: staffA.id, branchId: branchA1 } })
  await prisma.userRole.create({ data: { tenantId: tidA, userId: staffA.id, roleId: staffRole.id } })
  branchStaffTokenA = await login(SUB_A, 'staff_a_reg')

  const doctorA = await prisma.user.create({
    data: { tenantId: tidA, username: 'doctor_a_reg', name: 'Dr A', passwordHash, roleId: doctorRole.id, branchId: branchA1, isActive: true },
  })
  await prisma.userBranch.create({ data: { tenantId: tidA, userId: doctorA.id, branchId: branchA1 } })
  await prisma.userRole.create({ data: { tenantId: tidA, userId: doctorA.id, roleId: doctorRole.id } })
  doctorAId = doctorA.id

  const ownerA = await prisma.owner.create({ data: { tenantId: tidA, firstName: 'A', lastName: 'Owner', phone: '0820000001' } })
  petA = (await prisma.pet.create({ data: { tenantId: tidA, ownerId: ownerA.id, name: 'Pet A', species: 'dog' } })).id

  invoiceA1 = (await prisma.invoice.create({
    data: { tenantId: tidA, branchId: branchA1, invoiceNo: 'CDX-A1', petId: petA, subtotal: 100, totalAmount: 100, paymentStatus: 'pending' },
  })).id
  invoiceA2 = (await prisma.invoice.create({
    data: { tenantId: tidA, branchId: branchA2, invoiceNo: 'CDX-A2', petId: petA, subtotal: 200, totalAmount: 200, paymentStatus: 'pending' },
  })).id

  // ── Tenant B ──────────────────────────────────────────────────────────────
  tidB = (await prisma.tenant.create({ data: { name: 'Codex Reg B', subdomain: SUB_B } })).id
  branchB = (await prisma.branch.create({ data: { tenantId: tidB, name: 'B Main' } })).id

  const adminB = await prisma.user.create({
    data: { tenantId: tidB, username: 'admin_b_reg', name: 'Admin B', passwordHash, roleId: adminRole.id, branchId: null, isActive: true },
  })
  await prisma.userRole.create({ data: { tenantId: tidB, userId: adminB.id, roleId: adminRole.id } })
  adminTokenB = await login(SUB_B, 'admin_b_reg')

  const doctorB = await prisma.user.create({
    data: { tenantId: tidB, username: 'doctor_b_reg', name: 'Dr B', passwordHash, roleId: doctorRole.id, branchId: branchB, isActive: true },
  })
  await prisma.userBranch.create({ data: { tenantId: tidB, userId: doctorB.id, branchId: branchB } })
  await prisma.userRole.create({ data: { tenantId: tidB, userId: doctorB.id, roleId: doctorRole.id } })
  doctorBId = doctorB.id
  doctorTokenB = await login(SUB_B, 'doctor_b_reg')

  const staffB = await prisma.user.create({
    data: { tenantId: tidB, username: 'staff_b_reg', name: 'Staff B', passwordHash, roleId: staffRole.id, branchId: branchB, isActive: true },
  })
  await prisma.userBranch.create({ data: { tenantId: tidB, userId: staffB.id, branchId: branchB } })
  await prisma.userRole.create({ data: { tenantId: tidB, userId: staffB.id, roleId: staffRole.id } })
  staffTokenB = await login(SUB_B, 'staff_b_reg')

  const ownerB = await prisma.owner.create({ data: { tenantId: tidB, firstName: 'B', lastName: 'Owner', phone: '0820000002' } })
  petB = (await prisma.pet.create({ data: { tenantId: tidB, ownerId: ownerB.id, name: 'Pet B', species: 'cat' } })).id
})

afterAll(async () => {
  const ids = { in: [tidA, tidB] }
  await prisma.paymentHistory.deleteMany({ where: { tenantId: ids } })
  await prisma.invoiceItem.deleteMany({ where: { invoice: { tenantId: ids } } })
  await prisma.invoice.deleteMany({ where: { tenantId: ids } })
  await prisma.groomingBooking.deleteMany({ where: { tenantId: ids } })
  await prisma.hospitalization.deleteMany({ where: { tenantId: ids } })
  await prisma.medicalRecord.deleteMany({ where: { tenantId: ids } })
  await prisma.refreshToken.deleteMany({ where: { tenantId: ids } })
  await prisma.pet.deleteMany({ where: { tenantId: ids } })
  await prisma.owner.deleteMany({ where: { tenantId: ids } })
  await prisma.userRole.deleteMany({ where: { tenantId: ids } })
  await prisma.userBranch.deleteMany({ where: { tenantId: ids } })
  await prisma.user.deleteMany({ where: { tenantId: ids } })
  await prisma.branch.deleteMany({ where: { tenantId: ids } })
  await prisma.tenant.deleteMany({ where: { id: ids } })
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

// ─── CR-01 — cross-tenant FK injection ───────────────────────────────────────
describe('CR-01 — cross-tenant foreign keys are rejected inside the write transaction', () => {
  it('POST /api/hospitalizations rejects tenant B admitting tenant A pet', async () => {
    const res = await request(server)
      .post('/api/hospitalizations')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .send({ petId: petA, reason: 'cross-tenant probe' })
    expect(res.status).toBe(404)
    const leaked = await prisma.hospitalization.findFirst({ where: { petId: petA, tenantId: tidB } })
    expect(leaked).toBeNull()
  })

  it('POST /api/hospitalizations rejects a cross-tenant doctorInCharge', async () => {
    const res = await request(server)
      .post('/api/hospitalizations')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .send({ petId: petB, reason: 'cross-tenant doctor probe', doctorInCharge: doctorAId })
    expect(res.status).toBe(404)
  })

  it('POST /api/grooming/bookings rejects tenant B booking tenant A pet', async () => {
    const res = await request(server)
      .post('/api/grooming/bookings')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .send({ petId: petA, serviceType: 'bath', scheduledAt: new Date(Date.now() + 86_400_000).toISOString() })
    expect(res.status).toBe(404)
    const leaked = await prisma.groomingBooking.findFirst({ where: { petId: petA, tenantId: tidB } })
    expect(leaked).toBeNull()
  })

  it('POST /api/grooming/bookings rejects a cross-tenant groomerId', async () => {
    const res = await request(server)
      .post('/api/grooming/bookings')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .send({ petId: petB, groomerId: doctorAId, serviceType: 'bath', scheduledAt: new Date(Date.now() + 86_400_000).toISOString() })
    expect(res.status).toBe(404)
  })

  it('POST /api/invoices rejects tenant B invoicing tenant A pet', async () => {
    const res = await request(server)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${staffTokenB}`)
      .send({ petId: petA, items: [{ description: 'probe', itemType: 'service', qty: 1, unitPrice: 10 }] })
    expect(res.status).toBe(404)
    const leaked = await prisma.invoice.findFirst({ where: { petId: petA, tenantId: tidB } })
    expect(leaked).toBeNull()
  })

  // emr.create is a doctor-only permission (clinic_admin holds emr.view only), so the
  // cross-tenant FK probe must be driven by tenant B's doctor token.
  it('POST /api/medical-records rejects a cross-tenant petId', async () => {
    const res = await request(server)
      .post('/api/medical-records')
      .set('Authorization', `Bearer ${doctorTokenB}`)
      .send({ petId: petA, doctorId: doctorBId, subjective: 'probe', assessment: 'probe' })
    expect(res.status).toBe(404)
    const leaked = await prisma.medicalRecord.findFirst({ where: { petId: petA, tenantId: tidB } })
    expect(leaked).toBeNull()
  })

  it('POST /api/medical-records rejects a cross-tenant doctorId', async () => {
    const res = await request(server)
      .post('/api/medical-records')
      .set('Authorization', `Bearer ${doctorTokenB}`)
      .send({ petId: petB, doctorId: doctorAId, subjective: 'probe', assessment: 'probe' })
    expect(res.status).toBe(404)
  })

  it('RBAC deny still holds: clinic_admin has emr.view only, so POST /api/medical-records → 403', async () => {
    const res = await request(server)
      .post('/api/medical-records')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .send({ petId: petB, doctorId: doctorBId, subjective: 'probe', assessment: 'probe' })
    expect(res.status).toBe(403)
  })
})

// ─── HI-01 — branch-scoped JWT beats the query param ─────────────────────────
describe('HI-01 — a branch-scoped JWT overrides a client-supplied branchId', () => {
  it('GET /api/invoices/:id/promptpay-qr 404s for an invoice in another branch', async () => {
    // branchStaffTokenA is scoped to branchA1; invoiceA2 lives in branchA2.
    const res = await request(server)
      .get(`/api/invoices/${invoiceA2}/promptpay-qr`)
      .set('Authorization', `Bearer ${branchStaffTokenA}`)
    expect(res.status).toBe(404)
  })

  it('GET /api/invoices/:id/promptpay-qr succeeds for an invoice in the caller branch', async () => {
    const res = await request(server)
      .get(`/api/invoices/${invoiceA1}/promptpay-qr`)
      .set('Authorization', `Bearer ${branchStaffTokenA}`)
    // The branch check is what's under test: anything other than 404 means the
    // caller's own-branch invoice was reachable. A 4xx from PromptPay config
    // (unconfigured tenant) is fine and not what this asserts.
    expect(res.status).not.toBe(404)
  })

  it('GET /api/grooming/bookings ignores ?branchId= for a branch-scoped caller', async () => {
    await prisma.groomingBooking.create({
      data: { tenantId: tidA, branchId: branchA2, petId: petA, serviceType: 'bath', scheduledAt: new Date(Date.now() + 86_400_000) },
    })
    const res = await request(server)
      .get(`/api/grooming/bookings?branchId=${branchA2}`)
      .set('Authorization', `Bearer ${branchStaffTokenA}`)
    expect(res.status).toBe(200)
    const rows = res.body.data as { branchId: number }[]
    expect(rows.every(r => r.branchId === branchA1)).toBe(true)
  })

  it('GET /api/invoices/payment-history ignores ?branchId= for a branch-scoped caller', async () => {
    const res = await request(server)
      .get(`/api/invoices/payment-history?branchId=${branchA2}`)
      .set('Authorization', `Bearer ${branchStaffTokenA}`)
    expect(res.status).toBe(200)
    const rows = (res.body.data.rows ?? []) as { branchId: number }[]
    expect(rows.every(r => r.branchId === branchA1)).toBe(true)
  })

  it('a tenant-wide admin (branchId null) MAY still filter by ?branchId=', async () => {
    const res = await request(server)
      .get(`/api/grooming/bookings?branchId=${branchA2}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
    expect(res.status).toBe(200)
    const rows = res.body.data as { branchId: number }[]
    expect(rows.every(r => r.branchId === branchA2)).toBe(true)
  })
})

// ─── HI-03 — pending branch-selection token is not an API token ──────────────
describe('HI-03 — a scope:branch_select pending token is rejected on normal API routes', () => {
  let pending = ''

  beforeAll(async () => { pending = await pendingTokenFor(SUB_A, 'staff_a_reg') })

  it.each([
    ['GET',  '/api/pets'],
    ['GET',  '/api/invoices'],
    ['GET',  '/api/appointments'],
    ['GET',  '/auth/me'],
    ['GET',  '/api/grooming/bookings'],
  ])('%s %s → 401', async (method, path) => {
    const res = await (method === 'GET'
      ? request(server).get(path)
      : request(server).post(path))
      .set('Authorization', `Bearer ${pending}`)
    expect(res.status).toBe(401)
  })

  it('the same pending token still works on POST /auth/select-branch', async () => {
    const fresh = await pendingTokenFor(SUB_A, 'staff_a_reg')
    const res = await request(server).post('/auth/select-branch').send({ pendingToken: fresh, branchId: branchA1 })
    expect(res.status).toBe(200)
    expect(typeof res.body.data.token).toBe('string')
  })
})

// ─── HI-04 — concurrent refresh must produce exactly one winner ──────────────
describe('HI-04 — concurrent refresh of the same token yields exactly one 200', () => {
  it('two simultaneous refreshes: one 200, one 401 (no double-mint)', async () => {
    const step1 = await request(server).post('/auth/login').send({ subdomain: SUB_A, username: 'admin_a_reg', password: PASSWORD })
    const refreshToken = step1.body.data.refreshToken as string
    expect(typeof refreshToken).toBe('string')

    const [r1, r2] = await Promise.all([
      request(server).post('/auth/refresh').send({ refreshToken }),
      request(server).post('/auth/refresh').send({ refreshToken }),
    ])

    const statuses = [r1.status, r2.status].sort()
    expect(statuses.filter(s => s === 200)).toHaveLength(1)
    expect(statuses.filter(s => s !== 200)).toHaveLength(1)
    expect(statuses[0]).toBe(200)
    expect([401, 403]).toContain(statuses[1])
  })

  it('five simultaneous refreshes still yield exactly one 200', async () => {
    const step1 = await request(server).post('/auth/login').send({ subdomain: SUB_A, username: 'admin_a_reg', password: PASSWORD })
    const refreshToken = step1.body.data.refreshToken as string

    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(server).post('/auth/refresh').send({ refreshToken })),
    )
    expect(results.filter(r => r.status === 200)).toHaveLength(1)
  })
})
