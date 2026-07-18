/**
 * Test Suite: admin-usage-branch — GET /admin/usage must scope counts to the
 * caller's active branch (JWT branchId), not return tenant-wide totals when
 * a specific branch is selected. Regression for the clinic-admin dashboard
 * bug where switching branches via the top-nav switcher didn't change the
 * KPI numbers on the right-hand panel.
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
const SUB = `admusg-${Date.now()}`

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })
  const hash = await bcrypt.hash('TestPass1!', 10)
  const ts = Date.now()

  const tenant = await prisma.tenant.create({ data: { name: 'Admin Usage Branch Test', subdomain: SUB } })
  tid = tenant.id

  const branchA = await prisma.branch.create({ data: { tenantId: tid, name: 'Branch A' } })
  const branchB = await prisma.branch.create({ data: { tenantId: tid, name: 'Branch B' } })
  branchAId = branchA.id
  branchBId = branchB.id

  const admin = await prisma.user.create({
    data: { tenantId: tid, name: 'Admin', username: `admusg_${ts % 100000}`, email: `admusg-${ts}@t.local`, passwordHash: hash, role: 'admin' },
  })
  await seedUserRoles(prisma, [{ userId: admin.id, tenantId: tid, roleKey: 'clinic_admin' }])

  // 2 active pets in Branch A, 1 in Branch B, plus 1 unassigned (branchId = NULL) that must
  // appear under every branch (the NULL-branch visibility rule).
  const owner = await prisma.owner.create({ data: { tenantId: tid, firstName: 'O', lastName: 'Wner', phone: '0800000000' } })
  await prisma.pet.createMany({
    data: [
      { tenantId: tid, ownerId: owner.id, branchId: branchAId, name: 'PetA1', species: 'dog', isActive: true },
      { tenantId: tid, ownerId: owner.id, branchId: branchAId, name: 'PetA2', species: 'dog', isActive: true },
      { tenantId: tid, ownerId: owner.id, branchId: branchBId, name: 'PetB1', species: 'cat', isActive: true },
      { tenantId: tid, ownerId: owner.id, branchId: null,      name: 'PetNull', species: 'dog', isActive: true },
    ],
  })

  // 2 staff assigned (via userBranches) to Branch A, 1 to Branch B. The admin has no
  // branch assignment → counts under every branch (mirrors the real clinic admin).
  const [staffA1, staffA2, staffB1] = await Promise.all([
    prisma.user.create({ data: { tenantId: tid, name: 'StaffA1', username: `sa1_${ts % 100000}`, email: `sa1-${ts}@t.local`, passwordHash: hash, role: 'staff', isActive: true } }),
    prisma.user.create({ data: { tenantId: tid, name: 'StaffA2', username: `sa2_${ts % 100000}`, email: `sa2-${ts}@t.local`, passwordHash: hash, role: 'staff', isActive: true } }),
    prisma.user.create({ data: { tenantId: tid, name: 'StaffB1', username: `sb1_${ts % 100000}`, email: `sb1-${ts}@t.local`, passwordHash: hash, role: 'staff', isActive: true } }),
  ])
  await prisma.userBranch.createMany({
    data: [
      { tenantId: tid, userId: staffA1.id, branchId: branchAId },
      { tenantId: tid, userId: staffA2.id, branchId: branchAId },
      { tenantId: tid, userId: staffB1.id, branchId: branchBId },
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
  await prisma.pet.deleteMany({ where: { tenantId: tid } })
  await prisma.owner.deleteMany({ where: { tenantId: tid } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.branch.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
})

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

describe('GET /admin/usage — branch scoping', () => {
  test('with no branch selected (admin bypass), returns tenant-wide totals', async () => {
    const res = await request(server).get('/admin/usage').set(auth(tokenAllBranches)).expect(200)
    // 2 in A + 1 in B + 1 unassigned = 4
    expect(res.body.data.totalPets).toBe(4)
    // 3 staff created here + the admin itself (no branchId) = 4
    expect(res.body.data.totalUsers).toBe(4)
  })

  test('with Branch A selected, only Branch A pets/users are counted', async () => {
    const res = await request(server).get('/admin/usage').set(auth(tokenBranchA)).expect(200)
    // 2 Branch-A pets + the unassigned (NULL-branch) pet = 3
    expect(res.body.data.totalPets).toBe(3)
    // 2 Branch-A staff + the unassigned admin (shows in every branch) = 3
    expect(res.body.data.totalUsers).toBe(3)
  })

  test('with Branch B selected, only Branch B pets/users are counted', async () => {
    const res = await request(server).get('/admin/usage').set(auth(tokenBranchB)).expect(200)
    // 1 Branch-B pet + the unassigned (NULL-branch) pet = 2
    expect(res.body.data.totalPets).toBe(2)
    // 1 Branch-B staff + the unassigned admin = 2
    expect(res.body.data.totalUsers).toBe(2)
  })

  test('Branch A total differs from Branch B total (not silently "all")', async () => {
    const resA = await request(server).get('/admin/usage').set(auth(tokenBranchA)).expect(200)
    const resB = await request(server).get('/admin/usage').set(auth(tokenBranchB)).expect(200)
    expect(resA.body.data.totalPets).not.toBe(resB.body.data.totalPets)
  })

  test('a NULL-branch pet is counted under every branch (visibility rule)', async () => {
    // PetNull has branchId = NULL. It must appear in the all-branches total AND under each
    // specific branch — so its owner/vaccinations/donor records never outnumber the pet itself.
    const all = await request(server).get('/admin/usage').set(auth(tokenAllBranches)).expect(200)
    const inA = await request(server).get('/admin/usage').set(auth(tokenBranchA)).expect(200)
    const inB = await request(server).get('/admin/usage').set(auth(tokenBranchB)).expect(200)
    // Each branch total includes the NULL pet, so branch A (3) + branch B (2) exceeds all (4).
    expect(inA.body.data.totalPets + inB.body.data.totalPets).toBeGreaterThan(all.body.data.totalPets)
    expect(inA.body.data.totalPets).toBe(3)
    expect(inB.body.data.totalPets).toBe(2)
  })

  test('owner count is derived from the branch of the owner\'s pets', async () => {
    // The single fixture owner has pets in both branches, so they count under each branch
    // and under "all" — an owner belongs to a branch through their pets.
    const all  = await request(server).get('/admin/usage').set(auth(tokenAllBranches)).expect(200)
    const inA  = await request(server).get('/admin/usage').set(auth(tokenBranchA)).expect(200)
    const inB  = await request(server).get('/admin/usage').set(auth(tokenBranchB)).expect(200)
    expect(all.body.data.totalOwners).toBe(1)
    expect(inA.body.data.totalOwners).toBe(1)
    expect(inB.body.data.totalOwners).toBe(1)
  })
})
