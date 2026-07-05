/**
 * Test Suite: owner-idcard — ID card validation (Owner ID Card sub-project)
 * @qa-agent | Protocol: qa-protocols.md §3 (edge cases)
 */
import { createOwnerSchema, isValidThaiId } from '../services/owner.service'
import request from 'supertest'
import { Server } from 'http'
import app from '../app'
import prisma from '../config/db'
import { signToken } from '../config/jwt'
import bcrypt from 'bcrypt'
import { seedUserRoles, cleanupUserRoles } from '../tests/helpers/seedUserRoles'

describe('isValidThaiId — Thai national ID mod-11 checksum', () => {
  test('accepts a valid 13-digit Thai ID', () => {
    // 1-1234-56789-40-1 style: digit-by-digit weighted sum, mod 11, checksum on 13th digit.
    // 1101700230503 satisfies the mod-11 checksum: weighted sum of first 12 digits mod 11, per the algorithm below.
    expect(isValidThaiId('1101700230503')).toBe(true)
  })

  test('rejects a 13-digit number with a bad checksum digit', () => {
    expect(isValidThaiId('1101700230504')).toBe(false)
  })

  test('rejects a string that is not 13 digits', () => {
    expect(isValidThaiId('123456789')).toBe(false)
    expect(isValidThaiId('11017002305031')).toBe(false) // 14 digits
  })

  test('rejects non-digit characters', () => {
    expect(isValidThaiId('110170023050A')).toBe(false)
  })
})

describe('createOwnerSchema — idCardType/idCardNumber', () => {
  const base = { firstName: 'Jane', lastName: 'Doe', phone: '0812345678' }

  test('accepts a valid thai_id', () => {
    const result = createOwnerSchema.safeParse({ ...base, idCardType: 'thai_id', idCardNumber: '1101700230503' })
    expect(result.success).toBe(true)
  })

  test('rejects thai_id with invalid checksum', () => {
    const result = createOwnerSchema.safeParse({ ...base, idCardType: 'thai_id', idCardNumber: '1101700230504' })
    expect(result.success).toBe(false)
  })

  test('accepts a valid passport (6-20 alphanumeric)', () => {
    const result = createOwnerSchema.safeParse({ ...base, idCardType: 'passport', idCardNumber: 'AB123456' })
    expect(result.success).toBe(true)
  })

  test('rejects passport shorter than 6 chars', () => {
    const result = createOwnerSchema.safeParse({ ...base, idCardType: 'passport', idCardNumber: 'AB12' })
    expect(result.success).toBe(false)
  })

  test('rejects passport longer than 20 chars', () => {
    const result = createOwnerSchema.safeParse({ ...base, idCardType: 'passport', idCardNumber: 'A'.repeat(21) })
    expect(result.success).toBe(false)
  })

  test('rejects idCardType without idCardNumber (both-or-neither)', () => {
    const result = createOwnerSchema.safeParse({ ...base, idCardType: 'thai_id' })
    expect(result.success).toBe(false)
  })

  test('rejects idCardNumber without idCardType (both-or-neither)', () => {
    const result = createOwnerSchema.safeParse({ ...base, idCardNumber: '1101700230503' })
    expect(result.success).toBe(false)
  })

  test('accepts omitting both idCardType and idCardNumber', () => {
    const result = createOwnerSchema.safeParse(base)
    expect(result.success).toBe(true)
  })
})

describe('Owner idCardNumber uniqueness (tenant-scoped)', () => {
  let server: Server
  let tidA: number, tidB: number
  let tokenA: string, tokenB: string
  const SUB_A = `owner-idc-a-${Date.now()}`
  const SUB_B = `owner-idc-b-${Date.now()}`
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

  beforeAll(async () => {
    await new Promise<void>((resolve) => { server = app.listen(0, resolve) })
    const hash = await bcrypt.hash('TestPass1!', 10)
    const ts = Date.now()
    const tA = await prisma.tenant.create({ data: { name: 'Owner IDC A', subdomain: SUB_A } })
    const tB = await prisma.tenant.create({ data: { name: 'Owner IDC B', subdomain: SUB_B } })
    tidA = tA.id; tidB = tB.id
    const uA = await prisma.user.create({ data: { tenantId: tidA, name: 'Admin A', username: `oidc_a_${ts % 100000}`, email: `oidc-a-${ts}@t.local`, passwordHash: hash, role: 'admin' } })
    const uB = await prisma.user.create({ data: { tenantId: tidB, name: 'Admin B', username: `oidc_b_${ts % 100000}`, email: `oidc-b-${ts}@t.local`, passwordHash: hash, role: 'admin' } })
    const bA = await prisma.branch.create({ data: { tenantId: tidA, name: 'Main' } })
    const bB = await prisma.branch.create({ data: { tenantId: tidB, name: 'Main' } })
    tokenA = signToken({ userId: uA.id, tenantId: tidA, branchId: bA.id, plane: 'clinic', permSetVersion: 1, role: 'admin' })
    tokenB = signToken({ userId: uB.id, tenantId: tidB, branchId: bB.id, plane: 'clinic', permSetVersion: 1, role: 'admin' })
    await seedUserRoles(prisma, [
      { userId: uA.id, tenantId: tidA, roleKey: 'clinic_admin' },
      { userId: uB.id, tenantId: tidB, roleKey: 'clinic_admin' },
    ])
  })

  afterAll(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await cleanupUserRoles(prisma, [tidA, tidB])
    await prisma.owner.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
    await prisma.branch.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
    await prisma.user.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
    await prisma.tenant.deleteMany({ where: { id: { in: [tidA, tidB] } } })
  })

  test('create rejects a duplicate idCardNumber within the same tenant → 409', async () => {
    await request(server).post('/api/owners').set(auth(tokenA))
      .send({ firstName: 'A', lastName: 'One', phone: '0810000001', idCardType: 'thai_id', idCardNumber: '1101700230503' })
      .expect(201)
    const res = await request(server).post('/api/owners').set(auth(tokenA))
      .send({ firstName: 'A', lastName: 'Two', phone: '0810000002', idCardType: 'thai_id', idCardNumber: '1101700230503' })
      .expect(409)
    expect(res.body.error).toMatch(/already registered/i)
  })

  test('same idCardNumber is allowed in a different tenant', async () => {
    const res = await request(server).post('/api/owners').set(auth(tokenB))
      .send({ firstName: 'B', lastName: 'One', phone: '0820000001', idCardType: 'thai_id', idCardNumber: '1101700230503' })
      .expect(201)
    expect(res.body.data.idCardNumber).toBe('1101700230503')
  })

  test('update rejects changing to a duplicate idCardNumber, excluding self', async () => {
    const o1 = await request(server).post('/api/owners').set(auth(tokenA))
      .send({ firstName: 'C', lastName: 'One', phone: '0810000003', idCardType: 'passport', idCardNumber: 'PPCCCCCC' })
      .expect(201)
    expect(o1.body.data.idCardNumber).toBe('PPCCCCCC')
    const o2 = await request(server).post('/api/owners').set(auth(tokenA))
      .send({ firstName: 'D', lastName: 'One', phone: '0810000004', idCardType: 'passport', idCardNumber: 'PPDDDDDD' })
      .expect(201)

    // Updating o2 to keep its own number should succeed (excludes self).
    await request(server).put(`/api/owners/${o2.body.data.id}`).set(auth(tokenA))
      .send({ idCardType: 'passport', idCardNumber: 'PPDDDDDD' })
      .expect(200)

    // Updating o2 to collide with o1's number should 409.
    const res = await request(server).put(`/api/owners/${o2.body.data.id}`).set(auth(tokenA))
      .send({ idCardType: 'passport', idCardNumber: 'PPCCCCCC' })
      .expect(409)
    expect(res.body.error).toMatch(/already registered/i)
  })
})
