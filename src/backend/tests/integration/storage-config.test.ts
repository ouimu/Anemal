// Phase — Storage config API endpoint tests (SC-01–SC-09, ADR-0023)
// Same seed/token pattern as tests/integration/settings-api.test.ts.
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import prisma from '../../config/db'
import { seedUserRoles, cleanupUserRoles } from '../helpers/seedUserRoles'

// SC-07 proves a request reaches the real connect-test path and surfaces a
// classified SMB_* error rather than a 500/hang. A live dial to a
// non-routable address is what the plan specifies, but its OS-level TCP
// timeout exceeds Jest's budget and is CI-environment-dependent — the plan's
// own flagged fallback is to inject the factory instead, so createSmbClient
// is mocked for this one assertion; every other test in this file exercises
// the real route/controller/service stack unmocked.
jest.mock('../../config/smb-client', () => {
  const actual = jest.requireActual('../../config/smb-client')
  return {
    ...actual,
    createSmbClient: jest.fn((config: { host: string }) => ({
      connect: jest.fn().mockRejectedValue(new actual.SmbHostUnreachableError(config.host)),
      writeFile: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockResolvedValue(Buffer.from('')),
      unlink: jest.fn().mockResolvedValue(undefined),
      rename: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
      disconnect: jest.fn().mockResolvedValue(undefined),
    })),
  }
})

import app from '../../app'

const SUB_A = `storage-cfg-a-${Date.now()}`
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

  const tA = await prisma.tenant.create({ data: { name: 'Storage Cfg A', subdomain: SUB_A } })
  tidA = tA.id
  const branchA = await prisma.branch.create({ data: { tenantId: tidA, name: 'Main A' } })

  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  const [adminRole, doctorRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor',       tenantId: null } }),
  ])
  await prisma.user.createMany({
    data: [
      { tenantId: tidA, name: 'Admin A',  username: 'sc_admin_a',  email: 'admin@sc-a.test',  passwordHash, roleId: adminRole.id },
      { tenantId: tidA, name: 'Doctor A', username: 'sc_doctor_a', email: 'doctor@sc-a.test', passwordHash, roleId: doctorRole.id },
    ],
  })

  const [uAdminA, uDoctorA] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { tenantId: tidA, username: 'sc_admin_a'  } }),
    prisma.user.findFirstOrThrow({ where: { tenantId: tidA, username: 'sc_doctor_a' } }),
  ])
  await seedUserRoles(prisma, [
    { userId: uAdminA.id,  tenantId: tidA, roleKey: 'clinic_admin' },
    { userId: uDoctorA.id, tenantId: tidA, roleKey: 'doctor'       },
  ])
  await prisma.userBranch.createMany({
    data: [{ tenantId: tidA, userId: uDoctorA.id, branchId: branchA.id }],
    skipDuplicates: true,
  })

  adminToken  = await login(SUB_A, 'sc_admin_a')
  doctorToken = await login(SUB_A, 'sc_doctor_a')
})

afterAll(async () => {
  await cleanupUserRoles(prisma, [tidA])
  await prisma.settingsAuditLog.deleteMany({ where: { tenantId: tidA } })
  await prisma.tenantStorageConfig.deleteMany({ where: { tenantId: tidA } })
  await prisma.userBranch.deleteMany({ where: { tenantId: tidA } })
  await prisma.user.deleteMany({ where: { tenantId: tidA } })
  await prisma.branch.deleteMany({ where: { tenantId: tidA } })
  await prisma.tenant.deleteMany({ where: { id: tidA } })
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30000)

describe('GET /api/settings/clinic/storage-config', () => {
  test('SC-01: returns provider=local, configured=false for a tenant with no config row', async () => {
    const res = await request(server).get('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${adminToken}`).expect(200)
    expect(res.body.data).toEqual({ provider: 'local', configured: false })
  })

  test('SC-02: password is never present in the response, even for a configured custom_path tenant', async () => {
    await prisma.tenantStorageConfig.upsert({
      where: { tenantId: tidA },
      create: { tenantId: tidA, provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPasswordEncrypted: 'enc:v1:a:b:c' },
      update: { provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPasswordEncrypted: 'enc:v1:a:b:c' },
    })
    const res = await request(server).get('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${adminToken}`).expect(200)
    expect(JSON.stringify(res.body)).not.toMatch(/smbPassword/i)
    expect(res.body.data.configured).toBe(true)
    // reset back to local for the tests below
    await prisma.tenantStorageConfig.delete({ where: { tenantId: tidA } })
  })

  test('SC-03: doctor holding clinic.profile.view can read it too', async () => {
    await request(server).get('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${doctorToken}`).expect(200)
  })
})

describe('PUT /api/settings/clinic/storage-config', () => {
  test('SC-04: staff without clinic.integrations.edit → 403', async () => {
    await request(server).put('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ provider: 'local' }).expect(403)
  })

  test('SC-05: switching to custom_path without confirmBaseChange → 409, nothing persisted', async () => {
    const res = await request(server).put('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPassword: 'p' })
      .expect(409)
    expect(res.body.code).toBe('STORAGE_SWITCH_CONFIRMATION_REQUIRED')
  })

  test('SC-05b: first switch-away with all SMB fields blank (frontend save-with-empty-form repro) → 400 or 409, never 500', async () => {
    const res = await request(server).put('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'custom_path', smbHost: '', smbShare: '', smbUsername: '' })
    expect([400, 409]).toContain(res.status)
  })

  test('SC-06: format-invalid host (empty string) → 400, nothing persisted', async () => {
    await request(server).put('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'custom_path', smbHost: '', smbShare: 's', smbUsername: 'u', smbPassword: 'p', confirmBaseChange: true })
      .expect(400)
  })

  test('SC-07: valid submission with confirmBaseChange=true against a non-routable host — asserts a 400 SMB_* code, not a 500 or silent success, proving the request reaches the real connect-test path', async () => {
    const res = await request(server).put('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'custom_path', smbHost: '10.255.255.1', smbShare: 'nope', smbUsername: 'u', smbPassword: 'p', confirmBaseChange: true })
      .expect(400)
    expect(res.body.code).toMatch(/^SMB_/)
  })

  test('SC-08: reverting to local with confirmBaseChange=true → 200, configured becomes false', async () => {
    await prisma.tenantStorageConfig.upsert({
      where: { tenantId: tidA },
      create: { tenantId: tidA, provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPasswordEncrypted: 'enc:v1:a:b:c' },
      update: { provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPasswordEncrypted: 'enc:v1:a:b:c' },
    })
    await request(server).put('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'local', confirmBaseChange: true }).expect(200)
    const getRes = await request(server).get('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${adminToken}`).expect(200)
    expect(getRes.body.data).toEqual({ provider: 'local', configured: false })
  })

  test('SC-09: no token → 401 on both GET and PUT', async () => {
    await request(server).get('/api/settings/clinic/storage-config').expect(401)
    await request(server).put('/api/settings/clinic/storage-config').send({ provider: 'local' }).expect(401)
  })
})
