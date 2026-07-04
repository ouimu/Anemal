/**
 * Test Suite: owner-delete-reactivate — DELETE /api/owners/:id, reactivation, includeInactive
 * @qa-agent | Protocol: qa-protocols.md §1 (isolation) + §3 (edge cases)
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../app'
import prisma from '../config/db'
import { signToken } from '../config/jwt'
import bcrypt from 'bcrypt'
import { seedUserRoles, cleanupUserRoles } from '../tests/helpers/seedUserRoles'

let server: Server
let tidA: number, tidB: number
let tokenAdminA: string, tokenStaffA: string, tokenAdminB: string
const SUB_A = `owner-del-a-${Date.now()}`
const SUB_B = `owner-del-b-${Date.now()}`
const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })
  const hash = await bcrypt.hash('TestPass1!', 10)
  const ts = Date.now()
  const tA = await prisma.tenant.create({ data: { name: 'Owner Del A', subdomain: SUB_A } })
  const tB = await prisma.tenant.create({ data: { name: 'Owner Del B', subdomain: SUB_B } })
  tidA = tA.id; tidB = tB.id
  const adminA = await prisma.user.create({ data: { tenantId: tidA, name: 'Admin A', username: `odel_adm_a_${ts % 100000}`, email: `odel-adm-a-${ts}@t.local`, passwordHash: hash, role: 'admin' } })
  const staffA = await prisma.user.create({ data: { tenantId: tidA, name: 'Staff A', username: `odel_stf_a_${ts % 100000}`, email: `odel-stf-a-${ts}@t.local`, passwordHash: hash, role: 'staff' } })
  const adminB = await prisma.user.create({ data: { tenantId: tidB, name: 'Admin B', username: `odel_adm_b_${ts % 100000}`, email: `odel-adm-b-${ts}@t.local`, passwordHash: hash, role: 'admin' } })
  const bA = await prisma.branch.create({ data: { tenantId: tidA, name: 'Main' } })
  const bB = await prisma.branch.create({ data: { tenantId: tidB, name: 'Main' } })
  tokenAdminA = signToken({ userId: adminA.id, tenantId: tidA, branchId: bA.id, plane: 'clinic', permSetVersion: 1, role: 'admin' })
  tokenStaffA = signToken({ userId: staffA.id, tenantId: tidA, branchId: bA.id, plane: 'clinic', permSetVersion: 1, role: 'staff' })
  tokenAdminB = signToken({ userId: adminB.id, tenantId: tidB, branchId: bB.id, plane: 'clinic', permSetVersion: 1, role: 'admin' })

  await seedUserRoles(prisma, [
    { userId: adminA.id, tenantId: tidA, roleKey: 'clinic_admin' },
    { userId: staffA.id, tenantId: tidA, roleKey: 'clinic_staff' },
    { userId: adminB.id, tenantId: tidB, roleKey: 'clinic_admin' },
  ])
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await cleanupUserRoles(prisma, [tidA, tidB])
  await prisma.pet.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.owner.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.branch.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.user.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tidA, tidB] } } })
})

describe('GET /api/owners — includeInactive gating', () => {
  test('default list excludes inactive owners', async () => {
    const created = await request(server).post('/api/owners').set(auth(tokenAdminA))
      .send({ firstName: 'Inactive', lastName: 'Owner', phone: '0830000001' }).expect(201)
    await prisma.owner.update({ where: { id: created.body.data.id }, data: { isActive: false } })

    const res = await request(server).get('/api/owners').set(auth(tokenAdminA)).expect(200)
    const ids = res.body.data.owners.map((o: { id: number }) => o.id)
    expect(ids).not.toContain(created.body.data.id)
  })

  test('crm.delete holder with includeInactive=true sees inactive owners', async () => {
    const created = await request(server).post('/api/owners').set(auth(tokenAdminA))
      .send({ firstName: 'Inactive2', lastName: 'Owner', phone: '0830000002' }).expect(201)
    await prisma.owner.update({ where: { id: created.body.data.id }, data: { isActive: false } })

    const res = await request(server).get('/api/owners?includeInactive=true').set(auth(tokenAdminA)).expect(200)
    const ids = res.body.data.owners.map((o: { id: number }) => o.id)
    expect(ids).toContain(created.body.data.id)
  })

  test('crm.edit-only user requesting includeInactive=true is silently ignored (200, not 403)', async () => {
    const created = await request(server).post('/api/owners').set(auth(tokenAdminA))
      .send({ firstName: 'Inactive3', lastName: 'Owner', phone: '0830000003' }).expect(201)
    await prisma.owner.update({ where: { id: created.body.data.id }, data: { isActive: false } })

    const res = await request(server).get('/api/owners?includeInactive=true').set(auth(tokenStaffA)).expect(200)
    const ids = res.body.data.owners.map((o: { id: number }) => o.id)
    expect(ids).not.toContain(created.body.data.id)
  })
})

describe('DELETE /api/owners/:id', () => {
  test('succeeds and sets isActive=false when owner has no active pets', async () => {
    const created = await request(server).post('/api/owners').set(auth(tokenAdminA))
      .send({ firstName: 'ToDelete', lastName: 'Owner', phone: '0830000010' }).expect(201)

    await request(server).delete(`/api/owners/${created.body.data.id}`).set(auth(tokenAdminA)).expect(200)

    const row = await prisma.owner.findUnique({ where: { id: created.body.data.id } })
    expect(row?.isActive).toBe(false)
  })

  test('returns 409 when owner has an active pet', async () => {
    const created = await request(server).post('/api/owners').set(auth(tokenAdminA))
      .send({ firstName: 'HasPet', lastName: 'Owner', phone: '0830000011' }).expect(201)
    await prisma.pet.create({ data: { tenantId: tidA, ownerId: created.body.data.id, name: 'Rex', species: 'canine' } })

    const res = await request(server).delete(`/api/owners/${created.body.data.id}`).set(auth(tokenAdminA)).expect(409)
    expect(res.body.error).toMatch(/active pets/i)

    const row = await prisma.owner.findUnique({ where: { id: created.body.data.id } })
    expect(row?.isActive).toBe(true)
  })

  test('requires crm.delete — clinic_staff (crm.edit only) gets 403', async () => {
    const created = await request(server).post('/api/owners').set(auth(tokenAdminA))
      .send({ firstName: 'Guarded', lastName: 'Owner', phone: '0830000012' }).expect(201)

    await request(server).delete(`/api/owners/${created.body.data.id}`).set(auth(tokenStaffA)).expect(403)
  })

  test('tenant isolation: tenant B cannot delete tenant A owner → 404', async () => {
    const created = await request(server).post('/api/owners').set(auth(tokenAdminA))
      .send({ firstName: 'Cross', lastName: 'Tenant', phone: '0830000013' }).expect(201)

    await request(server).delete(`/api/owners/${created.body.data.id}`).set(auth(tokenAdminB)).expect(404)
  })
})

describe('PUT /api/owners/:id — reactivation permission', () => {
  test('crm.delete holder can set isActive back to true', async () => {
    const created = await request(server).post('/api/owners').set(auth(tokenAdminA))
      .send({ firstName: 'Reactivate', lastName: 'Me', phone: '0830000020' }).expect(201)
    await request(server).delete(`/api/owners/${created.body.data.id}`).set(auth(tokenAdminA)).expect(200)

    const res = await request(server).put(`/api/owners/${created.body.data.id}`).set(auth(tokenAdminA))
      .send({ isActive: true }).expect(200)
    expect(res.body.data.isActive).toBe(true)
  })

  test('crm.edit-only user (clinic_staff) gets 403 trying to set isActive', async () => {
    const created = await request(server).post('/api/owners').set(auth(tokenAdminA))
      .send({ firstName: 'GuardedReactivate', lastName: 'Me', phone: '0830000021' }).expect(201)

    await request(server).put(`/api/owners/${created.body.data.id}`).set(auth(tokenStaffA))
      .send({ isActive: false }).expect(403)
  })

  test('crm.edit-only user can still edit non-isActive fields normally', async () => {
    const created = await request(server).post('/api/owners').set(auth(tokenAdminA))
      .send({ firstName: 'NormalEdit', lastName: 'Me', phone: '0830000022' }).expect(201)

    const res = await request(server).put(`/api/owners/${created.body.data.id}`).set(auth(tokenStaffA))
      .send({ lastName: 'Updated' }).expect(200)
    expect(res.body.data.lastName).toBe('Updated')
  })
})
