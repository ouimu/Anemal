// src/backend/__tests__/emr-attachments.test.ts
/**
 * Test Suite: emr-attachments — EMR file attachment upload/download/delete
 * @qa-agent | ADR-0022 (local-disk storage driver) | Protocol: qa-protocols.md §1 (isolation) + §3 (edge cases)
 *
 * Files are written to a real temp directory (ATTACHMENT_DIR) — no mocking
 * of the storage layer, since LocalDiskDriver has no external dependency.
 * Run: npx jest --testPathPattern=emr-attachments
 */
import request from 'supertest'
import { Server } from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import app from '../app'
import prisma from '../config/db'
import { signToken } from '../config/jwt'
import bcrypt from 'bcrypt'
import { seedUserRoles, cleanupUserRoles } from '../tests/helpers/seedUserRoles'
import * as storageDriverMod from '../config/storage-driver'
import * as recordRepo from '../models/medical-record.repository'
import { logger } from '../utils/logger'

let server: Server
let tenantId: number
let branchId: number
let doctorToken: string
let staffToken: string
let adminToken: string
let medicalRecordId: number
let doctorUserId: number
let attachmentDir: string

const SUBDOMAIN = `emr-attach-test-${Date.now()}`

beforeAll(async () => {
  attachmentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemal-emr-attach-'))
  process.env.ATTACHMENT_DIR = attachmentDir

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
  const pet = await prisma.pet.create({ data: { tenantId, ownerId: owner.id, name: 'Rex', species: 'canine' } })
  const record = await prisma.medicalRecord.create({
    data: { tenantId, branchId, petId: pet.id, doctorId: doctorUser.id, assessment: 'Checkup' },
  })
  medicalRecordId = record.id
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
  fs.rmSync(attachmentDir, { recursive: true, force: true })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('emr-attachments — POST /:id/attachments (multipart upload)', () => {

  test('EA-01: doctor uploads a PDF — 201, file lands on disk, row created', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'lab-result.pdf', contentType: 'application/pdf' })
      .field('fileType', 'lab')
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.storageKey).toMatch(new RegExp(`^tenants/${tenantId}/emr/${medicalRecordId}/.+lab-result\\.pdf$`))
    expect(res.body.data.mimeType).toBe('application/pdf')
    expect(res.body.data.uploadedByUserId).toBe(doctorUserId)
    const onDisk = path.join(attachmentDir, res.body.data.storageKey)
    expect(fs.existsSync(onDisk)).toBe(true)
    expect(fs.readFileSync(onDisk).toString()).toBe('%PDF-1.4 fake')
  })

  test('EA-01b: Thai (UTF-8) filename is stored correctly, not mojibake', async () => {
    const thaiName = 'คู่มือการใช้งาน.pdf'
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: thaiName, contentType: 'application/pdf' })
      .expect(201)

    // Display name preserves the real UTF-8 Thai string (regression: multer's
    // latin1 default previously stored "à¸„à¸¹à¹ˆ..." mojibake).
    expect(res.body.data.fileName).toBe(thaiName)
    // Storage key stays ASCII-safe (Thai → underscores) via sanitizeFilename.
    expect(res.body.data.storageKey).toMatch(new RegExp(`^tenants/${tenantId}/emr/${medicalRecordId}/[0-9a-f-]+-_+\\.pdf$`))
  })

  test('EA-02: staff (clinic_staff) also gets 201', async () => {
    await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', Buffer.from('jpeg-bytes'), { filename: 'xray.jpg', contentType: 'image/jpeg' })
      .expect(201)
  })

  test('EA-03: disallowed MIME type (SVG) → 400, no file/row created', async () => {
    const before = await prisma.attachment.count({ where: { tenantId, medicalRecordId } })
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .attach('file', Buffer.from('<svg></svg>'), { filename: 'evil.svg', contentType: 'image/svg+xml' })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(await prisma.attachment.count({ where: { tenantId, medicalRecordId } })).toBe(before)
  })

  test('EA-04: oversized file (26 MB) → 400, no file/row created', async () => {
    const before = await prisma.attachment.count({ where: { tenantId, medicalRecordId } })
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .attach('file', Buffer.alloc(26 * 1024 * 1024, 1), { filename: 'huge.pdf', contentType: 'application/pdf' })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(await prisma.attachment.count({ where: { tenantId, medicalRecordId } })).toBe(before)
  })

  test('EA-05: user without emr.attach → 403', async () => {
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    const staffPerms = await prisma.rolePermission.findMany({ where: { roleId: staffRole.id } })
    const noAttachRole = await prisma.clinicRole.create({ data: { tenantId, key: 'no_emr_attach_staff', name: 'No-EMR-Attach Staff', isSystem: false } })
    for (const rp of staffPerms) {
      if (rp.permissionCode === 'emr.attach') continue
      await prisma.rolePermission.create({ data: { roleId: noAttachRole.id, permissionCode: rp.permissionCode } })
    }
    const ts = Date.now() % 100000
    const noAttachUser = await prisma.user.create({
      data: { tenantId, branchId, name: 'No Attach', username: `no_attach_${ts}`, email: `no-attach-${ts}@test.local`, passwordHash: await bcrypt.hash('TestPass1!', 4), roleId: noAttachRole.id },
    })
    await prisma.userRole.create({ data: { userId: noAttachUser.id, roleId: noAttachRole.id, tenantId } })
    const noAttachToken = signToken({ userId: noAttachUser.id, tenantId, branchId, plane: 'clinic', permSetVersion: 1, role: 'staff' })

    await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${noAttachToken}`)
      .attach('file', Buffer.from('x'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(403)
  })

  test('EA-06: foreign-tenant record → 404 (existence-leak precedent, ADR-0014)', async () => {
    const otherTenant = await prisma.tenant.create({ data: { name: 'Other EMR Tenant', subdomain: `${SUBDOMAIN}-other` } })
    const otherBranch = await prisma.branch.create({ data: { tenantId: otherTenant.id, name: 'Main' } })
    const otherDoctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const otherDoctor = await prisma.user.create({
      data: { tenantId: otherTenant.id, branchId: otherBranch.id, name: 'Other Doc', username: `other_doc_${Date.now() % 100000}`, email: `other-${Date.now()}@test.local`, passwordHash: await bcrypt.hash('TestPass1!', 4), roleId: otherDoctorRole.id },
    })
    const otherOwner = await prisma.owner.create({ data: { tenantId: otherTenant.id, firstName: 'Bob', lastName: 'Lee', phone: '0811111111' } })
    const otherPet = await prisma.pet.create({ data: { tenantId: otherTenant.id, ownerId: otherOwner.id, name: 'Fido', species: 'canine' } })
    const otherRecord = await prisma.medicalRecord.create({
      data: { tenantId: otherTenant.id, branchId: otherBranch.id, petId: otherPet.id, doctorId: otherDoctor.id },
    })

    const res = await request(server)
      .post(`/api/medical-records/${otherRecord.id}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`) // doctorToken belongs to the FIRST tenant
      .attach('file', Buffer.from('x'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(404)
    expect(res.body.success).toBe(false)

    await prisma.medicalRecord.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.pet.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.owner.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.user.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.branch.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.tenant.deleteMany({ where: { id: otherTenant.id } })
  })

  test('EA-07: no token → 401', async () => {
    await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .attach('file', Buffer.from('x'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(401)
  })

})

describe('emr-attachments — POST /:id/attachments (fileUrl registration, backward-compat)', () => {

  test('EA-08: legacy fileUrl-only JSON registration still works (ADR-0021 backward-compat, uploadedByUserId stays null)', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'referral.pdf', fileUrl: 'https://portal.example.com/referral.pdf', fileType: 'other' })
      .expect(201)

    expect(res.body.data.fileUrl).toBe('https://portal.example.com/referral.pdf')
    expect(res.body.data.storageKey).toBeNull()
    expect(res.body.data.uploadedByUserId).toBeNull()
  })

  test('EA-09: neither file nor fileUrl → 400 VALIDATION_ERROR', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'x.pdf' })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

})

describe('emr-attachments — GET /:id/attachments/:attId/download', () => {
  let attachmentId: number
  let storageKey: string

  beforeAll(async () => {
    storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/dl-uuid-download-me.pdf`
    fs.mkdirSync(path.dirname(path.join(attachmentDir, storageKey)), { recursive: true })
    fs.writeFileSync(path.join(attachmentDir, storageKey), 'pdf-bytes-here')
    const a = await prisma.attachment.create({
      data: { tenantId, medicalRecordId, fileName: 'download-me.pdf', storageKey, mimeType: 'application/pdf', fileSize: 555, uploadedByUserId: doctorUserId },
    })
    attachmentId = a.id
  })

  test('EA-10: emr.view holder (doctor) streams the correct bytes + headers', async () => {
    const res = await request(server)
      .get(`/api/medical-records/${medicalRecordId}/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200)
    // supertest/superagent buffers unrecognized-as-text MIME types (e.g.
    // application/pdf) into res.body as a raw Buffer rather than res.text —
    // verified via the bytes, not the text accessor.
    expect(Buffer.isBuffer(res.body) ? res.body.toString() : res.text).toBe('pdf-bytes-here')
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.headers['content-disposition']).toContain('attachment')
    expect(res.headers['content-disposition']).toContain('download-me.pdf')
  })

  test('EA-11: role without emr.view → 403', async () => {
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    const staffPerms = await prisma.rolePermission.findMany({ where: { roleId: staffRole.id } })
    const noViewRole = await prisma.clinicRole.create({ data: { tenantId, key: 'no_emr_view_staff', name: 'No-EMR-View Staff', isSystem: false } })
    for (const rp of staffPerms) {
      if (rp.permissionCode.startsWith('emr.')) continue
      await prisma.rolePermission.create({ data: { roleId: noViewRole.id, permissionCode: rp.permissionCode } })
    }
    const ts = Date.now() % 100000
    const noViewUser = await prisma.user.create({
      data: { tenantId, branchId, name: 'No View', username: `no_view_${ts}`, email: `no-view-${ts}@test.local`, passwordHash: await bcrypt.hash('TestPass1!', 4), roleId: noViewRole.id },
    })
    await prisma.userRole.create({ data: { userId: noViewUser.id, roleId: noViewRole.id, tenantId } })
    const noViewToken = signToken({ userId: noViewUser.id, tenantId, branchId, plane: 'clinic', permSetVersion: 1, role: 'staff' })

    const res = await request(server)
      .get(`/api/medical-records/${medicalRecordId}/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${noViewToken}`)
      .expect(403)
    expect(res.body.success).toBe(false)
  })

  test('EA-12: foreign-tenant attachment id → 404', async () => {
    const res = await request(server)
      .get(`/api/medical-records/${medicalRecordId}/attachments/999999/download`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404)
    expect(res.body.success).toBe(false)
  })

  test('EA-13: row exists but file missing on disk (data drift) → 404', async () => {
    const driftKey = `tenants/${tenantId}/emr/${medicalRecordId}/missing-uuid-ghost.pdf`
    const drift = await prisma.attachment.create({
      data: { tenantId, medicalRecordId, fileName: 'ghost.pdf', storageKey: driftKey, mimeType: 'application/pdf', fileSize: 10, uploadedByUserId: doctorUserId },
    })
    const res = await request(server)
      .get(`/api/medical-records/${medicalRecordId}/attachments/${drift.id}/download`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404)
    expect(res.body.success).toBe(false)
    await prisma.attachment.delete({ where: { id: drift.id } })
  })

})

describe('emr-attachments — DELETE /:id/attachments/:attId', () => {

  test('EA-14: doctor deletes an attachment — 204, row AND file removed', async () => {
    const storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/del-uuid-to-delete.pdf`
    fs.mkdirSync(path.dirname(path.join(attachmentDir, storageKey)), { recursive: true })
    fs.writeFileSync(path.join(attachmentDir, storageKey), 'bytes')
    const a = await prisma.attachment.create({
      data: { tenantId, medicalRecordId, fileName: 'to-delete.pdf', storageKey, mimeType: 'application/pdf', fileSize: 10, uploadedByUserId: doctorUserId },
    })
    await request(server)
      .delete(`/api/medical-records/${medicalRecordId}/attachments/${a.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(204)

    expect(await prisma.attachment.findUnique({ where: { id: a.id } })).toBeNull()
    expect(fs.existsSync(path.join(attachmentDir, storageKey))).toBe(false)
  })

  test('EA-15: delete tolerates an already-missing file — row still removed, no 500', async () => {
    const storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/already-gone.pdf`
    const a = await prisma.attachment.create({
      data: { tenantId, medicalRecordId, fileName: 'already-gone.pdf', storageKey, mimeType: 'application/pdf', fileSize: 10, uploadedByUserId: doctorUserId },
    })
    await request(server)
      .delete(`/api/medical-records/${medicalRecordId}/attachments/${a.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(204)
    expect(await prisma.attachment.findUnique({ where: { id: a.id } })).toBeNull()
  })

  test('EA-16: delete blocked (403) when parent record has a paid invoice (BR-6)', async () => {
    const billedOwner = await prisma.owner.create({ data: { tenantId, firstName: 'Ann', lastName: 'Lee', phone: '0822222222' } })
    const billedPet = await prisma.pet.create({ data: { tenantId, ownerId: billedOwner.id, name: 'Billed Pet', species: 'feline' } })
    const billedRecord = await prisma.medicalRecord.create({ data: { tenantId, branchId, petId: billedPet.id, doctorId: doctorUserId } })
    await prisma.invoice.create({
      data: { tenantId, medicalRecordId: billedRecord.id, petId: billedPet.id, invoiceNo: `INV-EMR-TEST-${Date.now()}`, subtotal: 100, taxRate: 7, taxAmount: 7, totalAmount: 107, paymentStatus: 'paid' },
    })
    const storageKey = `tenants/${tenantId}/emr/${billedRecord.id}/uuid-billed.pdf`
    const a = await prisma.attachment.create({
      data: { tenantId, medicalRecordId: billedRecord.id, fileName: 'billed.pdf', storageKey, mimeType: 'application/pdf', fileSize: 10, uploadedByUserId: doctorUserId },
    })

    const res = await request(server)
      .delete(`/api/medical-records/${billedRecord.id}/attachments/${a.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403)
    expect(res.body.success).toBe(false)
    expect(await prisma.attachment.findUnique({ where: { id: a.id } })).not.toBeNull()
  })

  test('EA-17: clinic_admin holds emr.attach per live RBAC seed → delete succeeds', async () => {
    const storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/uuid-admin.pdf`
    const a = await prisma.attachment.create({
      data: { tenantId, medicalRecordId, fileName: 'admin-can-delete.pdf', storageKey, mimeType: 'application/pdf', fileSize: 10, uploadedByUserId: doctorUserId },
    })
    await request(server)
      .delete(`/api/medical-records/${medicalRecordId}/attachments/${a.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204)
  })

})

describe('emr-attachments — audit trail', () => {
  test('EA-18: upload/delete each produce an AuditLog row via the existing global audit middleware', async () => {
    const before = await prisma.auditLog.count({ where: { tenantId } })

    const uploadRes = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .attach('file', Buffer.from('audited'), { filename: 'audited.pdf', contentType: 'application/pdf' })
      .expect(201)

    await request(server)
      .delete(`/api/medical-records/${medicalRecordId}/attachments/${uploadRes.body.data.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(204)

    await new Promise((r) => setTimeout(r, 50))

    const after = await prisma.auditLog.count({ where: { tenantId } })
    expect(after).toBeGreaterThanOrEqual(before + 2)
  })
})

describe('emr-attachments — storage-layer failures are logged, not surfaced (ADR-0023)', () => {
  afterEach(() => jest.restoreAllMocks())

  test('EA-19: rollback-delete failure after a DB error during upload does not mask the original DB error, and is logged', async () => {
    const loggerSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined)
    jest.spyOn(recordRepo, 'createAttachment').mockRejectedValueOnce(new Error('db down'))
    const driver = { save: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockRejectedValueOnce(new Error('share down')), read: jest.fn(), exists: jest.fn() }
    jest.spyOn(storageDriverMod, 'getStorageDriver').mockResolvedValueOnce(driver as unknown as storageDriverMod.StorageDriver)

    await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .attach('file', Buffer.from('x'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(500) // the ORIGINAL db error surfaces, not the delete failure

    expect(loggerSpy).toHaveBeenCalledWith(expect.objectContaining({ storageKey: expect.any(String) }), expect.stringMatching(/rollback/i))
  })

  test('EA-20: post-commit file delete failure after a successful row delete still returns 204, and is logged', async () => {
    const loggerSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined)
    const storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/uuid-log-test.pdf`
    const a = await prisma.attachment.create({
      data: { tenantId, medicalRecordId, fileName: 'log-test.pdf', storageKey, mimeType: 'application/pdf', fileSize: 10, uploadedByUserId: doctorUserId },
    })
    const driver = { delete: jest.fn().mockRejectedValueOnce(new Error('share down')), save: jest.fn(), read: jest.fn(), exists: jest.fn() }
    jest.spyOn(storageDriverMod, 'getStorageDriver').mockResolvedValueOnce(driver as unknown as storageDriverMod.StorageDriver)

    await request(server)
      .delete(`/api/medical-records/${medicalRecordId}/attachments/${a.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(204) // DB row is the source of truth — a storage-layer failure here must not surface as an error

    expect(loggerSpy).toHaveBeenCalledWith(expect.objectContaining({ storageKey }), expect.stringMatching(/orphan|delete/i))
  })
})
