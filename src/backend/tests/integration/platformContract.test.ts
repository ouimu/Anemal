/**
 * Pins representative frontend payload shapes against the REAL exported Zod
 * schemas (ADR-0005 D3) — catches silent frontend/backend drift on the
 * platform-console contracts without a cross-tree TypeScript import (ts-jest
 * rootDir '.' rejects reaching into src/frontend from src/backend — grill
 * F11 confirmed this is a spike, not the primary path; see the note at the
 * bottom of this file).
 *
 * Unit-style: no server, no supertest — pure `safeParse` calls against the
 * exported schema objects.
 */
import {
  createCustomerSchema,
  updateCustomerSchema,
  setQuotaSchema,
  updateProvisioningSchema,
} from '../../controllers/platform-customers.controller'
import { createPlanSchema, updatePlanSchema } from '../../controllers/platform-plans.controller'
import { updateAllSettingsSchema, updateSystemSettingSchema } from '../../controllers/system-settings.controller'
import request from 'supertest'
import { Server } from 'http'
import app from '../../app'
import prisma from '../../config/db'
import { signPlatformToken } from '../../config/jwt'

describe('platform contract — createCustomerSchema', () => {
  // KEEP IN SYNC with src/frontend/src/hooks/usePlatformCustomers.ts:122 (platformApi.post('/platform/customers', payload))
  it('accepts a representative valid create-customer payload', () => {
    const result = createCustomerSchema.safeParse({
      name: 'Acme Vet Clinic',
      subdomain: 'acme-vet',
      planId: 1,
    })
    expect(result.success).toBe(true)
  })
  it('rejects a payload missing a required field', () => {
    const result = createCustomerSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('platform contract — updateCustomerSchema', () => {
  // KEEP IN SYNC with src/frontend/src/hooks/usePlatformCustomers.ts:132 (platformApi.put(`/platform/customers/${id}`, payload))
  it('accepts a representative valid update-customer payload', () => {
    const result = updateCustomerSchema.safeParse({ name: 'Acme Vet Clinic Renamed' })
    expect(result.success).toBe(true)
  })
  it('rejects a payload with an unknown field (schema is .strict())', () => {
    const result = updateCustomerSchema.safeParse({ nonExistentField: 'x' })
    expect(result.success).toBe(false)
  })
})

describe('platform contract — setQuotaSchema', () => {
  // KEEP IN SYNC with src/frontend/src/hooks/usePlatformCustomers.ts:145 (platformApi.put(`/platform/customers/${id}/quota`, payload))
  it('accepts a representative valid quota payload', () => {
    const result = setQuotaSchema.safeParse({ maxBranches: 5, maxUsers: 20, maxOwners: 1000 })
    expect(result.success).toBe(true)
  })
  it('rejects a payload with the wrong type for a known field', () => {
    const result = setQuotaSchema.safeParse({ maxBranches: 'five' })
    expect(result.success).toBe(false)
  })
})

describe('platform contract — updateProvisioningSchema', () => {
  // KEEP IN SYNC with src/frontend/src/views/platform/CustomerDetailView.tsx (provisioning form submit)
  it('accepts a representative valid provisioning payload', () => {
    const result = updateProvisioningSchema.safeParse({
      s3Bucket: 'acme-vet-uploads',
      s3Region: 'ap-southeast-1',
      smtpHost: 'smtp.acme-vet.test',
      smtpPort: 587,
    })
    expect(result.success).toBe(true)
  })
  it('rejects a payload with the wrong type for a known field', () => {
    const result = updateProvisioningSchema.safeParse({ smtpPort: 'not-a-port' })
    expect(result.success).toBe(false)
  })
})

describe('platform contract — createPlanSchema', () => {
  // KEEP IN SYNC with src/frontend/src/hooks/usePlatformPlans.ts:88 (platformApi.post('/platform/plans', toWirePayload(payload)))
  it('accepts a representative valid create-plan payload', () => {
    const result = createPlanSchema.safeParse({
      key: 'pro_monthly',
      name: 'Pro Monthly',
      priceMonth: 1990,
      maxBranches: 3,
      maxUsers: 15,
    })
    expect(result.success).toBe(true)
  })
  it('rejects a payload missing a required field', () => {
    const result = createPlanSchema.safeParse({ name: 'Pro Monthly' })
    expect(result.success).toBe(false)
  })
})

describe('platform contract — updatePlanSchema', () => {
  // KEEP IN SYNC with src/frontend/src/hooks/usePlatformPlans.ts:98 (platformApi.put(`/platform/plans/${id}`, toWirePayload(payload)))
  it('accepts a representative valid update-plan payload', () => {
    const result = updatePlanSchema.safeParse({ name: 'Pro Monthly (Legacy)', isActive: false })
    expect(result.success).toBe(true)
  })
  it('rejects a payload with the wrong type for a known field', () => {
    const result = updatePlanSchema.safeParse({ priceMonth: 'not-a-price' })
    expect(result.success).toBe(false)
  })
})

describe('platform contract — updateAllSettingsSchema', () => {
  // KEEP IN SYNC with src/frontend/src/hooks/usePlatformSettings.ts:46 (platformApi.put('/platform/settings', payload))
  it('accepts a representative valid aggregate-settings payload', () => {
    const result = updateAllSettingsSchema.safeParse({
      appName: 'Anemal',
      baseUrl: 'https://anemal.app',
      maintenanceMode: false,
      trialDays: 14,
    })
    expect(result.success).toBe(true)
  })
  it('rejects a payload with the wrong type for a known field', () => {
    const result = updateAllSettingsSchema.safeParse({ trialDays: 'fourteen' })
    expect(result.success).toBe(false)
  })
})

describe('platform contract — updateSystemSettingSchema', () => {
  // Single-key PUT /platform/settings/:key — no dedicated frontend hook call site found
  // (the aggregate PUT /platform/settings above is what usePlatformSettings.ts uses);
  // included for completeness per ADR-0005 D3 scope (system-settings.controller.ts:9).
  it('accepts a representative valid single-key value payload', () => {
    const result = updateSystemSettingSchema.safeParse({ value: 'some-setting-value' })
    expect(result.success).toBe(true)
  })
  it('rejects a payload missing the required value field', () => {
    const result = updateSystemSettingSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('platform contract — company-type round-trip (D2, grill FX.1)', () => {
  let server: Server
  let platformToken = ''
  let platformUserId = 0
  let planId = 0
  let companyTypeId = 0
  let customerId = 0

  beforeAll(async () => {
    await new Promise<void>(resolve => { server = app.listen(0, resolve) })
    server.keepAliveTimeout = 0

    const platformUser = await prisma.platformUser.create({
      data: {
        name:         'PlatformContractSysAdmin',
        email:        'platform-contract-sysadmin@test.anemal',
        passwordHash: 'x',
        role:         'platform_super_admin',
      },
    })
    platformUserId = platformUser.id
    platformToken = signPlatformToken({ platformUserId: platformUser.id, plane: 'platform', role: 'platform_super_admin' })

    const plan = await prisma.plan.create({
      data: { key: `contract_d2_${Date.now()}`, name: 'Contract D2 Test Plan', priceMonth: 0, maxBranches: 1, maxUsers: 1 },
    })
    planId = plan.id

    const companyType = await prisma.companyType.create({
      data: { key: `contract_d2_ct_${Date.now()}`, nameEn: 'Contract D2 Company Type', nameTh: 'Contract D2 Company Type TH' },
    })
    companyTypeId = companyType.id
  })

  afterAll(async () => {
    if (customerId) await prisma.platformAuditLog.deleteMany({ where: { targetTenantId: customerId } })
    if (platformUserId) await prisma.platformAuditLog.deleteMany({ where: { performedByPlatformUserId: platformUserId } })
    if (customerId) await prisma.tenant.deleteMany({ where: { id: customerId } })
    if (companyTypeId) await prisma.companyType.deleteMany({ where: { id: companyTypeId } })
    if (planId) await prisma.plan.deleteMany({ where: { id: planId } })
    if (platformUserId) await prisma.platformUser.deleteMany({ where: { id: platformUserId } })
    await prisma.$disconnect()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }, 30000)

  it('round-trips companyTypeId through create -> unchanged update -> get without clearing it', async () => {
    const createRes = await request(server)
      .post('/platform/customers')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Contract D2 Customer', subdomain: `contract-d2-${Date.now()}`, planId, companyTypeId })
    expect(createRes.status).toBe(201)
    customerId = createRes.body.data.id as number

    const updateRes = await request(server)
      .put(`/platform/customers/${customerId}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Contract D2 Customer' })
    expect(updateRes.status).toBe(200)

    const getRes = await request(server)
      .get(`/platform/customers/${customerId}`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(getRes.status).toBe(200)
    expect(getRes.body.data.companyTypeId).toBe(companyTypeId)
  })
})

// Cross-tree import spike (optional, explicitly skippable per ADR-0005 D3): attempting
// `import type { CreateCustomerPayload } from '../../../frontend/src/...'` here was not
// pursued — ts-jest's `rootDir` for src/backend does not include src/frontend, and the
// grill (Step 3.5) already confirmed this is a spike, not the primary path. No config
// changes were made to work around it (ponytail-gate risk, out of this batch's scope).
