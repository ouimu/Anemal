/**
 * Test Suite: upload-e — S3 Presigned URL Photo Upload (Session E)
 * @qa-agent | Protocol: qa-protocols.md §1 (isolation) + §3 (edge cases)
 *
 * AWS SDK is fully mocked — no real S3 calls required.
 * Run: npx jest --testPathPattern=upload.test
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../app'
import prisma from '../config/db'
import { signToken } from '../config/jwt'
import bcrypt from 'bcrypt'
import { seedUserRoles, cleanupUserRoles } from '../tests/helpers/seedUserRoles'

// ── AWS SDK mocks ─────────────────────────────────────────────────────────────
// MOCK_SIGNED_URL must be a literal here — jest.mock() is hoisted before const declarations.
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn().mockResolvedValue({}) })),
    PutObjectCommand: jest.fn().mockImplementation((params) => ({ ...params })),
  }
})

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-bucket.s3.mock-region.amazonaws.com/upload-url?sig=xxx'),
}))

const MOCK_SIGNED_URL = 'https://mock-bucket.s3.mock-region.amazonaws.com/upload-url?sig=xxx'

import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PutObjectCommand } from '@aws-sdk/client-s3'

const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>
const mockPutObjectCommand = PutObjectCommand as jest.MockedClass<typeof PutObjectCommand>

// ── Fixtures ──────────────────────────────────────────────────────────────────
let server: Server
let tenantId: number
let adminToken: string

const SUBDOMAIN = `upload-test-${Date.now()}`

// Store original env vars to restore after each test
const ORIGINAL_ENV = {
  AWS_REGION:             process.env.AWS_REGION,
  AWS_BUCKET:             process.env.AWS_BUCKET,
  AWS_ACCESS_KEY_ID:      process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY:  process.env.AWS_SECRET_ACCESS_KEY,
}

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })

  const hash = await bcrypt.hash('TestPass1!', 10)
  const tenant = await prisma.tenant.create({ data: { name: 'Upload Test Clinic', subdomain: SUBDOMAIN } })
  tenantId = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId, name: 'Main' } })
  const uploadTs = Date.now()
  const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const user = await prisma.user.create({
    data: { tenantId, name: 'Upload Admin', username: `upload_adm_${uploadTs % 100000}`, email: `upload-${uploadTs}@test.local`, passwordHash: hash, roleId: adminRole.id },
  })
  adminToken = signToken({ userId: user.id, tenantId, branchId: branch.id, plane: 'clinic', permSetVersion: 1, role: 'admin' })

  await seedUserRoles(prisma, [
    { userId: user.id, tenantId, roleKey: 'clinic_admin' },
  ])
})

beforeEach(() => {
  jest.clearAllMocks()
  // Reset env vars to configured state before each test
  process.env.AWS_REGION            = 'ap-southeast-1'
  process.env.AWS_BUCKET            = 'test-vet-bucket'
  process.env.AWS_ACCESS_KEY_ID     = 'AKIAIOSFODNN7EXAMPLE'
  process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
  mockGetSignedUrl.mockResolvedValue(MOCK_SIGNED_URL)
})

afterEach(() => {
  // Restore original env vars
  Object.assign(process.env, ORIGINAL_ENV)
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await cleanupUserRoles(prisma, [tenantId])
  await prisma.user.deleteMany({ where: { tenantId } })
  await prisma.branch.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('upload-e — POST /api/upload/presign', () => {

  test('UP-01: returns 201 with uploadUrl and publicUrl', async () => {
    const res = await request(server)
      .post('/api/upload/presign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ filename: 'fluffy.jpg', contentType: 'image/jpeg' })
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.uploadUrl).toBe(MOCK_SIGNED_URL)
    expect(res.body.data.publicUrl).toContain('test-vet-bucket')
    expect(res.body.data.publicUrl).toContain('ap-southeast-1')
    expect(res.body.data.key).toMatch(/^tenants\/\d+\/pets\/.+fluffy/)
  })

  test('UP-02: returns 401 when no auth token', async () => {
    const res = await request(server)
      .post('/api/upload/presign')
      .send({ filename: 'fluffy.jpg', contentType: 'image/jpeg' })
      .expect(401)

    expect(res.body.success).toBe(false)
  })

  test('UP-03: returns 400 on invalid contentType', async () => {
    const res = await request(server)
      .post('/api/upload/presign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ filename: 'fluffy.gif', contentType: 'image/gif' })
      .expect(400)

    expect(res.body.success).toBe(false)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  test('UP-04: returns 400 when filename is missing', async () => {
    const res = await request(server)
      .post('/api/upload/presign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ contentType: 'image/jpeg' })
      .expect(400)

    expect(res.body.success).toBe(false)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  test('UP-05: returns 503 when AWS env vars are blank', async () => {
    process.env.AWS_REGION            = ''
    process.env.AWS_BUCKET            = ''
    process.env.AWS_ACCESS_KEY_ID     = ''
    process.env.AWS_SECRET_ACCESS_KEY = ''

    const res = await request(server)
      .post('/api/upload/presign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ filename: 'fluffy.jpg', contentType: 'image/jpeg' })
      .expect(503)

    expect(res.body.success).toBe(false)
    expect(res.body.code).toBe('STORAGE_NOT_CONFIGURED')
  })

  test('UP-06: S3 key is scoped to tenants/{tenantId}/pets/ prefix', async () => {
    const res = await request(server)
      .post('/api/upload/presign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ filename: 'my pet.png', contentType: 'image/png' })
      .expect(201)

    const { key } = res.body.data
    expect(key).toMatch(new RegExp(`^tenants/${tenantId}/pets/`))

    // Verify PutObjectCommand was called with the correct Key
    expect(mockPutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-vet-bucket',
        Key:    key,
        ContentType: 'image/png',
      }),
    )
  })

})
