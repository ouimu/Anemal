/**
 * Tenant-ownership validation — cross-tenant doctorId/petId must 404, not silently attach.
 */
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'

const SUB = 'appt-tenant-own-test'
const PASSWORD = 'TestPass1!'

let server: Server
let tid = 0
let otherTid = 0
let branchId = 0
let staffToken = ''
let ownDoctorId = 0
let ownPetId = 0
let otherDoctorId = 0
let otherPetId = 0

async function login(username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain: SUB, username, password: PASSWORD })
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

  const tenant = await prisma.tenant.create({ data: { name: 'Appt Tenant Own Test', subdomain: SUB } })
  tid = tenant.id
  const otherTenant = await prisma.tenant.create({ data: { name: 'Appt Tenant Own Test — Other', subdomain: SUB + '-other' } })
  otherTid = otherTenant.id

  const branch = await prisma.branch.create({ data: { tenantId: tid, name: 'Main' } })
  branchId = branch.id
  const otherBranch = await prisma.branch.create({ data: { tenantId: otherTid, name: 'Other Main' } })

  const [staffRole, doctorRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } }),
  ])

  const passwordHash = await bcrypt.hash(PASSWORD, 10)

  const staffUser = await prisma.user.create({
    data: { tenantId: tid, username: 'staff_own', name: 'Staff Own', passwordHash, role: 'staff', branchId, isActive: true },
  })
  await prisma.userBranch.create({ data: { tenantId: tid, userId: staffUser.id, branchId } })
  await prisma.userRole.create({ data: { tenantId: tid, userId: staffUser.id, roleId: staffRole.id } })
  staffToken = await login('staff_own')

  const ownDoctor = await prisma.user.create({
    data: { tenantId: tid, username: 'doctor_own', name: 'Dr. Own', passwordHash, role: 'doctor', branchId, isActive: true },
  })
  await prisma.userBranch.create({ data: { tenantId: tid, userId: ownDoctor.id, branchId } })
  await prisma.userRole.create({ data: { tenantId: tid, userId: ownDoctor.id, roleId: doctorRole.id } })
  ownDoctorId = ownDoctor.id

  const ownOwner = await prisma.owner.create({ data: { tenantId: tid, firstName: 'Own', lastName: 'Owner', phone: '0810000001' } })
  const ownPet = await prisma.pet.create({ data: { tenantId: tid, ownerId: ownOwner.id, name: 'Own Pet', species: 'dog' } })
  ownPetId = ownPet.id

  const otherDoctor = await prisma.user.create({
    data: { tenantId: otherTid, username: 'doctor_other', name: 'Dr. Other', passwordHash, role: 'doctor', branchId: otherBranch.id, isActive: true },
  })
  await prisma.userBranch.create({ data: { tenantId: otherTid, userId: otherDoctor.id, branchId: otherBranch.id } })
  await prisma.userRole.create({ data: { tenantId: otherTid, userId: otherDoctor.id, roleId: doctorRole.id } })
  otherDoctorId = otherDoctor.id

  const otherOwner = await prisma.owner.create({ data: { tenantId: otherTid, firstName: 'Other', lastName: 'Owner', phone: '0810000002' } })
  const otherPet = await prisma.pet.create({ data: { tenantId: otherTid, ownerId: otherOwner.id, name: 'Other Pet', species: 'cat' } })
  otherPetId = otherPet.id
})

afterAll(async () => {
  await prisma.pet.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.owner.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.userRole.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.userBranch.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.user.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.branch.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tid, otherTid] } } })
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('POST /api/appointments — tenant ownership', () => {
  it('404s on a cross-tenant doctorId', async () => {
    const res = await request(server)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ petId: ownPetId, doctorId: otherDoctorId, scheduledAt: new Date(Date.now() + 3600_000).toISOString(), durationMin: 30 })
    expect(res.status).toBe(404)
  })

  it('404s on a cross-tenant petId', async () => {
    const res = await request(server)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ petId: otherPetId, doctorId: ownDoctorId, scheduledAt: new Date(Date.now() + 7200_000).toISOString(), durationMin: 30 })
    expect(res.status).toBe(404)
  })
})

describe('POST /api/appointments/walk-in — tenant ownership', () => {
  it('404s on a cross-tenant doctorId', async () => {
    const res = await request(server)
      .post('/api/appointments/walk-in')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ petId: ownPetId, doctorId: otherDoctorId })
    expect(res.status).toBe(404)
  })

  it('404s on a cross-tenant petId', async () => {
    const res = await request(server)
      .post('/api/appointments/walk-in')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ petId: otherPetId, doctorId: ownDoctorId })
    expect(res.status).toBe(404)
  })
})
