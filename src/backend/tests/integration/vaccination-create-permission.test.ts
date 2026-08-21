// src/backend/tests/integration/vaccination-create-permission.test.ts
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { clearPermCache } from '../../services/permission.service'

const SUBDOMAIN = `vax-create-perm-test-${Date.now()}`
const PASSWORD  = 'TestPass1!'

let server: Server
let tid = 0
let petId = 0
let staffToken  = ''
let doctorToken = ''
let adminToken  = ''

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

  const tenant = await prisma.tenant.create({ data: { name: 'Vax Create Perm Test', subdomain: SUBDOMAIN } })
  tid = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId: tid, name: 'Main' } })

  const owner = await prisma.owner.create({ data: { tenantId: tid, firstName: 'Jane', lastName: 'Doe', phone: '0800000000' } })
  const pet = await prisma.pet.create({ data: { tenantId: tid, ownerId: owner.id, name: 'Rex', species: 'canine' } })
  petId = pet.id

  const staffRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const adminRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })

  const staffUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Staff VCP', username: 'staff_vcp', email: 'staff@vcp.test', passwordHash, roleId: staffRole.id },
  })
  await prisma.userRole.create({ data: { userId: staffUser.id, roleId: staffRole.id, tenantId: tid } })
  await prisma.userBranch.create({ data: { userId: staffUser.id, branchId: branch.id, tenantId: tid } })

  const doctorUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Doctor VCP', username: 'doctor_vcp', email: 'doctor@vcp.test', passwordHash, roleId: doctorRole.id },
  })
  await prisma.userRole.create({ data: { userId: doctorUser.id, roleId: doctorRole.id, tenantId: tid } })
  await prisma.userBranch.create({ data: { userId: doctorUser.id, branchId: branch.id, tenantId: tid } })

  const adminUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Admin VCP', username: 'admin_vcp', email: 'admin@vcp.test', passwordHash, roleId: adminRole.id },
  })
  await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id, tenantId: tid } })

  staffToken  = await login('staff_vcp')
  doctorToken = await login('doctor_vcp')
  adminToken  = await login('admin_vcp')
})

afterAll(async () => {
  clearPermCache()
  await prisma.vaccination.deleteMany({ where: { pet: { tenantId: tid } } })
  await prisma.userBranch.deleteMany({ where: { tenantId: tid } })
  await prisma.userRole.deleteMany({ where: { tenantId: tid } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.pet.deleteMany({ where: { tenantId: tid } })
  await prisma.owner.deleteMany({ where: { tenantId: tid } })
  await prisma.branch.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
  await prisma.$disconnect()

  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('POST /api/vaccinations — vaccination.create permission', () => {
  it('clinic_staff can create a vaccination record', async () => {
    const res = await request(server)
      .post('/api/vaccinations')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ petId, vaccineName: 'Rabies', administeredAt: new Date().toISOString() })
    expect(res.status).toBe(201)
  })

  it('doctor can still create a vaccination record', async () => {
    const res = await request(server)
      .post('/api/vaccinations')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ petId, vaccineName: 'Rabies', administeredAt: new Date().toISOString() })
    expect(res.status).toBe(201)
  })

  it('clinic_admin is denied (403) — does not have vaccination.create', async () => {
    const res = await request(server)
      .post('/api/vaccinations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ petId, vaccineName: 'Rabies', administeredAt: new Date().toISOString() })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('vaccination.create')
  })

  it('clinic_staff is still denied (403) on medical-record creation — emr.create not granted', async () => {
    const res = await request(server)
      .post('/api/medical-records')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ petId, assessment: 'Checkup' })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('emr.create')
  })
})
