// src/backend/tests/integration/pet-medical-degradation.test.ts
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { clearPermCache } from '../../services/permission.service'

const SUBDOMAIN = 'pet-med-degrade-test'
const PASSWORD  = 'TestPass1!'

let server: Server
let tid = 0
let petId = 0
let doctorToken = ''   // holds emr.view
let staffToken  = ''   // custom no-emr.view role
let unionToken  = ''   // custom no-emr.view role + doctor role (CR-01 union)

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  const tenant = await prisma.tenant.create({ data: { name: 'Pet Med Degrade Test', subdomain: SUBDOMAIN } })
  tid = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId: tid, name: 'Main' } })
  const owner = await prisma.owner.create({ data: { tenantId: tid, firstName: 'Jane', lastName: 'Doe', phone: '0800000000' } })
  const pet = await prisma.pet.create({ data: { tenantId: tid, ownerId: owner.id, name: 'Rex', species: 'canine' } })
  petId = pet.id

  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const doctorUserForRecord = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Doctor Owner PMD', username: 'doctor_owner_pmd', email: 'doctor_owner@pmd.test', passwordHash, role: 'doctor', roleId: doctorRole.id },
  })
  await prisma.medicalRecord.create({ data: { tenantId: tid, petId, doctorId: doctorUserForRecord.id, assessment: 'Checkup' } })
  await prisma.vaccination.create({ data: { tenantId: tid, petId, vaccineName: 'Rabies', administeredAt: new Date() } })

  // Custom role cloned from clinic_staff with emr.view/emr.attach toggled off (per BA CORR-1 —
  // removing a permission is never escalation, so this clone is always permitted).
  const clinicStaffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
  const staffPerms = await prisma.rolePermission.findMany({ where: { roleId: clinicStaffRole.id } })
  const noEmrRole = await prisma.clinicRole.create({ data: { tenantId: tid, key: 'no_emr_staff', name: 'No-EMR Staff', isSystem: false } })
  for (const rp of staffPerms) {
    if (rp.permissionCode.startsWith('emr.')) continue
    await prisma.rolePermission.create({ data: { roleId: noEmrRole.id, permissionCode: rp.permissionCode } })
  }

  const doctorUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Doctor PMD', username: 'doctor_pmd', email: 'doctor@pmd.test', passwordHash, role: 'doctor', roleId: doctorRole.id },
  })
  await prisma.userRole.create({ data: { userId: doctorUser.id, roleId: doctorRole.id, tenantId: tid } })
  await prisma.userBranch.create({ data: { userId: doctorUser.id, branchId: branch.id, tenantId: tid } })

  const noEmrUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Staff PMD', username: 'staff_pmd', email: 'staff@pmd.test', passwordHash, role: 'staff', roleId: noEmrRole.id },
  })
  await prisma.userRole.create({ data: { userId: noEmrUser.id, roleId: noEmrRole.id, tenantId: tid } })
  await prisma.userBranch.create({ data: { userId: noEmrUser.id, branchId: branch.id, tenantId: tid } })

  // Multi-role union (PET-MED-2 AC / CR-01): custom no-emr role + doctor role → emr.view resolves via union.
  const unionUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Union PMD', username: 'union_pmd', email: 'union@pmd.test', passwordHash, role: 'staff', roleId: noEmrRole.id },
  })
  await prisma.userRole.create({ data: { userId: unionUser.id, roleId: noEmrRole.id, tenantId: tid } })
  await prisma.userRole.create({ data: { userId: unionUser.id, roleId: doctorRole.id, tenantId: tid } })
  await prisma.userBranch.create({ data: { userId: unionUser.id, branchId: branch.id, tenantId: tid } })

  async function login(username: string): Promise<string> {
    const step1 = await request(server).post('/auth/login').send({ subdomain: SUBDOMAIN, username, password: PASSWORD })
    if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
    const { pendingToken, branches } = step1.body.data
    const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
    return step2.body.data.token as string
  }
  doctorToken = await login('doctor_pmd')
  staffToken  = await login('staff_pmd')
  unionToken  = await login('union_pmd')
})

afterAll(async () => {
  clearPermCache()
  await prisma.medicalRecord.deleteMany({ where: { tenantId: tid } })
  await prisma.vaccination.deleteMany({ where: { pet: { tenantId: tid } } })
  await prisma.rolePermission.deleteMany({ where: { role: { tenantId: tid } } })
  await prisma.userBranch.deleteMany({ where: { tenantId: tid } })
  await prisma.userRole.deleteMany({ where: { tenantId: tid } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.clinicRole.deleteMany({ where: { tenantId: tid } })
  await prisma.pet.deleteMany({ where: { tenantId: tid } })
  await prisma.owner.deleteMany({ where: { tenantId: tid } })
  await prisma.branch.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('GET /api/pets/:id — emr.view-gated medicalRecords/vaccinations', () => {
  it('doctor (has emr.view) sees medicalRecords and vaccinations', async () => {
    const res = await request(server).get(`/api/pets/${petId}`).set('Authorization', `Bearer ${doctorToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.medicalRecords).toHaveLength(1)
    expect(res.body.data.vaccinations).toHaveLength(1)
  })

  it('custom role without emr.view gets neither field, but still sees the pet', async () => {
    const res = await request(server).get(`/api/pets/${petId}`).set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Rex')
    expect(res.body.data.medicalRecords).toBeUndefined()
    expect(res.body.data.vaccinations).toBeUndefined()
  })

  it('multi-role union: no-emr custom role + doctor role still resolves emr.view and sees both fields (CR-01)', async () => {
    const res = await request(server).get(`/api/pets/${petId}`).set('Authorization', `Bearer ${unionToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.medicalRecords).toHaveLength(1)
    expect(res.body.data.vaccinations).toHaveLength(1)
  })
})
