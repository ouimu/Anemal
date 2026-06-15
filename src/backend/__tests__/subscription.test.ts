/**
 * Test Suite: sub-3.4 — Subscription & plan enforcement (Phase 3)
 * @qa-agent | Protocol: qa-protocols.md §2 (RBAC) + §3 (edge cases)
 *
 * Run: npx jest --testPathPattern=subscription.test
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
let adminToken: string, staffToken: string
const SUB = `sub-${Date.now()}`

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })
  const hash = await bcrypt.hash('TestPass1!', 10)
  const ts = Date.now()
  const t = await prisma.tenant.create({ data: { name: 'Sub Clinic', subdomain: SUB } })
  tid = t.id
  // Starter plan (default). Start with a single admin user.
  const admin = await prisma.user.create({ data: { tenantId: tid, name: 'Admin', email: `sub-admin-${ts}@t.local`, passwordHash: hash, role: 'admin' } })
  const staff = await prisma.user.create({ data: { tenantId: tid, name: 'Staff', email: `sub-staff-${ts}@t.local`, passwordHash: hash, role: 'staff' } })
  adminToken = signToken({ userId: admin.id, tenantId: tid, plane: 'clinic', permSetVersion: 1, role: 'admin' })
  staffToken = signToken({ userId: staff.id, tenantId: tid, plane: 'clinic', permSetVersion: 1, role: 'staff' })

  await seedUserRoles(prisma, [
    { userId: admin.id, tenantId: tid, roleKey: 'clinic_admin' },
    { userId: staff.id, tenantId: tid, roleKey: 'clinic_staff' },
  ])
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await cleanupUserRoles(prisma, [tid])
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
})

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

describe('sub-3.4 — Subscription status & limits', () => {
  test('sub-01: admin sees plan status (starter, maxUsers 3)', async () => {
    const res = await request(server).get('/api/subscription/status').set(auth(adminToken)).expect(200)
    expect(res.body.data.planTier).toBe('starter')
    expect(res.body.data.limits.maxUsers).toBe(3)
    expect(res.body.data.usage.users).toBe(2)
  })

  test('sub-02: staff can read subscription status → 200 (clinic.profile.view is view-all)', async () => {
    await request(server).get('/api/subscription/status').set(auth(staffToken)).expect(200)
  })

  test('sub-03: user creation blocked once the plan limit is reached → 402', async () => {
    const ts = Date.now()
    // 2 active users already; starter limit is 3 → one more succeeds, the next is blocked.
    await request(server).post('/users').set(auth(adminToken))
      .send({ name: 'Doc', email: `sub-doc-${ts}@t.local`, password: 'TestPass1!', role: 'doctor' }).expect(201)
    const res = await request(server).post('/users').set(auth(adminToken))
      .send({ name: 'Extra', email: `sub-extra-${ts}@t.local`, password: 'TestPass1!', role: 'staff' }).expect(402)
    expect(res.body.code).toBe('PLAN_LIMIT_REACHED')
  })
})
