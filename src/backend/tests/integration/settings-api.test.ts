// Phase 1.5-B — Settings API endpoint tests (TC-S001–TC-S007)
// T-5C-03: system-settings now requires platform plane; superadmin row removed from users.
// @qa-agent — endpoint-level RBAC, tenant isolation, and encryption checks.
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { decryptField } from '../../utils/encryption'
import { testLab } from '../../services/connection-test.service'
import { signPlatformToken } from '../../config/jwt'
import { seedUserRoles, cleanupUserRoles } from '../helpers/seedUserRoles'

const SUB_A = 'settings-api-a'
const SUB_B = 'settings-api-b'
const PASSWORD = 'TestPass1!'

let server: Server
let tidA = 0
let tidB = 0
let adminA = ''
let adminB = ''
let staffA = ''
let doctorA = ''
let platformToken = ''
let platformUserId = 0

async function login(subdomain: string, username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const tA = await prisma.tenant.create({ data: { name: 'Settings API A', subdomain: SUB_A } })
  const tB = await prisma.tenant.create({ data: { name: 'Settings API B', subdomain: SUB_B } })
  tidA = tA.id
  tidB = tB.id

  const branchA = await prisma.branch.create({ data: { tenantId: tidA, name: 'Main A' } })
  await prisma.branch.create({ data: { tenantId: tidB, name: 'Main B' } })

  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  await prisma.user.createMany({
    data: [
      { tenantId: tidA, name: 'Admin A',  username: 'sapi_admin_a',  email: 'admin@a.test',  passwordHash, role: 'admin' },
      { tenantId: tidA, name: 'Staff A',  username: 'sapi_staff_a',  email: 'staff@a.test',  passwordHash, role: 'staff' },
      { tenantId: tidA, name: 'Doctor A', username: 'sapi_doctor_a', email: 'doctor@a.test', passwordHash, role: 'doctor' },
      { tenantId: tidB, name: 'Admin B',  username: 'sapi_admin_b',  email: 'admin@b.test',  passwordHash, role: 'admin' },
    ],
  })

  // T-5C-03: create a platform user for system-settings access
  const platformUser = await prisma.platformUser.create({
    data: {
      name:         'SysAdmin',
      email:        'sysadmin@test.anemal',
      passwordHash: 'x',
      role:         'platform_super_admin',
    },
  })
  platformUserId = platformUser.id
  platformToken = signPlatformToken({ platformUserId: platformUser.id, plane: 'platform', role: 'platform_super_admin' })

  // Seed UserRole rows so requirePermission() resolves permissions for these users
  const [uAdminA, uStaffA, uDoctorA, uAdminB] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { tenantId: tidA, username: 'sapi_admin_a'  } }),
    prisma.user.findFirstOrThrow({ where: { tenantId: tidA, username: 'sapi_staff_a'  } }),
    prisma.user.findFirstOrThrow({ where: { tenantId: tidA, username: 'sapi_doctor_a' } }),
    prisma.user.findFirstOrThrow({ where: { tenantId: tidB, username: 'sapi_admin_b' } }),
  ])
  await seedUserRoles(prisma, [
    { userId: uAdminA.id,  tenantId: tidA, roleKey: 'clinic_admin' },
    { userId: uStaffA.id,  tenantId: tidA, roleKey: 'clinic_staff' },
    { userId: uDoctorA.id, tenantId: tidA, roleKey: 'doctor'       },
    { userId: uAdminB.id,  tenantId: tidB, roleKey: 'clinic_admin' },
  ])

  await prisma.userBranch.createMany({
    data: [
      { tenantId: tidA, userId: uStaffA.id,  branchId: branchA.id },
      { tenantId: tidA, userId: uDoctorA.id, branchId: branchA.id },
    ],
    skipDuplicates: true,
  })

  adminA  = await login(SUB_A, 'sapi_admin_a')
  staffA  = await login(SUB_A, 'sapi_staff_a')
  doctorA = await login(SUB_A, 'sapi_doctor_a')
  adminB  = await login(SUB_B, 'sapi_admin_b')
})

afterAll(async () => {
  await cleanupUserRoles(prisma, [tidA, tidB])
  await prisma.settingsAuditLog.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.tenantSettings.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.userBranch.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.user.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.branch.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tidA, tidB] } } })
  if (platformUserId) {
    await prisma.platformAuditLog.deleteMany({ where: { performedByPlatformUserId: platformUserId } })
    await prisma.platformUser.deleteMany({ where: { email: 'sysadmin@test.anemal' } })
  }
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30000)

describe('TC-S001 — tenant isolation on GET /api/settings/clinic', () => {
  it('returns only own-tenant data for Clinic A admin', async () => {
    const res = await request(server).get('/api/settings/clinic').set('Authorization', `Bearer ${adminA}`)
    expect(res.status).toBe(200)
    expect(res.body.data.tenantId).toBe(tidA)
  })

  it('Clinic B admin never sees Clinic A values', async () => {
    await request(server)
      .put('/api/settings/clinic')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ phone: '02-111-1111' })
    const res = await request(server).get('/api/settings/clinic').set('Authorization', `Bearer ${adminB}`)
    expect(res.status).toBe(200)
    expect(res.body.data.tenantId).toBe(tidB)
    expect(res.body.data.phone).toBeNull()
  })
})

describe('TC-S002 — tenant_id in request body is rejected', () => {
  it('PUT /api/settings/clinic with tenantId in body → 400', async () => {
    const res = await request(server)
      .put('/api/settings/clinic')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ tenantId: tidB, phone: '02-999-9999' })
    expect(res.status).toBe(400)
  })

  it('PUT with snake_case tenant_id in body → 400', async () => {
    const res = await request(server)
      .put('/api/settings/clinic')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ tenant_id: tidB, phone: '02-999-9999' })
    expect(res.status).toBe(400)
  })
})

describe('TC-S003 — RBAC on clinic settings', () => {
  it('staff PUT /api/settings/clinic → 403', async () => {
    const res = await request(server)
      .put('/api/settings/clinic')
      .set('Authorization', `Bearer ${staffA}`)
      .send({ phone: '02-222-2222' })
    expect(res.status).toBe(403)
  })

  it('doctor PUT /api/settings/clinic → 403', async () => {
    const res = await request(server)
      .put('/api/settings/clinic')
      .set('Authorization', `Bearer ${doctorA}`)
      .send({ phone: '02-222-2222' })
    expect(res.status).toBe(403)
  })

  it('no token → 401', async () => {
    const res = await request(server).get('/api/settings/clinic')
    expect(res.status).toBe(401)
  })
})

describe('TC-S004 — system settings restricted to platform plane (T-5C-03)', () => {
  it('platform token GET /platform/settings → 200 with named object shape', async () => {
    const res = await request(server).get('/platform/settings').set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    // GET /platform/settings returns a named PlatformSettings object (not an array)
    expect(typeof res.body.data).toBe('object')
    expect(Array.isArray(res.body.data)).toBe(false)
    expect(res.body.data).toHaveProperty('appName')
  })

  it('clinic admin GET /platform/settings → 403 (wrong plane)', async () => {
    const res = await request(server).get('/platform/settings').set('Authorization', `Bearer ${adminA}`)
    expect(res.status).toBe(403)
  })

  it('staff GET /platform/settings → 403 (wrong plane)', async () => {
    const res = await request(server).get('/platform/settings').set('Authorization', `Bearer ${staffA}`)
    expect(res.status).toBe(403)
  })

  it('doctor GET /platform/settings → 403 (wrong plane)', async () => {
    const res = await request(server).get('/platform/settings').set('Authorization', `Bearer ${doctorA}`)
    expect(res.status).toBe(403)
  })

  it('no token GET /platform/settings → 401', async () => {
    const res = await request(server).get('/platform/settings')
    expect(res.status).toBe(401)
  })
})

describe('TC-S005/S006/S007 — secret encryption through the API', () => {
  const LINE_TOKEN = 'line-channel-token-xyz789'

  it('PUT /clinic/notifications stores ciphertext, never plaintext (TC-S005)', async () => {
    const res = await request(server)
      .put('/api/settings/clinic/notifications')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ lineOaToken: LINE_TOKEN, smsProvider: 'thaibulksms', smsApiKey: 'sms-key-abc123' })
    expect(res.status).toBe(200)

    const row = await prisma.tenantSettings.findUnique({ where: { tenantId: tidA } })
    expect(row!.lineOaToken!.startsWith('enc:v1:')).toBe(true)
    expect(row!.lineOaToken).not.toContain(LINE_TOKEN)
    expect(row!.smsApiKey!.startsWith('enc:v1:')).toBe(true)
    expect(row!.smsProvider).toBe('thaibulksms') // non-secret stays plaintext
  })

  it('GET /clinic masks secret fields (TC-S006)', async () => {
    const res = await request(server).get('/api/settings/clinic').set('Authorization', `Bearer ${adminA}`)
    expect(res.status).toBe(200)
    expect(res.body.data.lineOaToken).toBe('••••••••z789')
    expect(res.body.data.smsApiKey).toBe('••••••••c123')
  })

  it('PUT response also masks secrets', async () => {
    const res = await request(server)
      .put('/api/settings/clinic/payment')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ gbprimepaySecret: 'gb-secret-key-9999' })
    expect(res.status).toBe(200)
    expect(res.body.data.gbprimepaySecret).toBe('••••••••9999')
  })

  it('stored ciphertext decrypts back to the original value (TC-S007 endpoint-level)', async () => {
    const row = await prisma.tenantSettings.findUnique({ where: { tenantId: tidA } })
    expect(decryptField(row!.lineOaToken!)).toBe(LINE_TOKEN)
  })

  it('echoing the masked value back does NOT overwrite the stored secret', async () => {
    const res = await request(server)
      .put('/api/settings/clinic/notifications')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ lineOaToken: '••••••••z789', smsSenderName: 'MyClinic' })
    expect(res.status).toBe(200)
    const row = await prisma.tenantSettings.findUnique({ where: { tenantId: tidA } })
    expect(decryptField(row!.lineOaToken!)).toBe(LINE_TOKEN)
    expect(row!.smsSenderName).toBe('MyClinic')
  })
})

describe('operating hours (S2.1)', () => {
  it('PUT /clinic/hours roundtrips the weekly schedule', async () => {
    const operatingHours = {
      mon: { open: '08:00', close: '18:00' }, tue: { open: '08:00', close: '18:00' },
      wed: { open: '08:00', close: '18:00' }, thu: { open: '08:00', close: '18:00' },
      fri: { open: '08:00', close: '18:00' }, sat: { open: '09:00', close: '15:00' },
      sun: null,
    }
    const res = await request(server)
      .put('/api/settings/clinic/hours')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ operatingHours })
    expect(res.status).toBe(200)
    expect(res.body.data.operatingHours).toEqual(operatingHours)
  })

  it('rejects malformed time strings → 400', async () => {
    const res = await request(server)
      .put('/api/settings/clinic/hours')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ operatingHours: { mon: { open: '8am', close: '18:00' } } })
    expect(res.status).toBe(400)
  })
})

describe('personal preferences (S2.3) — all roles', () => {
  it('staff GET /api/settings/personal returns defaults', async () => {
    const res = await request(server).get('/api/settings/personal').set('Authorization', `Bearer ${staffA}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ language: 'th', defaultCalendarView: 'week', theme: 'light' })
  })

  it('staff PUT /api/settings/personal updates own preferences', async () => {
    const res = await request(server)
      .put('/api/settings/personal')
      .set('Authorization', `Bearer ${staffA}`)
      .send({ language: 'en', defaultCalendarView: 'day' })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ language: 'en', defaultCalendarView: 'day', theme: 'light' })
  })

  it('does not affect another user\'s preferences', async () => {
    const res = await request(server).get('/api/settings/personal').set('Authorization', `Bearer ${adminA}`)
    expect(res.status).toBe(200)
    expect(res.body.data.language).toBe('th')
  })

  it('rejects unsupported language → 400', async () => {
    const res = await request(server)
      .put('/api/settings/personal')
      .set('Authorization', `Bearer ${staffA}`)
      .send({ language: 'fr' })
    expect(res.status).toBe(400)
  })
})

describe('TC-S011 — PUT /platform/settings aggregate update', () => {
  afterAll(async () => {
    // Restore seeded defaults so other tests are not affected
    await prisma.systemSettings.updateMany({
      where: { key: { in: ['app_name', 'app_base_url', 'maintenance_mode', 'default_trial_days', 'smtp_host', 'smtp_port', 'smtp_from_email'] } },
      data: { updatedBy: null },
    })
    await prisma.systemSettings.update({ where: { key: 'app_name'          }, data: { value: 'Anemal' } })
    await prisma.systemSettings.update({ where: { key: 'app_base_url'      }, data: { value: 'https://app.anemal.co' } })
    await prisma.systemSettings.update({ where: { key: 'maintenance_mode'  }, data: { value: 'false' } })
    await prisma.systemSettings.update({ where: { key: 'default_trial_days'}, data: { value: '30' } })
    await prisma.systemSettings.update({ where: { key: 'smtp_port'         }, data: { value: '587' } })
    await prisma.settingsAuditLog.deleteMany({
      where: { tableName: 'system_settings', fieldName: { in: ['app_name', 'app_base_url', 'maintenance_mode', 'default_trial_days', 'smtp_port', 'smtp_from_email'] } },
    })
  })

  it('platform token PUT /platform/settings updates multiple keys → 200 + updated count', async () => {
    const res = await request(server)
      .put('/platform/settings')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ appName: 'Anemal Test', trialDays: 14, maintenanceMode: false })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.updated).toBe(3)
  })

  it('partial update — omitted fields are unchanged', async () => {
    const before = await request(server).get('/platform/settings').set('Authorization', `Bearer ${platformToken}`)
    // GET /platform/settings returns a named object (not an array)
    const portBefore = (before.body.data as { smtpPort: number | null }).smtpPort

    await request(server)
      .put('/platform/settings')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ appName: 'Anemal Partial' })

    const after = await request(server).get('/platform/settings').set('Authorization', `Bearer ${platformToken}`)
    const portAfter = (after.body.data as { smtpPort: number | null }).smtpPort
    expect(portAfter).toBe(portBefore)
  })

  it('boolean maintenanceMode coerces to "true"/"false" in DB', async () => {
    await request(server)
      .put('/platform/settings')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ maintenanceMode: true })
    const row = await prisma.systemSettings.findUnique({ where: { key: 'maintenance_mode' } })
    expect(row!.value).toBe('true')
  })

  it('numeric trialDays coerces to string in DB', async () => {
    await request(server)
      .put('/platform/settings')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ trialDays: 60 })
    const row = await prisma.systemSettings.findUnique({ where: { key: 'default_trial_days' } })
    expect(row!.value).toBe('60')
  })

  it('empty body returns updated: 0', async () => {
    const res = await request(server)
      .put('/platform/settings')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.data.updated).toBe(0)
  })

  it('invalid payload (bad URL) → 400', async () => {
    const res = await request(server)
      .put('/platform/settings')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ baseUrl: 'not-a-url' })
    expect(res.status).toBe(400)
  })

  it('unknown field in body → 400 (strict schema)', async () => {
    const res = await request(server)
      .put('/platform/settings')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ unknownField: 'value' })
    expect(res.status).toBe(400)
  })

  it('clinic admin PUT /platform/settings → 403 (wrong plane)', async () => {
    const res = await request(server)
      .put('/platform/settings')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ appName: 'Hacked' })
    expect(res.status).toBe(403)
  })

  it('no token PUT /platform/settings → 401', async () => {
    const res = await request(server).put('/platform/settings').send({ appName: 'X' })
    expect(res.status).toBe(401)
  })

  it('PUT /:key still works (backward compat)', async () => {
    const res = await request(server)
      .put('/platform/settings/smtp_port')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ value: '2525' })
    expect(res.status).toBe(200)
    // restore
    await prisma.systemSettings.update({ where: { key: 'smtp_port' }, data: { value: '587', updatedBy: null } })
    await prisma.settingsAuditLog.deleteMany({ where: { tableName: 'system_settings', fieldName: 'smtp_port' } })
  })
})

describe('stateless connection tests (S2.1) — fetch mocked', () => {
  const realFetch = global.fetch

  afterEach(() => { global.fetch = realFetch })

  it('POST /clinic/notifications/test with valid token → 200 + success (TC-S008)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response)
    const res = await request(server)
      .post('/api/settings/clinic/notifications/test')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ channel: 'line', lineOaToken: 'valid-token' })
    expect(res.status).toBe(200)
    expect(res.body.data.success).toBe(true)
  })

  it('POST /clinic/notifications/test with invalid token → 200 + error detail, not 500 (TC-S009)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 } as Response)
    const res = await request(server)
      .post('/api/settings/clinic/notifications/test')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ channel: 'line', lineOaToken: 'bad-token' })
    expect(res.status).toBe(200)
    expect(res.body.data.success).toBe(false)
    expect(res.body.data.detail).toContain('401')
  })

  it('POST /clinic/notifications/test for sms channel → 200 + result', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response)
    const res = await request(server)
      .post('/api/settings/clinic/notifications/test')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ channel: 'sms', smsProvider: 'thaibulksms', smsApiKey: 'test-key' })
    expect(res.status).toBe(200)
    expect(typeof res.body.data.success).toBe('boolean')
  })

  it('sms test with no API key stored → 200 + failure detail (no SMS key)', async () => {
    // adminB has no SMS key stored; provide smsProvider but no key → falls back to stored (empty)
    const res = await request(server)
      .post('/api/settings/clinic/notifications/test')
      .set('Authorization', `Bearer ${adminB}`)
      .send({ channel: 'sms', smsProvider: 'thaibulksms' })
    expect(res.status).toBe(200)
    expect(res.body.data.success).toBe(false)
    expect(res.body.data.detail).toMatch(/api key/i)
  })

  it('test endpoints never persist data', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response)
    const before = await prisma.tenantSettings.findUnique({ where: { tenantId: tidA } })
    await request(server)
      .post('/api/settings/clinic/integrations/test')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ labApiUrl: 'https://lab.example.com/api', labApiKey: 'lab-key-1' })
    const after = await prisma.tenantSettings.findUnique({ where: { tenantId: tidA } })
    expect(after).toEqual(before)
  })
})

describe('TC-S010 — integrations test-connection timeout', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch; jest.useRealTimers() })

  it('returns { success: false } within 10 s when target URL never responds', async () => {
    jest.useFakeTimers()
    // Unit-level: call testLab directly to avoid fake-timer/HTTP-I/O interference.
    // Mock rejects with a plain Error (name='AbortError') so failureDetail() recognises it —
    // DOMException is not instanceof Error in jest-environment-node.
    global.fetch = jest.fn((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('The operation was aborted.')
          e.name = 'AbortError'
          reject(e)
        })
      }),
    ) as unknown as typeof fetch

    const resultPromise = testLab('https://lab.example.com/api', 'lab-key-1')
    await jest.advanceTimersByTimeAsync(10_001)
    const result = await resultPromise

    expect(result.success).toBe(false)
    expect(result.detail).toMatch(/timed out/i)
  }, 15000)
})
