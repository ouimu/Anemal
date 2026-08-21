/**
 * Appointment doctor-list — repository + endpoint coverage.
 * Fixes: booking form doctor dropdown empty for clinic_staff/doctor (403 on
 * old GET /users staff.view gate); no branch scoping; no role-lineage support.
 */

import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { findDoctorsForBranch, findDoctorById } from '../../models/appointment.repository'

const SUB = `appt-doctors-test-${Date.now()}`
const PASSWORD = 'TestPass1!'

let server: Server
let tid = 0
let otherTid = 0
let branchAId = 0
let branchBId = 0
let staffToken = ''
let doctorToken = ''
let doctorSystemRoleId = 0
let staffSystemRoleId = 0

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

  const tenant = await prisma.tenant.create({ data: { name: 'Appt Doctors Test', subdomain: SUB } })
  tid = tenant.id
  const otherTenant = await prisma.tenant.create({ data: { name: 'Appt Doctors Test — Other', subdomain: SUB + '-other' } })
  otherTid = otherTenant.id

  const [branchA, branchB] = await Promise.all([
    prisma.branch.create({ data: { tenantId: tid, name: 'Branch A' } }),
    prisma.branch.create({ data: { tenantId: tid, name: 'Branch B' } }),
  ])
  branchAId = branchA.id
  branchBId = branchB.id

  const [doctorSystemRole, staffSystemRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
  ])
  doctorSystemRoleId = doctorSystemRole.id
  staffSystemRoleId = staffSystemRole.id

  const passwordHash = await bcrypt.hash(PASSWORD, 10)

  // Doctor assigned to Branch A only, via direct system role.
  const doctorUser = await prisma.user.create({
    data: {
      tenantId: tid, username: 'doctor_a', name: 'Dr. Branch A', passwordHash,
      roleId: doctorSystemRoleId, branchId: branchAId, isActive: true,
    },
  })
  await prisma.userBranch.create({ data: { tenantId: tid, userId: doctorUser.id, branchId: branchAId } })
  await prisma.userRole.create({ data: { tenantId: tid, userId: doctorUser.id, roleId: doctorSystemRoleId } })

  // Staff assigned to Branch A, holds only clinic_staff (not a doctor).
  const staffUser = await prisma.user.create({
    data: {
      tenantId: tid, username: 'staff_a', name: 'Staff Branch A', passwordHash,
      roleId: staffSystemRoleId, branchId: branchAId, isActive: true,
    },
  })
  await prisma.userBranch.create({ data: { tenantId: tid, userId: staffUser.id, branchId: branchAId } })
  await prisma.userRole.create({ data: { tenantId: tid, userId: staffUser.id, roleId: staffSystemRoleId } })

  doctorToken = await login('doctor_a')
  staffToken = await login('staff_a')
})

afterAll(async () => {
  await prisma.userRole.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.userBranch.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.user.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.clinicRole.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.branch.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tid, otherTid] } } })
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('findDoctorsForBranch (repository)', () => {
  it('returns the doctor assigned to the given branch', async () => {
    const result = await findDoctorsForBranch(tid, branchAId)
    expect(result.map(d => d.name)).toContain('Dr. Branch A')
  })

  it('excludes doctors not assigned to the given branch', async () => {
    const result = await findDoctorsForBranch(tid, branchBId)
    expect(result.map(d => d.name)).not.toContain('Dr. Branch A')
  })

  it('excludes a non-doctor user even if branch-assigned', async () => {
    const result = await findDoctorsForBranch(tid, branchAId)
    expect(result.map(d => d.name)).not.toContain('Staff Branch A')
  })

  it('returns doctors across all branches when branchId is null', async () => {
    const result = await findDoctorsForBranch(tid, null)
    expect(result.map(d => d.name)).toContain('Dr. Branch A')
  })

  it('never returns a doctor from another tenant', async () => {
    const otherBranch = await prisma.branch.create({ data: { tenantId: otherTid, name: 'Other Branch' } })
    const passwordHash = await bcrypt.hash(PASSWORD, 10)
    const otherDoctor = await prisma.user.create({
      data: { tenantId: otherTid, username: 'doctor_other', name: 'Dr. Other Tenant', passwordHash, roleId: doctorSystemRoleId, isActive: true },
    })
    await prisma.userBranch.create({ data: { tenantId: otherTid, userId: otherDoctor.id, branchId: otherBranch.id } })
    await prisma.userRole.create({ data: { tenantId: otherTid, userId: otherDoctor.id, roleId: doctorSystemRoleId } })

    // Even if IDs collide (branchAId vs otherBranch.id could differ), query tid + branchAId must never surface otherTid's doctor.
    const result = await findDoctorsForBranch(tid, branchAId)
    expect(result.map(d => d.name)).not.toContain('Dr. Other Tenant')
  })

  it('excludes deactivated doctors', async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10)
    const inactiveDoctor = await prisma.user.create({
      data: { tenantId: tid, username: 'doctor_inactive', name: 'Dr. Inactive', passwordHash, roleId: doctorSystemRoleId, branchId: branchAId, isActive: false },
    })
    await prisma.userBranch.create({ data: { tenantId: tid, userId: inactiveDoctor.id, branchId: branchAId } })
    await prisma.userRole.create({ data: { tenantId: tid, userId: inactiveDoctor.id, roleId: doctorSystemRoleId } })

    const result = await findDoctorsForBranch(tid, branchAId)
    expect(result.map(d => d.name)).not.toContain('Dr. Inactive')
  })

  it('includes a user whose custom role is cloned (sourceRoleId) from the system Doctor role', async () => {
    const cloned = await prisma.clinicRole.create({
      data: { tenantId: tid, key: `tenant_${tid}_custom_vet`, name: 'Custom Vet', isSystem: false, permVersion: 1, sourceRoleId: doctorSystemRoleId },
    })
    const passwordHash = await bcrypt.hash(PASSWORD, 10)
    const clonedUser = await prisma.user.create({
      data: { tenantId: tid, username: 'vet_custom', name: 'Custom Vet User', passwordHash, roleId: staffSystemRoleId, branchId: branchAId, isActive: true },
    })
    await prisma.userBranch.create({ data: { tenantId: tid, userId: clonedUser.id, branchId: branchAId } })
    await prisma.userRole.create({ data: { tenantId: tid, userId: clonedUser.id, roleId: cloned.id } })

    const result = await findDoctorsForBranch(tid, branchAId)
    expect(result.map(d => d.name)).toContain('Custom Vet User')
  })

  it('response objects contain only id and name', async () => {
    const result = await findDoctorsForBranch(tid, branchAId)
    for (const d of result) {
      expect(Object.keys(d).sort()).toEqual(['id', 'name'])
    }
  })
})

describe('findDoctorById (repository)', () => {
  it('returns the doctor when tenant matches', async () => {
    const doctorUser = await prisma.user.findFirstOrThrow({ where: { tenantId: tid, username: 'doctor_a' } })
    const result = await findDoctorById(tid, doctorUser.id)
    expect(result?.name).toBe('Dr. Branch A')
  })

  it('returns null for a doctor belonging to another tenant', async () => {
    const otherBranch = await prisma.branch.create({ data: { tenantId: otherTid, name: 'Cross-Tenant Branch' } })
    const passwordHash = await bcrypt.hash(PASSWORD, 10)
    const otherDoctor = await prisma.user.create({
      data: { tenantId: otherTid, username: 'doctor_crosscheck', name: 'Dr. Cross Tenant', passwordHash, roleId: doctorSystemRoleId, isActive: true },
    })
    await prisma.userBranch.create({ data: { tenantId: otherTid, userId: otherDoctor.id, branchId: otherBranch.id } })
    await prisma.userRole.create({ data: { tenantId: otherTid, userId: otherDoctor.id, roleId: doctorSystemRoleId } })

    const result = await findDoctorById(tid, otherDoctor.id)
    expect(result).toBeNull()
  })

  it('returns null for a non-doctor user in the same tenant', async () => {
    const staffUser = await prisma.user.findFirstOrThrow({ where: { tenantId: tid, username: 'staff_a' } })
    const result = await findDoctorById(tid, staffUser.id)
    expect(result).toBeNull()
  })

  it('returns null for a deactivated doctor', async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10)
    const inactiveDoctor = await prisma.user.create({
      data: { tenantId: tid, username: 'doctor_inactive_byid', name: 'Dr. Inactive ById', passwordHash, roleId: doctorSystemRoleId, branchId: branchAId, isActive: false },
    })
    await prisma.userRole.create({ data: { tenantId: tid, userId: inactiveDoctor.id, roleId: doctorSystemRoleId } })

    const result = await findDoctorById(tid, inactiveDoctor.id)
    expect(result).toBeNull()
  })
})

describe('GET /api/appointments/doctors', () => {
  it('returns 200 for clinic_staff and includes the branch-assigned doctor', async () => {
    const res = await request(server).get('/api/appointments/doctors').set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.map((d: { name: string }) => d.name)).toContain('Dr. Branch A')
  })

  it('returns 200 for a doctor-role user', async () => {
    const res = await request(server).get('/api/appointments/doctors').set('Authorization', `Bearer ${doctorToken}`)
    expect(res.status).toBe(200)
  })

  it('ignores a client-supplied branchId query param — branch comes from the session only', async () => {
    const res = await request(server).get(`/api/appointments/doctors?branchId=${branchBId}`).set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(200)
    // staffToken's session is bound to Branch A; a spoofed ?branchId=<Branch B> must not leak Branch B's data.
    expect(res.body.data.map((d: { name: string }) => d.name)).toContain('Dr. Branch A')
  })

  it('returns 401 with no auth token', async () => {
    const res = await request(server).get('/api/appointments/doctors')
    expect(res.status).toBe(401)
  })
})
