/**
 * Test Suite: admin-pages-branch — GET /users, /api/blood-bank/*, /api/audit
 * must scope results to the caller's active branch (JWT branchId), matching
 * the clinic-admin dashboard's "select a branch → data reflects it" fix.
 * Users/audit actors with no branch assignment stay visible everywhere
 * (same NULL-branch rule as pets/usage).
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../app'
import prisma from '../config/db'
import { signToken } from '../config/jwt'
import bcrypt from 'bcrypt'
import { seedUserRoles, cleanupUserRoles } from '../tests/helpers/seedUserRoles'

let server: Server
let tid: number
let branchAId: number, branchBId: number
let tokenAllBranches: string, tokenBranchA: string, tokenBranchB: string
let staffAId: number, staffBId: number, staffUnassignedId: number
let donorAPetId: number, donorBPetId: number
const SUB = `admpg-${Date.now()}`

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })
  const hash = await bcrypt.hash('TestPass1!', 10)
  const ts = Date.now()

  const tenant = await prisma.tenant.create({ data: { name: 'Admin Pages Branch Test', subdomain: SUB } })
  tid = tenant.id

  const branchA = await prisma.branch.create({ data: { tenantId: tid, name: 'Branch A' } })
  const branchB = await prisma.branch.create({ data: { tenantId: tid, name: 'Branch B' } })
  branchAId = branchA.id
  branchBId = branchB.id

  const admin = await prisma.user.create({
    data: { tenantId: tid, name: 'Admin', username: `admpg_${ts % 100000}`, email: `admpg-${ts}@t.local`, passwordHash: hash, role: 'admin' },
  })
  await seedUserRoles(prisma, [{ userId: admin.id, tenantId: tid, roleKey: 'clinic_admin' }])

  // Users: one assigned to Branch A (via UserBranch join), one to Branch B, one unassigned (visible everywhere)
  const staffA = await prisma.user.create({
    data: { tenantId: tid, name: 'StaffA', username: `sa_${ts % 100000}`, email: `sa-${ts}@t.local`, passwordHash: hash, role: 'staff' },
  })
  const staffB = await prisma.user.create({
    data: { tenantId: tid, name: 'StaffB', username: `sb_${ts % 100000}`, email: `sb-${ts}@t.local`, passwordHash: hash, role: 'staff' },
  })
  const staffUnassigned = await prisma.user.create({
    data: { tenantId: tid, name: 'StaffU', username: `su_${ts % 100000}`, email: `su-${ts}@t.local`, passwordHash: hash, role: 'staff' },
  })
  staffAId = staffA.id; staffBId = staffB.id; staffUnassignedId = staffUnassigned.id
  await prisma.userBranch.createMany({
    data: [
      { tenantId: tid, userId: staffA.id, branchId: branchAId },
      { tenantId: tid, userId: staffB.id, branchId: branchBId },
    ],
  })

  // Pets + donors: one pet/donor in Branch A, one in Branch B
  const owner = await prisma.owner.create({ data: { tenantId: tid, firstName: 'O', lastName: 'Wner', phone: '0800000001' } })
  const petA = await prisma.pet.create({ data: { tenantId: tid, ownerId: owner.id, branchId: branchAId, name: 'PetA', species: 'dog' } })
  const petB = await prisma.pet.create({ data: { tenantId: tid, ownerId: owner.id, branchId: branchBId, name: 'PetB', species: 'cat' } })
  donorAPetId = petA.id; donorBPetId = petB.id
  await prisma.bloodDonor.create({ data: { tenantId: tid, petId: petA.id, bloodType: 'DEA 1.1+' } })
  await prisma.bloodDonor.create({ data: { tenantId: tid, petId: petB.id, bloodType: 'DEA 1.1-' } })

  // Audit log rows: one actor from Branch A, one from Branch B, one system (null actor)
  await prisma.auditLog.createMany({
    data: [
      { tenantId: tid, userId: staffA.id, action: 'POST /test-a' },
      { tenantId: tid, userId: staffB.id, action: 'POST /test-b' },
      { tenantId: tid, userId: null,      action: 'SYSTEM /test-sys' },
    ],
  })

  tokenAllBranches = signToken({ userId: admin.id, tenantId: tid, plane: 'clinic', permSetVersion: 1, role: 'admin' })
  tokenBranchA = signToken({ userId: admin.id, tenantId: tid, branchId: branchAId, plane: 'clinic', permSetVersion: 1, role: 'admin' })
  tokenBranchB = signToken({ userId: admin.id, tenantId: tid, branchId: branchBId, plane: 'clinic', permSetVersion: 1, role: 'admin' })
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await cleanupUserRoles(prisma, [tid])
  await prisma.auditLog.deleteMany({ where: { tenantId: tid } })
  await prisma.bloodDonor.deleteMany({ where: { tenantId: tid } })
  await prisma.pet.deleteMany({ where: { tenantId: tid } })
  await prisma.owner.deleteMany({ where: { tenantId: tid } })
  await prisma.userBranch.deleteMany({ where: { tenantId: tid } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.branch.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
})

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

describe('GET /users — branch scoping', () => {
  test('all branches: sees every user', async () => {
    const res = await request(server).get('/users').set(auth(tokenAllBranches)).expect(200)
    const ids = res.body.data.map((u: { id: number }) => u.id)
    expect(ids).toEqual(expect.arrayContaining([staffAId, staffBId, staffUnassignedId]))
  })

  test('Branch A: sees StaffA + unassigned, not StaffB', async () => {
    const res = await request(server).get('/users').set(auth(tokenBranchA)).expect(200)
    const ids = res.body.data.map((u: { id: number }) => u.id)
    expect(ids).toContain(staffAId)
    expect(ids).toContain(staffUnassignedId)
    expect(ids).not.toContain(staffBId)
  })

  test('Branch B: sees StaffB + unassigned, not StaffA', async () => {
    const res = await request(server).get('/users').set(auth(tokenBranchB)).expect(200)
    const ids = res.body.data.map((u: { id: number }) => u.id)
    expect(ids).toContain(staffBId)
    expect(ids).toContain(staffUnassignedId)
    expect(ids).not.toContain(staffAId)
  })
})

describe('GET /api/blood-bank/donors — branch scoping', () => {
  test('Branch A: sees only the Branch A donor', async () => {
    const res = await request(server).get('/api/blood-bank/donors').set(auth(tokenBranchA)).expect(200)
    const petIds = res.body.data.map((d: { petId: number }) => d.petId)
    expect(petIds).toContain(donorAPetId)
    expect(petIds).not.toContain(donorBPetId)
  })

  test('Branch B: sees only the Branch B donor', async () => {
    const res = await request(server).get('/api/blood-bank/donors').set(auth(tokenBranchB)).expect(200)
    const petIds = res.body.data.map((d: { petId: number }) => d.petId)
    expect(petIds).toContain(donorBPetId)
    expect(petIds).not.toContain(donorAPetId)
  })

  test('all branches: sees both donors', async () => {
    const res = await request(server).get('/api/blood-bank/donors').set(auth(tokenAllBranches)).expect(200)
    const petIds = res.body.data.map((d: { petId: number }) => d.petId)
    expect(petIds).toEqual(expect.arrayContaining([donorAPetId, donorBPetId]))
  })
})

describe('GET /api/audit — branch scoping', () => {
  test('Branch A: sees StaffA + system rows, not StaffB', async () => {
    const res = await request(server).get('/api/audit?limit=100').set(auth(tokenBranchA)).expect(200)
    const actions = res.body.data.items.map((i: { action: string }) => i.action)
    expect(actions).toContain('POST /test-a')
    expect(actions).toContain('SYSTEM /test-sys')
    expect(actions).not.toContain('POST /test-b')
  })

  test('Branch B: sees StaffB + system rows, not StaffA', async () => {
    const res = await request(server).get('/api/audit?limit=100').set(auth(tokenBranchB)).expect(200)
    const actions = res.body.data.items.map((i: { action: string }) => i.action)
    expect(actions).toContain('POST /test-b')
    expect(actions).toContain('SYSTEM /test-sys')
    expect(actions).not.toContain('POST /test-a')
  })

  test('all branches: sees every row', async () => {
    const res = await request(server).get('/api/audit?limit=100').set(auth(tokenAllBranches)).expect(200)
    const actions = res.body.data.items.map((i: { action: string }) => i.action)
    expect(actions).toEqual(expect.arrayContaining(['POST /test-a', 'POST /test-b', 'SYSTEM /test-sys']))
  })
})
