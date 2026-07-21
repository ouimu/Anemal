// src/backend/__tests__/emr-attachments.test.ts
/**
 * Test Suite: emr-attachments — EMR file attachment upload/download/delete
 * @qa-agent | ADR-0021 | Protocol: qa-protocols.md §1 (isolation) + §3 (edge cases)
 *
 * AWS SDK is fully mocked — no real S3 calls required.
 * Run: npx jest --testPathPattern=emr-attachments
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../app'
import prisma from '../config/db'
import { signToken } from '../config/jwt'
import bcrypt from 'bcrypt'
import { seedUserRoles, cleanupUserRoles } from '../tests/helpers/seedUserRoles'

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn().mockResolvedValue({}) })),
    PutObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, __cmd: 'Put' })),
    GetObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, __cmd: 'Get' })),
    DeleteObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, __cmd: 'Delete' })),
  }
})

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-bucket.s3.mock-region.amazonaws.com/signed?sig=xxx'),
}))

const MOCK_SIGNED_URL = 'https://mock-bucket.s3.mock-region.amazonaws.com/signed?sig=xxx'

import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import crypto from 'crypto'

const mockGetSignedUrl      = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>
const mockPutObjectCommand  = PutObjectCommand as jest.MockedClass<typeof PutObjectCommand>

let server: Server
let tenantId: number
let branchId: number
let doctorToken: string
let staffToken: string
let adminToken: string
let medicalRecordId: number
let doctorUserId: number

const SUBDOMAIN = `emr-attach-test-${Date.now()}`

const ORIGINAL_ENV = {
  AWS_REGION:            process.env.AWS_REGION,
  AWS_BUCKET:            process.env.AWS_BUCKET,
  AWS_ACCESS_KEY_ID:     process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
}

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })

  const hash = await bcrypt.hash('TestPass1!', 10)
  const tenant = await prisma.tenant.create({ data: { name: 'EMR Attach Test Clinic', subdomain: SUBDOMAIN } })
  tenantId = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId, name: 'Main' } })
  branchId = branch.id

  const ts = Date.now() % 100000
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const staffRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
  const adminRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })

  const doctorUser = await prisma.user.create({
    data: { tenantId, branchId, name: 'Dr. Attach', username: `doc_att_${ts}`, email: `doc-att-${ts}@test.local`, passwordHash: hash, roleId: doctorRole.id },
  })
  doctorUserId = doctorUser.id
  const staffUser = await prisma.user.create({
    data: { tenantId, branchId, name: 'Staff Attach', username: `staff_att_${ts}`, email: `staff-att-${ts}@test.local`, passwordHash: hash, roleId: staffRole.id },
  })
  const adminUser = await prisma.user.create({
    data: { tenantId, branchId, name: 'Admin Attach', username: `admin_att_${ts}`, email: `admin-att-${ts}@test.local`, passwordHash: hash, roleId: adminRole.id },
  })

  await seedUserRoles(prisma, [
    { userId: doctorUser.id, tenantId, roleKey: 'doctor' },
    { userId: staffUser.id,  tenantId, roleKey: 'clinic_staff' },
    { userId: adminUser.id,  tenantId, roleKey: 'clinic_admin' },
  ])

  doctorToken = signToken({ userId: doctorUser.id, tenantId, branchId, plane: 'clinic', permSetVersion: 1, role: 'doctor' })
  staffToken  = signToken({ userId: staffUser.id,  tenantId, branchId, plane: 'clinic', permSetVersion: 1, role: 'staff' })
  adminToken  = signToken({ userId: adminUser.id,  tenantId, branchId, plane: 'clinic', permSetVersion: 1, role: 'admin' })

  const owner = await prisma.owner.create({ data: { tenantId, firstName: 'Jane', lastName: 'Doe', phone: '0800000000' } })
  const pet = await prisma.pet.create({
    data: { tenantId, ownerId: owner.id, name: 'Rex', species: 'canine' },
  })
  const record = await prisma.medicalRecord.create({
    data: { tenantId, branchId, petId: pet.id, doctorId: doctorUser.id, assessment: 'Checkup' },
  })
  medicalRecordId = record.id
})

beforeEach(() => {
  jest.clearAllMocks()
  process.env.AWS_REGION            = 'ap-southeast-1'
  process.env.AWS_BUCKET             = 'test-vet-bucket'
  process.env.AWS_ACCESS_KEY_ID      = 'AKIAIOSFODNN7EXAMPLE'
  process.env.AWS_SECRET_ACCESS_KEY  = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
  mockGetSignedUrl.mockResolvedValue(MOCK_SIGNED_URL)
})

afterEach(() => {
  Object.assign(process.env, ORIGINAL_ENV)
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await cleanupUserRoles(prisma, [tenantId])
  await prisma.attachment.deleteMany({ where: { tenantId } })
  await prisma.medicalRecord.deleteMany({ where: { tenantId } })
  await prisma.pet.deleteMany({ where: { tenantId } })
  await prisma.owner.deleteMany({ where: { tenantId } })
  await prisma.user.deleteMany({ where: { tenantId } })
  await prisma.branch.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('emr-attachments — POST /:id/attachments/presign', () => {

  test('EA-01: doctor gets 201 with uploadUrl + storageKey scoped to tenant/record', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments/presign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'lab-result.pdf', contentType: 'application/pdf', fileSizeBytes: 1024 })
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.uploadUrl).toBe(MOCK_SIGNED_URL)
    expect(res.body.data.storageKey).toMatch(new RegExp(`^tenants/${tenantId}/emr/${medicalRecordId}/.+lab-result\\.pdf$`))
    expect(mockPutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: 'test-vet-bucket', ContentType: 'application/pdf', ContentLength: 1024 }),
    )
  })

  test('EA-02: staff (clinic_staff) also gets 201', async () => {
    await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments/presign`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ fileName: 'xray.jpg', contentType: 'image/jpeg', fileSizeBytes: 2048 })
      .expect(201)
  })

  test('EA-03: clinic_admin is denied (403) — admin lacks emr.attach by design (A1)', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments/presign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fileName: 'lab-result.pdf', contentType: 'application/pdf', fileSizeBytes: 1024 })
      .expect(403)
    expect(res.body.success).toBe(false)
  })

  test('EA-04: no token → 401', async () => {
    await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments/presign`)
      .send({ fileName: 'lab-result.pdf', contentType: 'application/pdf', fileSizeBytes: 1024 })
      .expect(401)
  })

  test('EA-05: foreign-tenant record → 404 (existence-leak precedent, ADR-0014)', async () => {
    const otherTenant = await prisma.tenant.create({ data: { name: 'Other EMR Tenant', subdomain: `${SUBDOMAIN}-other` } })
    const otherBranch = await prisma.branch.create({ data: { tenantId: otherTenant.id, name: 'Main' } })
    const otherDoctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const otherDoctor = await prisma.user.create({
      data: { tenantId: otherTenant.id, branchId: otherBranch.id, name: 'Other Doc', username: `other_doc_${Date.now() % 100000}`, email: `other-${Date.now()}@test.local`, passwordHash: await bcrypt.hash('TestPass1!', 4), roleId: otherDoctorRole.id },
    })
    const otherOwner = await prisma.owner.create({ data: { tenantId: otherTenant.id, firstName: 'Bob', lastName: 'Lee', phone: '0811111111' } })
    const otherPet = await prisma.pet.create({
      data: { tenantId: otherTenant.id, ownerId: otherOwner.id, name: 'Fido', species: 'canine' },
    })
    const otherRecord = await prisma.medicalRecord.create({
      data: { tenantId: otherTenant.id, branchId: otherBranch.id, petId: otherPet.id, doctorId: otherDoctor.id },
    })

    const res = await request(server)
      .post(`/api/medical-records/${otherRecord.id}/attachments/presign`)
      .set('Authorization', `Bearer ${doctorToken}`) // doctorToken belongs to the FIRST tenant
      .send({ fileName: 'x.pdf', contentType: 'application/pdf', fileSizeBytes: 1024 })
      .expect(404)
    expect(res.body.success).toBe(false)

    await prisma.medicalRecord.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.pet.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.owner.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.user.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.branch.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.tenant.deleteMany({ where: { id: otherTenant.id } })
  })

  test('EA-06: disallowed contentType (SVG) → 400 VALIDATION_ERROR', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments/presign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'evil.svg', contentType: 'image/svg+xml', fileSizeBytes: 1024 })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  test('EA-07: oversized fileSizeBytes (26 MB) → 400 VALIDATION_ERROR', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments/presign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'huge.pdf', contentType: 'application/pdf', fileSizeBytes: 26 * 1024 * 1024 })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  test('EA-08: storage not configured → 503 STORAGE_NOT_CONFIGURED', async () => {
    process.env.AWS_REGION = ''
    process.env.AWS_BUCKET = ''
    process.env.AWS_ACCESS_KEY_ID = ''
    process.env.AWS_SECRET_ACCESS_KEY = ''

    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments/presign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'lab-result.pdf', contentType: 'application/pdf', fileSizeBytes: 1024 })
      .expect(503)
    expect(res.body.code).toBe('STORAGE_NOT_CONFIGURED')
  })

})

describe('emr-attachments — POST /:id/attachments (confirm, extended)', () => {

  test('EA-09: storageKey path persists mimeType/fileSize/uploadedByUserId', async () => {
    const storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/${crypto.randomUUID()}-lab.pdf`
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'lab.pdf', storageKey, mimeType: 'application/pdf', fileSizeBytes: 4096, fileType: 'lab' })
      .expect(201)

    expect(res.body.data.storageKey).toBe(storageKey)
    expect(res.body.data.mimeType).toBe('application/pdf')
    expect(res.body.data.fileSize).toBe(4096)
    expect(res.body.data.uploadedByUserId).toBe(doctorUserId)
  })

  test('EA-10: legacy fileUrl-only path still works (F3 backward-compat regression guard)', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'referral.pdf', fileUrl: 'https://portal.example.com/referral.pdf', fileType: 'other' })
      .expect(201)

    expect(res.body.data.fileUrl).toBe('https://portal.example.com/referral.pdf')
    expect(res.body.data.storageKey).toBeNull()
  })

  test('EA-11: both fileUrl and storageKey → 400 (XOR violation)', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'x.pdf', fileUrl: 'https://x.example.com/x.pdf', storageKey: `tenants/${tenantId}/emr/${medicalRecordId}/x`, mimeType: 'application/pdf', fileSizeBytes: 100 })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  test('EA-12: neither fileUrl nor storageKey → 400', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'x.pdf' })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  test('EA-13: storageKey with mismatched tenant/record prefix → 400 INVALID_STORAGE_KEY', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'x.pdf', storageKey: `tenants/99999/emr/1/forged-x.pdf`, mimeType: 'application/pdf', fileSizeBytes: 100 })
      .expect(400)
    expect(res.body.code).toBe('INVALID_STORAGE_KEY')
  })

  test('EA-14: mimeType outside allow-list (text/html) → 400 VALIDATION_ERROR (schema-level, EMR-ATTACH-8)', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'x.html', storageKey: `tenants/${tenantId}/emr/${medicalRecordId}/x.html`, mimeType: 'text/html', fileSizeBytes: 100 })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

})
