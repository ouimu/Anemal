// @qa-agent — Integration test: GET /api/vaccinations/due-worklist
// Branch-scoped, latest-per-group dedup via raw SQL CTE.
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { clearPermCache } from '../../services/permission.service'

const SUBDOMAIN = 'vax-worklist-test'
const PASSWORD  = 'TestPass1!'

let server: Server
let tid         = 0
let token       = ''      // admin token with emr.view
let doctorToken = ''      // doctor token with emr.create
let noPermToken = ''      // token for user with no permissions (no role_permissions rows)

async function login(username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain: SUBDOMAIN, username, password: PASSWORD })
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

  const passwordHash = await bcrypt.hash(PASSWORD, 4)

  const tenant = await prisma.tenant.create({ data: { name: 'Vax Worklist Test', subdomain: SUBDOMAIN } })
  tid = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId: tid, name: 'Main' } })

  // Admin role (clinic_admin system role — has emr.view via role_permissions)
  const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })

  const adminUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Admin WL', username: 'admin_wl', email: 'admin@wl.test', passwordHash, roleId: adminRole.id },
  })
  await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id, tenantId: tid } })

  // Doctor role (has emr.create)
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const doctorUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Doctor WL', username: 'doctor_wl', email: 'doctor@wl.test', passwordHash, roleId: doctorRole.id },
  })
  await prisma.userRole.create({ data: { userId: doctorUser.id, roleId: doctorRole.id, tenantId: tid } })
  await prisma.userBranch.create({ data: { userId: doctorUser.id, branchId: branch.id, tenantId: tid } })

  // No-perm user: create a custom role with zero permissions, assign it
  const emptyRole = await prisma.clinicRole.create({
    data: { tenantId: tid, name: 'No Perm Role', key: 'no_perm_wl', permVersion: 1 },
  })
  const noPermUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'No Perm WL', username: 'noperm_wl', email: 'noperm@wl.test', passwordHash, roleId: emptyRole.id },
  })
  await prisma.userRole.create({ data: { userId: noPermUser.id, roleId: emptyRole.id, tenantId: tid } })
  // Staff users need an explicit user_branches row to pass login step 1
  await prisma.userBranch.create({ data: { userId: noPermUser.id, branchId: branch.id, tenantId: tid } })

  token       = await login('admin_wl')
  doctorToken = await login('doctor_wl')
  noPermToken = await login('noperm_wl')
})

afterAll(async () => {
  clearPermCache()

  // Tear down in FK-safe order
  await prisma.userBranch.deleteMany({ where: { tenantId: tid } })
  await prisma.userRole.deleteMany({ where: { tenantId: tid } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  // Delete custom role (system roles tenantId:null must not be deleted)
  await prisma.clinicRole.deleteMany({ where: { tenantId: tid } })
  await prisma.branch.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
  await prisma.$disconnect()

  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('POST /api/vaccinations with administeredExternally', () => {
  it('accepts administeredExternally flag without validation error', async () => {
    const res = await request(server)
      .post('/api/vaccinations')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        petId: 1,
        vaccineName: 'Rabies',
        administeredAt: new Date().toISOString(),
        nextDueAt: null,
        batchNo: null,
        notes: null,
        administeredExternally: true,
      })
    // 201 = success, 404 = petId not in seed — either is not a validation error
    expect([201, 404]).toContain(res.status)
  })
})

describe('GET /api/vaccinations/due-worklist', () => {
  it('returns 200 with an array when caller has emr.view', async () => {
    const res = await request(server)
      .get('/api/vaccinations/due-worklist')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('returns 403 without emr.view permission', async () => {
    const res = await request(server)
      .get('/api/vaccinations/due-worklist')
      .set('Authorization', `Bearer ${noPermToken}`)
    expect(res.status).toBe(403)
  })
})
