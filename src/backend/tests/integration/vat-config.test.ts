// Unit coverage for the 3-mode VAT formula (ADR-0020) — pure function, no DB/HTTP needed.
import { computeVat } from '../../services/invoice.service'

describe('computeVat — pure 3-mode formula (ADR-0020)', () => {
  it('none: no tax, total = taxable', () => {
    expect(computeVat('none', 7, 1000)).toEqual({ taxRate: 0, taxAmount: 0, totalAmount: 1000 })
  })

  it('exclusive: tax added on top', () => {
    expect(computeVat('exclusive', 7, 1000)).toEqual({ taxRate: 7, taxAmount: 70, totalAmount: 1070 })
  })

  it('inclusive: tax extracted, total unchanged', () => {
    const r = computeVat('inclusive', 7, 1070)
    expect(r.taxRate).toBe(7)
    expect(r.totalAmount).toBe(1070)
    expect(r.taxAmount).toBeCloseTo(70, 1)
  })

  it('inclusive + discount: discount applied before VAT extraction (ADR-0020 verified-correct case)', () => {
    // taxable = 1070 (inclusive price) - 100 (discount) = 970
    const r = computeVat('inclusive', 7, 970)
    expect(r.totalAmount).toBe(970)
    expect(r.taxAmount).toBeCloseTo(63.46, 1)
  })

  it('defensive clamp: out-of-range rate is clamped to [0,100] (BA Finding F4)', () => {
    expect(computeVat('exclusive', 150, 1000).taxRate).toBe(100)
    expect(computeVat('exclusive', -5, 1000).taxRate).toBe(0)
  })
})

import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { seedUserRoles, cleanupUserRoles } from '../helpers/seedUserRoles'

describe('VAT mode end-to-end — invoice reflects tenant TenantSettings, not request body', () => {
  const SUB = 'vat-config-e2e'
  const PASSWORD = 'TestPass1!'
  let server: Server
  let tid = 0
  let admin = ''
  let petId = 0

  beforeAll(async () => {
    await new Promise<void>(resolve => { server = app.listen(0, resolve) })
    server.keepAliveTimeout = 0

    const t = await prisma.tenant.create({ data: { name: 'VAT E2E', subdomain: SUB } })
    tid = t.id
    await prisma.branch.create({ data: { tenantId: tid, name: 'Main' } })
    const passwordHash = await bcrypt.hash(PASSWORD, 4)
    const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
    await prisma.user.create({ data: { tenantId: tid, name: 'Admin', username: 'vat_e2e_admin', email: 'vat@e2e.test', passwordHash, roleId: adminRole.id } })
    const u = await prisma.user.findFirstOrThrow({ where: { tenantId: tid, username: 'vat_e2e_admin' } })
    await seedUserRoles(prisma, [{ userId: u.id, tenantId: tid, roleKey: 'clinic_admin' }])

    const step1 = await request(server).post('/auth/login').send({ subdomain: SUB, username: 'vat_e2e_admin', password: PASSWORD })
    admin = step1.body.data.requiresBranchSelection === false
      ? step1.body.data.token
      : (await request(server).post('/auth/select-branch').send({ pendingToken: step1.body.data.pendingToken, branchId: step1.body.data.branches[0].id })).body.data.token

    // Admin's token carries branchId: null (all-branches scope, ADR — see phase4.test.ts).
    // Invoice creation needs a concrete branch, so switch to one via the real
    // switch-branch flow before using this token for /api/invoices calls.
    const branchRes = await request(server).get('/api/branches').set('Authorization', `Bearer ${admin}`)
    const branchId: number = branchRes.body.data[0].id
    const switchRes = await request(server)
      .post('/auth/switch-branch')
      .set('Authorization', `Bearer ${admin}`)
      .send({ branchId })
    admin = switchRes.body.data.token

    const ownerRes = await request(server).post('/api/owners').set('Authorization', `Bearer ${admin}`)
      .send({ firstName: 'Vat', lastName: 'Owner', phone: `09${Date.now()}`.slice(0, 10) })
    const petRes = await request(server).post('/api/pets').set('Authorization', `Bearer ${admin}`)
      .send({ ownerId: ownerRes.body.data.id, name: 'Taxy', species: 'dog' })
    petId = petRes.body.data.id
  })

  afterAll(async () => {
    await cleanupUserRoles(prisma, [tid])
    await prisma.tenantSettings.deleteMany({ where: { tenantId: tid } })
    await prisma.user.deleteMany({ where: { tenantId: tid } })
    await prisma.branch.deleteMany({ where: { tenantId: tid } })
    await prisma.tenant.deleteMany({ where: { id: tid } })
    await prisma.$disconnect()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  it('new tenant with no TenantSettings row defaults to exclusive/7% (BA Finding F3)', async () => {
    const res = await request(server).post('/api/invoices').set('Authorization', `Bearer ${admin}`)
      .send({ petId, items: [{ description: 'Exam', itemType: 'service', qty: 1, unitPrice: 100 }] })
    expect(res.status).toBe(201)
    expect(Number(res.body.data.taxRate)).toBe(7)
    expect(Number(res.body.data.taxAmount)).toBe(7)
    expect(Number(res.body.data.totalAmount)).toBe(107)
  })

  it('switching tenant to vatMode=none → new invoice has zero tax', async () => {
    await request(server).put('/api/settings/clinic').set('Authorization', `Bearer ${admin}`).send({ vatMode: 'none' })
    const res = await request(server).post('/api/invoices').set('Authorization', `Bearer ${admin}`)
      .send({ petId, items: [{ description: 'Exam', itemType: 'service', qty: 1, unitPrice: 100 }] })
    expect(res.status).toBe(201)
    expect(Number(res.body.data.taxAmount)).toBe(0)
    expect(Number(res.body.data.totalAmount)).toBe(100)
  })

  it('switching tenant to vatMode=inclusive, rate=10 → tax extracted, total unchanged', async () => {
    await request(server).put('/api/settings/clinic').set('Authorization', `Bearer ${admin}`).send({ vatMode: 'inclusive', vatRate: 10 })
    const res = await request(server).post('/api/invoices').set('Authorization', `Bearer ${admin}`)
      .send({ petId, items: [{ description: 'Exam', itemType: 'service', qty: 1, unitPrice: 110 }] })
    expect(res.status).toBe(201)
    expect(Number(res.body.data.totalAmount)).toBe(110)
    expect(Number(res.body.data.taxAmount)).toBeCloseTo(10, 1)
  })

  it('a client-supplied taxRate in the request body is rejected (breaking change, D2)', async () => {
    const res = await request(server).post('/api/invoices').set('Authorization', `Bearer ${admin}`)
      .send({ petId, items: [{ description: 'Exam', itemType: 'service', qty: 1, unitPrice: 100 }], taxRate: 99 })
    expect(res.status).toBe(400)
  })
})
