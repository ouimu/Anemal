/**
 * HOTFIX regression — GET /api/vaccinations/due-soon must never leak another
 * tenant's pet/owner PII, even when a vaccination row's petId FK points at a
 * pet in a different tenant (a data-integrity violation the schema does not
 * prevent: vaccinations.pet_id has no composite FK on tenant_id).
 */
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'

const SUB = `vax-due-soon-leak-test-${Date.now()}`
const PASSWORD = 'TestPass1!'

let server: Server
let tid = 0
let otherTid = 0
let adminToken = ''
let otherPetId = 0
let leakyVaccinationId = 0

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

  const passwordHash = await bcrypt.hash(PASSWORD, 4)

  const tenant = await prisma.tenant.create({ data: { name: 'Vax Due Soon Leak Test', subdomain: SUB } })
  tid = tenant.id
  const otherTenant = await prisma.tenant.create({ data: { name: 'Vax Due Soon Leak Test — Other', subdomain: SUB + '-other' } })
  otherTid = otherTenant.id

  const branch = await prisma.branch.create({ data: { tenantId: tid, name: 'Main' } })

  const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const adminUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Admin Leak', username: 'admin_leak', email: 'admin@leak.test', passwordHash, roleId: adminRole.id },
  })
  await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id, tenantId: tid } })
  adminToken = await login('admin_leak')

  // The other tenant's pet + owner — this PII must never appear in tid's response.
  const otherOwner = await prisma.owner.create({
    data: { tenantId: otherTid, firstName: 'Secret', lastName: 'Owner', phone: '0899999999' },
  })
  const otherPet = await prisma.pet.create({
    data: { tenantId: otherTid, ownerId: otherOwner.id, name: 'Secret Pet', species: 'Dog' },
  })
  otherPetId = otherPet.id

  // Simulate the data-integrity violation directly: a vaccination row owned by
  // tid whose petId FK points at a pet belonging to otherTid. The schema has
  // no composite FK tying vaccinations.tenantId/pets.tenantId together, so
  // this is a valid (if corrupt) row, not a Prisma-level constraint error.
  const nextDueAt = new Date()
  nextDueAt.setDate(nextDueAt.getDate() + 5)
  const leaky = await prisma.vaccination.create({
    data: {
      tenantId: tid,
      petId: otherPetId,
      vaccineName: 'Rabies',
      administeredAt: new Date(),
      nextDueAt,
    },
  })
  leakyVaccinationId = leaky.id
})

afterAll(async () => {
  await prisma.vaccination.deleteMany({ where: { id: leakyVaccinationId } })
  await prisma.pet.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.owner.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.userRole.deleteMany({ where: { tenantId: tid } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.branch.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tid, otherTid] } } })
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('GET /api/vaccinations/due-soon — cross-tenant PII leak', () => {
  it('never returns another tenant\'s pet name or owner PII', async () => {
    const res = await request(server)
      .get('/api/vaccinations/due-soon')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)

    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toContain('Secret Pet')
    expect(serialized).not.toContain('Secret')
    expect(serialized).not.toContain('0899999999')

    const leakedRow = res.body.data.find((row: { id: number }) => row.id === leakyVaccinationId)
    expect(leakedRow).toBeUndefined()
  })
})
