/**
 * Hospitalization branch isolation (BOLA fix) — ADR-0014.
 *
 * Closes a Broken Object Level Authorization gap: a branch-scoped staffer
 * holding inpatient.view/inpatient.manage could read/edit/delete/log-care/
 * discharge another branch's admission in the *same tenant* by guessing the
 * numeric ID, because getHospitalization/edit/remove/logCare/discharge only
 * scoped by tenantId, never branchId. GET /active also trusted req.query.branchId
 * over req.context.branchId.
 *
 * Matrix covered per endpoint (GET /:id, GET /active, PUT /:id, DELETE /:id,
 * POST /:id/care, PUT /:id/discharge):
 *   - same-branch            → success
 *   - other-branch-same-tenant → 404 + DB state unchanged
 *   - other-tenant            → 404 (existing tenant-isolation precedent)
 *   - all-branch admin        → full access (except discharge, which still
 *     requires a concrete branch via the pre-existing requireBranchId guard)
 */

import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'

const SUB = 'hosp-branch-iso-test'
const OTHER_SUB = 'hosp-branch-iso-test-other'
const PASSWORD = 'TestPass1!'

let server: Server

let tid = 0
let otherTid = 0
let branchAId = 0
let branchBId = 0
let otherBranchId = 0
let petIdA = 0

let staffAToken = ''   // branch-scoped to Branch A, holds inpatient.view + inpatient.manage
let adminToken = ''    // all-branch (branchId null), same tenant
let otherTenantToken = '' // different tenant entirely

async function login(sub: string, username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain: sub, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}

async function admitDirect(branchId: number | null, petId: number, reason: string): Promise<number> {
  const hosp = await prisma.hospitalization.create({
    data: { tenantId: tid, branchId, petId, reason, dailyRate: 0, status: 'admitted' },
  })
  return hosp.id
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const tenant = await prisma.tenant.create({ data: { name: 'Hosp Branch Iso Test', subdomain: SUB } })
  tid = tenant.id
  const otherTenant = await prisma.tenant.create({ data: { name: 'Hosp Branch Iso Test — Other', subdomain: OTHER_SUB } })
  otherTid = otherTenant.id

  const [branchA, branchB, otherBranch] = await Promise.all([
    prisma.branch.create({ data: { tenantId: tid, name: 'Branch A' } }),
    prisma.branch.create({ data: { tenantId: tid, name: 'Branch B' } }),
    prisma.branch.create({ data: { tenantId: otherTid, name: 'Other Tenant Branch' } }),
  ])
  branchAId = branchA.id
  branchBId = branchB.id
  otherBranchId = otherBranch.id

  const [staffSystemRole, staffSystemRoleOther] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
  ])

  const passwordHash = await bcrypt.hash(PASSWORD, 10)

  // Branch-scoped staffer pinned to Branch A, holds inpatient.view + inpatient.manage.
  const staffA = await prisma.user.create({
    data: { tenantId: tid, username: 'staff_a', name: 'Staff Branch A', passwordHash, role: 'staff', branchId: branchAId, isActive: true },
  })
  await prisma.userBranch.create({ data: { tenantId: tid, userId: staffA.id, branchId: branchAId } })
  await prisma.userRole.create({ data: { tenantId: tid, userId: staffA.id, roleId: staffSystemRole.id } })

  // All-branch admin in the same tenant (literal role 'admin' → login bypass, branchId: null in JWT).
  const adminUser = await prisma.user.create({
    data: { tenantId: tid, username: 'admin_iso', name: 'Admin All-Branch', passwordHash, role: 'admin', branchId: null, isActive: true },
  })
  const clinicAdminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  await prisma.userRole.create({ data: { tenantId: tid, userId: adminUser.id, roleId: clinicAdminRole.id } })

  // A second tenant + branch-scoped staffer, for cross-tenant regression.
  const otherStaff = await prisma.user.create({
    data: { tenantId: otherTid, username: 'staff_other', name: 'Staff Other Tenant', passwordHash, role: 'staff', branchId: otherBranchId, isActive: true },
  })
  await prisma.userBranch.create({ data: { tenantId: otherTid, userId: otherStaff.id, branchId: otherBranchId } })
  await prisma.userRole.create({ data: { tenantId: otherTid, userId: otherStaff.id, roleId: staffSystemRoleOther.id } })

  // Pet (FK requirement for Hospitalization.petId) — lives in the primary tenant only;
  // cross-tenant coverage only needs a token, never a hospitalization row in otherTid.
  const ownerA = await prisma.owner.create({ data: { tenantId: tid, firstName: 'Iso', lastName: 'Owner', phone: '0800000001' } })
  const petA = await prisma.pet.create({ data: { tenantId: tid, ownerId: ownerA.id, name: 'Buddy', species: 'dog' } })
  petIdA = petA.id

  staffAToken = await login(SUB, 'staff_a')
  adminToken = await login(SUB, 'admin_iso')
  otherTenantToken = await login(OTHER_SUB, 'staff_other')
})

afterAll(async () => {
  await prisma.dailyInpatientCare.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.hospitalization.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.pet.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.owner.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.userRole.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.userBranch.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.user.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.branch.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tid, otherTid] } } })
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('GET /api/hospitalizations/:id — branch isolation', () => {
  it('✅ same-branch staffer reads their own branch admission → 200', async () => {
    const hospId = await admitDirect(branchAId, petIdA, 'Same branch read')
    const res = await request(server).get(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${staffAToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(hospId)
  })

  it('❌ same-tenant other-branch staffer cannot read → 404', async () => {
    const hospId = await admitDirect(branchBId, petIdA, 'Other branch read')
    const res = await request(server).get(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${staffAToken}`)
    expect(res.status).toBe(404)
  })

  it('❌ other-tenant staffer cannot read → 404', async () => {
    const hospId = await admitDirect(branchAId, petIdA, 'Cross tenant read')
    const res = await request(server).get(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${otherTenantToken}`)
    expect(res.status).toBe(404)
  })

  it('✅ all-branch admin reads a Branch A admission → 200', async () => {
    const hospId = await admitDirect(branchAId, petIdA, 'Admin read A')
    const res = await request(server).get(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
  })

  it('✅ all-branch admin reads a Branch B admission → 200', async () => {
    const hospId = await admitDirect(branchBId, petIdA, 'Admin read B')
    const res = await request(server).get(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
  })
})

describe('GET /api/hospitalizations/active — branch isolation', () => {
  it('✅ branch-scoped staffer only sees their own branch admissions', async () => {
    const hospA = await admitDirect(branchAId, petIdA, 'Active list A')
    const hospB = await admitDirect(branchBId, petIdA, 'Active list B')
    const res = await request(server).get('/api/hospitalizations/active').set('Authorization', `Bearer ${staffAToken}`)
    expect(res.status).toBe(200)
    const ids = (res.body.data as Array<{ id: number }>).map(h => h.id)
    expect(ids).toContain(hospA)
    expect(ids).not.toContain(hospB)
  })

  it('❌ ?branchId= query override is ignored for branch-scoped sessions (ADR-0014 Q4)', async () => {
    const hospB = await admitDirect(branchBId, petIdA, 'Active list override attempt')
    const res = await request(server)
      .get(`/api/hospitalizations/active?branchId=${branchBId}`)
      .set('Authorization', `Bearer ${staffAToken}`)
    expect(res.status).toBe(200)
    const ids = (res.body.data as Array<{ id: number }>).map(h => h.id)
    expect(ids).not.toContain(hospB)
  })

  it('✅ all-branch admin sees admissions from both branches in the tenant', async () => {
    const hospA = await admitDirect(branchAId, petIdA, 'Admin active A')
    const hospB = await admitDirect(branchBId, petIdA, 'Admin active B')
    const res = await request(server).get('/api/hospitalizations/active').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    const ids = (res.body.data as Array<{ id: number }>).map(h => h.id)
    expect(ids).toContain(hospA)
    expect(ids).toContain(hospB)
  })
})

describe('PUT /api/hospitalizations/:id — branch isolation', () => {
  it('✅ same-branch staffer edits their own branch admission → 200', async () => {
    const hospId = await admitDirect(branchAId, petIdA, 'Edit same branch')
    const res = await request(server).put(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${staffAToken}`)
      .send({ reason: 'Edited by same-branch staff' })
    expect(res.status).toBe(200)
    expect(res.body.data.reason).toBe('Edited by same-branch staff')
  })

  it('❌ same-tenant other-branch staffer cannot edit → 404 and DB state unchanged', async () => {
    const hospId = await admitDirect(branchBId, petIdA, 'Edit other branch')
    const res = await request(server).put(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${staffAToken}`)
      .send({ reason: 'Hijacked reason' })
    expect(res.status).toBe(404)

    const verify = await request(server).get(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminToken}`)
    expect(verify.body.data.reason).toBe('Edit other branch')
  })

  it('❌ other-tenant staffer cannot edit → 404', async () => {
    const hospId = await admitDirect(branchAId, petIdA, 'Edit cross tenant')
    const res = await request(server).put(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${otherTenantToken}`)
      .send({ reason: 'Hijacked from other tenant' })
    expect(res.status).toBe(404)
  })

  it('✅ all-branch admin edits a Branch B admission → 200', async () => {
    const hospId = await admitDirect(branchBId, petIdA, 'Admin edit B')
    const res = await request(server).put(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Edited by admin' })
    expect(res.status).toBe(200)
    expect(res.body.data.reason).toBe('Edited by admin')
  })
})

describe('DELETE /api/hospitalizations/:id — branch isolation', () => {
  it('✅ same-branch staffer deletes their own branch admission (zero care logs) → 204', async () => {
    const hospId = await admitDirect(branchAId, petIdA, 'Delete same branch')
    const res = await request(server).delete(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${staffAToken}`)
    expect(res.status).toBe(204)
  })

  it('❌ same-tenant other-branch staffer cannot delete → 404 and DB state unchanged', async () => {
    const hospId = await admitDirect(branchBId, petIdA, 'Delete other branch')
    const res = await request(server).delete(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${staffAToken}`)
    expect(res.status).toBe(404)

    const verify = await request(server).get(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminToken}`)
    expect(verify.status).toBe(200)
    expect(verify.body.data.status).toBe('admitted')
  })

  it('❌ other-tenant staffer cannot delete → 404', async () => {
    const hospId = await admitDirect(branchAId, petIdA, 'Delete cross tenant')
    const res = await request(server).delete(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${otherTenantToken}`)
    expect(res.status).toBe(404)
  })

  it('✅ all-branch admin deletes a Branch B admission → 204', async () => {
    const hospId = await admitDirect(branchBId, petIdA, 'Admin delete B')
    const res = await request(server).delete(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(204)
  })
})

describe('POST /api/hospitalizations/:id/care — branch isolation', () => {
  it('✅ same-branch staffer logs care on their own branch admission → 201', async () => {
    const hospId = await admitDirect(branchAId, petIdA, 'Care same branch')
    const res = await request(server).post(`/api/hospitalizations/${hospId}/care`).set('Authorization', `Bearer ${staffAToken}`)
      .send({ timeSlot: '08:00', temperatureC: 38.0 })
    expect(res.status).toBe(201)
  })

  it('❌ same-tenant other-branch staffer cannot log care → 404 and no care log added', async () => {
    const hospId = await admitDirect(branchBId, petIdA, 'Care other branch')
    const res = await request(server).post(`/api/hospitalizations/${hospId}/care`).set('Authorization', `Bearer ${staffAToken}`)
      .send({ timeSlot: '08:00', temperatureC: 39.0 })
    expect(res.status).toBe(404)

    const verify = await request(server).get(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminToken}`)
    expect(verify.body.data.careLogs).toHaveLength(0)
  })

  it('❌ other-tenant staffer cannot log care → 404', async () => {
    const hospId = await admitDirect(branchAId, petIdA, 'Care cross tenant')
    const res = await request(server).post(`/api/hospitalizations/${hospId}/care`).set('Authorization', `Bearer ${otherTenantToken}`)
      .send({ timeSlot: '08:00', temperatureC: 39.0 })
    expect(res.status).toBe(404)
  })

  it('✅ all-branch admin logs care on a Branch B admission → 201', async () => {
    const hospId = await admitDirect(branchBId, petIdA, 'Admin care B')
    const res = await request(server).post(`/api/hospitalizations/${hospId}/care`).set('Authorization', `Bearer ${adminToken}`)
      .send({ timeSlot: '12:00', temperatureC: 38.5 })
    expect(res.status).toBe(201)
  })
})

describe('PUT /api/hospitalizations/:id/discharge — branch isolation', () => {
  it('✅ same-branch staffer discharges their own branch admission → 200', async () => {
    const hospId = await admitDirect(branchAId, petIdA, 'Discharge same branch')
    const res = await request(server).put(`/api/hospitalizations/${hospId}/discharge`).set('Authorization', `Bearer ${staffAToken}`).send({})
    expect(res.status).toBe(200)
    expect(res.body.data.hospitalization.status).toBe('discharged')
  })

  it('❌ same-tenant other-branch staffer cannot discharge → 404 and DB state unchanged', async () => {
    const hospId = await admitDirect(branchBId, petIdA, 'Discharge other branch')
    const res = await request(server).put(`/api/hospitalizations/${hospId}/discharge`).set('Authorization', `Bearer ${staffAToken}`).send({})
    expect(res.status).toBe(404)

    const verify = await request(server).get(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminToken}`)
    expect(verify.body.data.status).toBe('admitted')
  })

  it('❌ other-tenant staffer cannot discharge → 404', async () => {
    const hospId = await admitDirect(branchAId, petIdA, 'Discharge cross tenant')
    const res = await request(server).put(`/api/hospitalizations/${hospId}/discharge`).set('Authorization', `Bearer ${otherTenantToken}`).send({})
    expect(res.status).toBe(404)
  })

  it('❌ all-branch admin without a concrete branch selected cannot discharge → existing requireBranchId guard, unchanged', async () => {
    const hospId = await admitDirect(branchAId, petIdA, 'Discharge admin no branch')
    const res = await request(server).put(`/api/hospitalizations/${hospId}/discharge`).set('Authorization', `Bearer ${adminToken}`).send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/branch/i)
  })
})
