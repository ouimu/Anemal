// Phase 1.5-A — settings DB + encryption integration tests (TC-S005, TC-S006 service-level)
// Endpoint-level tests (auth/RBAC) arrive with the Phase 1.5-B API.
import prisma from '../../config/db'
import * as tenantSettingsService from '../../services/tenant-settings.service'
import * as systemSettingsService from '../../services/system-settings.service'

const SUB_A = 'settings-a-test'
const SUB_B = 'settings-b-test'
let tidA = 0
let tidB = 0
let userA = 0

beforeAll(async () => {
  const tA = await prisma.tenant.create({ data: { name: 'Settings A', subdomain: SUB_A } })
  const tB = await prisma.tenant.create({ data: { name: 'Settings B', subdomain: SUB_B } })
  tidA = tA.id
  tidB = tB.id
  const u = await prisma.user.create({
    data: { tenantId: tidA, name: 'Settings Admin', username: 'settings_admin_a', email: 'admin@settings-a.test', passwordHash: 'x', role: 'admin' },
  })
  userA = u.id
})

afterAll(async () => {
  await prisma.settingsAuditLog.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.tenantSettings.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.user.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tidA, tidB] } } })
  await prisma.$disconnect()
})

describe('tenant settings — auto-create (S2.4)', () => {
  it('creates a settings row on first access via upsert', async () => {
    const settings = await tenantSettingsService.getSettings(tidA)
    expect(settings.tenantId).toBe(tidA)
  })
})

describe('tenant settings — secret encryption (TC-S005, TC-S006)', () => {
  const PLAIN_KEY = 'sk-test-secret-1234'

  it('stores secret fields as ciphertext, never plaintext (TC-S005)', async () => {
    await tenantSettingsService.updateSettings(tidA, { smsApiKey: PLAIN_KEY, smsProvider: 'thaibulksms' }, userA)
    const row = await prisma.tenantSettings.findUnique({ where: { tenantId: tidA } })
    expect(row!.smsApiKey).toBeTruthy()
    expect(row!.smsApiKey!.startsWith('enc:v1:')).toBe(true)
    expect(row!.smsApiKey).not.toContain(PLAIN_KEY)
    expect(row!.smsProvider).toBe('thaibulksms') // non-secret stays plaintext
    expect(row!.updatedBy).toBe(userA)
  })

  it('masks secret fields on read (TC-S006)', async () => {
    const settings = await tenantSettingsService.getSettings(tidA)
    expect(settings.smsApiKey).toBe('••••••••1234')
  })

  it('returns plaintext via getDecryptedSettings (internal)', async () => {
    const settings = await tenantSettingsService.getDecryptedSettings(tidA)
    expect(settings.smsApiKey).toBe(PLAIN_KEY)
  })

  it('writes a masked audit row per changed field', async () => {
    const rows = await prisma.settingsAuditLog.findMany({
      where: { tenantId: tidA, tableName: 'tenant_settings' },
      orderBy: { changedAt: 'asc' },
    })
    const fields = rows.map(r => r.fieldName)
    expect(fields).toContain('smsApiKey')
    expect(fields).toContain('smsProvider')
    const secretRow = rows.find(r => r.fieldName === 'smsApiKey')!
    expect(secretRow.newValue).toBe('••••••••1234')
    expect(secretRow.newValue).not.toContain(PLAIN_KEY)
    expect(secretRow.changedBy).toBe(userA)
  })

  it('does not write audit rows when nothing changed', async () => {
    const before = await prisma.settingsAuditLog.count({ where: { tenantId: tidA } })
    await tenantSettingsService.updateSettings(tidA, { smsProvider: 'thaibulksms' }, userA)
    const after = await prisma.settingsAuditLog.count({ where: { tenantId: tidA } })
    expect(after).toBe(before)
  })

  it('stores operating hours JSON', async () => {
    const hours = { mon: { open: '08:00', close: '18:00' }, sun: null }
    await tenantSettingsService.updateSettings(tidA, { operatingHours: hours }, userA)
    const row = await prisma.tenantSettings.findUnique({ where: { tenantId: tidA } })
    expect(row!.operatingHours).toEqual(hours)
  })
})

describe('tenant settings — isolation (TC-S001 service-level)', () => {
  it('tenant B never sees tenant A values', async () => {
    const b = await tenantSettingsService.getSettings(tidB)
    expect(b.tenantId).toBe(tidB)
    expect(b.smsApiKey).toBeNull()
    expect(b.smsProvider).toBeNull()
  })
})

describe('system settings (S1.2)', () => {
  it('has the 10 seeded default rows', async () => {
    const rows = await systemSettingsService.getAll()
    expect(rows.length).toBeGreaterThanOrEqual(10)
    const keys = rows.map(r => r.key)
    for (const k of ['app_name', 'app_base_url', 'maintenance_mode', 'default_trial_days',
                     'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password',
                     'smtp_from_email', 'smtp_from_name']) {
      expect(keys).toContain(k)
    }
  })

  it('encrypts secret values and masks them on read; audits with tenantId NULL', async () => {
    await systemSettingsService.updateByKey('smtp_password', 'smtp-secret-pw99', userA)
    const raw = await prisma.systemSettings.findUnique({ where: { key: 'smtp_password' } })
    expect(raw!.value.startsWith('enc:v1:')).toBe(true)

    const masked = await systemSettingsService.getByKey('smtp_password')
    expect(masked.value).toBe('••••••••pw99')

    const audit = await prisma.settingsAuditLog.findFirst({
      where: { tableName: 'system_settings', fieldName: 'smtp_password' },
      orderBy: { changedAt: 'desc' },
    })
    expect(audit).toBeTruthy()
    expect(audit!.tenantId).toBeNull()
    expect(audit!.newValue).toBe('••••••••pw99')

    // cleanup so reruns keep a clean platform row
    await prisma.systemSettings.update({ where: { key: 'smtp_password' }, data: { value: '', updatedBy: null } })
    await prisma.settingsAuditLog.deleteMany({ where: { tableName: 'system_settings', fieldName: 'smtp_password' } })
  })

  it('updates non-secret values as plaintext', async () => {
    const updated = await systemSettingsService.updateByKey('smtp_port', '2525', userA)
    expect(updated.value).toBe('2525')
    const raw = await prisma.systemSettings.findUnique({ where: { key: 'smtp_port' } })
    expect(raw!.value).toBe('2525')
    // restore default
    await prisma.systemSettings.update({ where: { key: 'smtp_port' }, data: { value: '587', updatedBy: null } })
    await prisma.settingsAuditLog.deleteMany({ where: { tableName: 'system_settings', fieldName: 'smtp_port' } })
  })

  it('throws NotFound for unknown key', async () => {
    await expect(systemSettingsService.getByKey('no_such_key')).rejects.toThrow('not found')
  })
})
