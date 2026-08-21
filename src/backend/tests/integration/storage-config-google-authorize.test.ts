// src/backend/tests/integration/storage-config-google-authorize.test.ts
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import prisma from '../../config/db'
import { seedUserRoles, cleanupUserRoles } from '../helpers/seedUserRoles'
import app from '../../app'

const SUB_A = `storage-gdrive-auth-a-${Date.now()}`
const PASSWORD = 'TestPass1!'

let server: Server
let tidA = 0
let adminToken = ''
let doctorToken = ''

async function login(subdomain: string, username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain, username, password: PASSWORD })
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

  const tA = await prisma.tenant.create({ data: { name: 'Storage GDrive Auth A', subdomain: SUB_A } })
  tidA = tA.id
  const branchA = await prisma.branch.create({ data: { tenantId: tidA, name: 'Main A' } })
  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  const [adminRole, doctorRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor',       tenantId: null } }),
  ])
  await prisma.user.createMany({
    data: [
      { tenantId: tidA, name: 'Admin A',  username: 'gda_admin_a',  email: 'admin@gda-a.test',  passwordHash, roleId: adminRole.id },
      { tenantId: tidA, name: 'Doctor A', username: 'gda_doctor_a', email: 'doctor@gda-a.test', passwordHash, roleId: doctorRole.id },
    ],
  })
  const [uAdminA, uDoctorA] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { tenantId: tidA, username: 'gda_admin_a'  } }),
    prisma.user.findFirstOrThrow({ where: { tenantId: tidA, username: 'gda_doctor_a' } }),
  ])
  await seedUserRoles(prisma, [
    { userId: uAdminA.id,  tenantId: tidA, roleKey: 'clinic_admin' },
    { userId: uDoctorA.id, tenantId: tidA, roleKey: 'doctor'       },
  ])
  await prisma.userBranch.createMany({ data: [{ tenantId: tidA, userId: uDoctorA.id, branchId: branchA.id }], skipDuplicates: true })
  adminToken  = await login(SUB_A, 'gda_admin_a')
  doctorToken = await login(SUB_A, 'gda_doctor_a')
})

afterAll(async () => {
  await cleanupUserRoles(prisma, [tidA])
  await prisma.oAuthConnectNonce.deleteMany({ where: { tenantId: tidA } })
  await prisma.userBranch.deleteMany({ where: { tenantId: tidA } })
  await prisma.user.deleteMany({ where: { tenantId: tidA } })
  await prisma.branch.deleteMany({ where: { tenantId: tidA } })
  await prisma.tenant.deleteMany({ where: { id: tidA } })
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30000)

describe('GET /api/settings/clinic/storage-config/google/authorize', () => {
  const ORIGINAL_ENV = process.env

  afterEach(() => { process.env = { ...ORIGINAL_ENV } })

  test('GA-01: with OAuth env vars configured, returns a Google consent URL and records a nonce', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret'
    const res = await request(server).get('/api/settings/clinic/storage-config/google/authorize')
      .set('Authorization', `Bearer ${adminToken}`).expect(200)
    expect(res.body.data.url).toContain('accounts.google.com')
    expect(res.body.data.url).toContain('client_id=test-client-id')
    expect(res.body.data.url).toContain('prompt=consent')
    expect(res.body.data.url).toContain('access_type=offline')
    expect(res.body.data.url).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file')
    const nonceRows = await prisma.oAuthConnectNonce.count({ where: { tenantId: tidA, provider: 'google' } })
    expect(nonceRows).toBe(1)
  })

  test('GA-02: missing GOOGLE_OAUTH_CLIENT_ID → 503 GOOGLE_OAUTH_NOT_CONFIGURED, nothing recorded (grill N-6)', async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret'
    const res = await request(server).get('/api/settings/clinic/storage-config/google/authorize')
      .set('Authorization', `Bearer ${adminToken}`).expect(503)
    expect(res.body.code).toBe('GOOGLE_OAUTH_NOT_CONFIGURED')
  })

  test('GA-03: doctor without clinic.integrations.edit → 403', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret'
    await request(server).get('/api/settings/clinic/storage-config/google/authorize')
      .set('Authorization', `Bearer ${doctorToken}`).expect(403)
  })

  test('GA-04: no token → 401', async () => {
    await request(server).get('/api/settings/clinic/storage-config/google/authorize').expect(401)
  })
})
