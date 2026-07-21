// @qa-agent — Integration test: GET /clinic/transactions
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { clearPermCache } from '../../services/permission.service'

const SUBDOMAIN = 'tx-test'
const PASSWORD  = 'TestPass1!'

let server: Server
let tid   = 0
let token = ''       // admin with billing.view
let noPermToken = '' // no permissions

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
  const tenant = await prisma.tenant.create({ data: { name: 'TX Test', subdomain: SUBDOMAIN } })
  tid = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId: tid, name: 'Main' } })

  const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const adminUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Admin TX', username: 'admin_tx', email: 'admin@tx.test', passwordHash, roleId: adminRole.id },
  })
  await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id, tenantId: tid } })

  const emptyRole = await prisma.clinicRole.create({
    data: { tenantId: tid, name: 'No Perm TX', key: 'no_perm_tx', permVersion: 1 },
  })
  const noPermUser = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'No Perm TX', username: 'noperm_tx', email: 'noperm@tx.test', passwordHash, roleId: emptyRole.id },
  })
  await prisma.userRole.create({ data: { userId: noPermUser.id, roleId: emptyRole.id, tenantId: tid } })
  await prisma.userBranch.create({ data: { userId: noPermUser.id, branchId: branch.id, tenantId: tid } })

  token       = await login('admin_tx')
  noPermToken = await login('noperm_tx')
})

afterAll(async () => {
  clearPermCache()
  await prisma.userBranch.deleteMany({ where: { tenantId: tid } })
  await prisma.userRole.deleteMany({ where: { tenantId: tid } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.clinicRole.deleteMany({ where: { tenantId: tid } })
  await prisma.branch.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('GET /clinic/transactions', () => {
  it('requires billing.view and returns data shape', async () => {
    const res = await request(server)
      .get('/clinic/transactions?period=today')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.rows)).toBe(true)
    expect(typeof res.body.data.total).toBe('number')
  })

  it('returns 403 without billing.view', async () => {
    const res = await request(server)
      .get('/clinic/transactions?period=today')
      .set('Authorization', `Bearer ${noPermToken}`)
    expect(res.status).toBe(403)
  })

  it('revenue-series returns series array', async () => {
    const res = await request(server)
      .get('/clinic/transactions/revenue-series?period=daily')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.series)).toBe(true)
  })
})
