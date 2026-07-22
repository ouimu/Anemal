// src/backend/__tests__/pet-photo.test.ts
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

let server: Server
let tenantId: number
let branchId: number
let staffToken: string
let doctorToken: string
let petId: number
let attachmentDir: string

const SUBDOMAIN = `pet-photo-test-${Date.now()}`

beforeAll(async () => {
  attachmentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemal-pet-photo-'))
  process.env.ATTACHMENT_DIR = attachmentDir

  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })

  const hash = await bcrypt.hash('TestPass1!', 10)
  const tenant = await prisma.tenant.create({ data: { name: 'Pet Photo Test Clinic', subdomain: SUBDOMAIN } })
  tenantId = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId, name: 'Main' } })
  branchId = branch.id

  const ts = Date.now() % 100000
  const staffRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })

  const staffUser = await prisma.user.create({
    data: { tenantId, branchId, name: 'Photo Staff', username: `photo_staff_${ts}`, email: `photo-staff-${ts}@test.local`, passwordHash: hash, roleId: staffRole.id },
  })
  const doctorUser = await prisma.user.create({
    data: { tenantId, branchId, name: 'Photo Doctor', username: `photo_doc_${ts}`, email: `photo-doc-${ts}@test.local`, passwordHash: hash, roleId: doctorRole.id },
  })

  await seedUserRoles(prisma, [
    { userId: staffUser.id,  tenantId, roleKey: 'clinic_staff' },
    { userId: doctorUser.id, tenantId, roleKey: 'doctor' },
  ])

  staffToken  = signToken({ userId: staffUser.id,  tenantId, branchId, plane: 'clinic', permSetVersion: 1, role: 'staff' })
  doctorToken = signToken({ userId: doctorUser.id, tenantId, branchId, plane: 'clinic', permSetVersion: 1, role: 'doctor' })

  const owner = await prisma.owner.create({ data: { tenantId, firstName: 'Jane', lastName: 'Doe', phone: '0800000000' } })
  const pet = await prisma.pet.create({ data: { tenantId, ownerId: owner.id, name: 'Rex', species: 'canine' } })
  petId = pet.id
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await cleanupUserRoles(prisma, [tenantId])
  await prisma.pet.deleteMany({ where: { tenantId } })
  await prisma.owner.deleteMany({ where: { tenantId } })
  await prisma.user.deleteMany({ where: { tenantId } })
  await prisma.branch.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
  fs.rmSync(attachmentDir, { recursive: true, force: true })
})

describe('pet.service — photoUrl is server-managed only (BA §2.3 R-1)', () => {
  test('PP-08: creating a pet does not accept a client-supplied photoUrl', async () => {
    const owner = await prisma.owner.findFirstOrThrow({ where: { tenantId } })
    const res = await request(server)
      .post('/api/pets')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ ownerId: owner.id, name: 'Whiskers', species: 'feline', photoUrl: 'tenants/999/photo/pet-1.jpg' })
      .expect(201)
    expect(res.body.data.photoUrl).toBeNull()
    await prisma.pet.delete({ where: { id: res.body.data.id } })
  })

  test('PP-08b: updating a pet does not accept a client-supplied photoUrl', async () => {
    const res = await request(server)
      .put(`/api/pets/${petId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ photoUrl: 'tenants/999/photo/forged.jpg' })
      .expect(200)
    expect(res.body.data.photoUrl).not.toBe('tenants/999/photo/forged.jpg')
  })
})

describe('pet-photo — POST /api/pets/:id/photo', () => {

  test('PP-01: staff (crm.edit) uploads a JPEG — 201, file on disk, pet.photoUrl set to the stable key', async () => {
    const res = await request(server)
      .post(`/api/pets/${petId}/photo`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', Buffer.from('jpeg-bytes'), { filename: 'rex.jpg', contentType: 'image/jpeg' })
      .expect(201)

    const expectedKey = `tenants/${tenantId}/photo/pet-${petId}.jpg`
    expect(res.body.data.photoUrl).toBe(expectedKey)
    expect(fs.existsSync(path.join(attachmentDir, expectedKey))).toBe(true)
  })

  test('PP-02: re-uploading the same format overwrites in place — zero orphan (grill G2)', async () => {
    const expectedKey = `tenants/${tenantId}/photo/pet-${petId}.jpg`
    await request(server)
      .post(`/api/pets/${petId}/photo`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', Buffer.from('jpeg-bytes-v2'), { filename: 'rex-v2.jpg', contentType: 'image/jpeg' })
      .expect(201)

    expect(fs.readFileSync(path.join(attachmentDir, expectedKey)).toString()).toBe('jpeg-bytes-v2')
    const filesInPhotoDir = fs.readdirSync(path.join(attachmentDir, 'tenants', String(tenantId), 'photo'))
    expect(filesInPhotoDir).toEqual([`pet-${petId}.jpg`])
  })

  test('PP-03: format change (jpg to png) deletes the old file (grill G2)', async () => {
    const oldKey = `tenants/${tenantId}/photo/pet-${petId}.jpg`
    const newKey = `tenants/${tenantId}/photo/pet-${petId}.png`
    await request(server)
      .post(`/api/pets/${petId}/photo`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', Buffer.from('png-bytes'), { filename: 'rex.png', contentType: 'image/png' })
      .expect(201)

    expect(fs.existsSync(path.join(attachmentDir, oldKey))).toBe(false)
    expect(fs.existsSync(path.join(attachmentDir, newKey))).toBe(true)
  })

  test('PP-04: disallowed image type (gif) → 400, photoUrl unchanged', async () => {
    const before = await prisma.pet.findUniqueOrThrow({ where: { id: petId } })
    const res = await request(server)
      .post(`/api/pets/${petId}/photo`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', Buffer.from('gif-bytes'), { filename: 'rex.gif', contentType: 'image/gif' })
      .expect(400)
    expect(res.body.code).toBe('PET_ERROR')
    const after = await prisma.pet.findUniqueOrThrow({ where: { id: petId } })
    expect(after.photoUrl).toBe(before.photoUrl)
  })

  test('PP-05: oversized image (6 MB) → 400', async () => {
    const res = await request(server)
      .post(`/api/pets/${petId}/photo`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', Buffer.alloc(6 * 1024 * 1024, 1), { filename: 'huge.jpg', contentType: 'image/jpeg' })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  test('PP-06: foreign-tenant pet id → 404', async () => {
    const otherTenant = await prisma.tenant.create({ data: { name: 'Other Photo Tenant', subdomain: `${SUBDOMAIN}-other` } })
    const otherOwner = await prisma.owner.create({ data: { tenantId: otherTenant.id, firstName: 'Bob', lastName: 'Lee', phone: '0811111111' } })
    const otherPet = await prisma.pet.create({ data: { tenantId: otherTenant.id, ownerId: otherOwner.id, name: 'Fido', species: 'canine' } })

    await request(server)
      .post(`/api/pets/${otherPet.id}/photo`)
      .set('Authorization', `Bearer ${staffToken}`) // staffToken belongs to the FIRST tenant
      .attach('file', Buffer.from('x'), { filename: 'x.jpg', contentType: 'image/jpeg' })
      .expect(404)

    await prisma.pet.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.owner.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.tenant.deleteMany({ where: { id: otherTenant.id } })
  })

  test('PP-07: user without crm.edit (doctor) → 403', async () => {
    await request(server)
      .post(`/api/pets/${petId}/photo`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .attach('file', Buffer.from('x'), { filename: 'x.jpg', contentType: 'image/jpeg' })
      .expect(403)
  })

  test('PP-14: uploading a new photo does not delete a forged out-of-tenant photoUrl file (QA P1 fix)', async () => {
    const owner = await prisma.owner.findFirstOrThrow({ where: { tenantId } })
    const victimKey = 'tenants/999999/photo/pet-victim.jpg'
    fs.mkdirSync(path.dirname(path.join(attachmentDir, victimKey)), { recursive: true })
    fs.writeFileSync(path.join(attachmentDir, victimKey), 'victim-bytes')
    const forgedPet = await prisma.pet.create({
      data: { tenantId, ownerId: owner.id, name: 'Forged Upload', species: 'canine', photoUrl: victimKey },
    })

    await request(server)
      .post(`/api/pets/${forgedPet.id}/photo`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', Buffer.from('new-bytes'), { filename: 'new.jpg', contentType: 'image/jpeg' })
      .expect(201)

    expect(fs.existsSync(path.join(attachmentDir, victimKey))).toBe(true)
    expect(fs.readFileSync(path.join(attachmentDir, victimKey)).toString()).toBe('victim-bytes')

    await prisma.pet.delete({ where: { id: forgedPet.id } })
    fs.rmSync(path.join(attachmentDir, 'tenants', '999999'), { recursive: true, force: true })
  })

})

describe('pet-photo — GET /api/pets/:id/photo', () => {

  test('PP-09: crm.view holder streams the correct bytes + Content-Type', async () => {
    const res = await request(server)
      .get(`/api/pets/${petId}/photo`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200)
    expect(res.headers['content-type']).toContain('image/png') // last upload in Task 9's PP-03 was a png
  })

  test('PP-10: pet with no photo → 404', async () => {
    const owner = await prisma.owner.findFirstOrThrow({ where: { tenantId } })
    const photolessPet = await prisma.pet.create({ data: { tenantId, ownerId: owner.id, name: 'NoPhoto', species: 'canine' } })

    await request(server)
      .get(`/api/pets/${photolessPet.id}/photo`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404)

    await prisma.pet.delete({ where: { id: photolessPet.id } })
  })

  test('PP-11: photoUrl set but file missing on disk (data drift) → 404', async () => {
    const owner = await prisma.owner.findFirstOrThrow({ where: { tenantId } })
    const driftPet = await prisma.pet.create({
      data: { tenantId, ownerId: owner.id, name: 'Drift', species: 'canine', photoUrl: `tenants/${tenantId}/photo/pet-ghost.jpg` },
    })

    await request(server)
      .get(`/api/pets/${driftPet.id}/photo`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404)

    await prisma.pet.delete({ where: { id: driftPet.id } })
  })

  test('PP-12: forged out-of-tenant photoUrl fails the prefix guard → 404, not a cross-tenant read (BA §2.3 R-1)', async () => {
    const owner = await prisma.owner.findFirstOrThrow({ where: { tenantId } })
    const forgedKey = 'tenants/999999/photo/pet-1.jpg'
    fs.mkdirSync(path.dirname(path.join(attachmentDir, forgedKey)), { recursive: true })
    fs.writeFileSync(path.join(attachmentDir, forgedKey), 'someone-elses-photo')
    const forgedPet = await prisma.pet.create({
      data: { tenantId, ownerId: owner.id, name: 'Forged', species: 'canine', photoUrl: forgedKey },
    })

    const res = await request(server)
      .get(`/api/pets/${forgedPet.id}/photo`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404)
    expect(res.body.success).toBe(false)

    await prisma.pet.delete({ where: { id: forgedPet.id } })
    fs.rmSync(path.join(attachmentDir, 'tenants', '999999'), { recursive: true, force: true })
  })

  test('PP-13: foreign-tenant pet id → 404', async () => {
    const otherTenant = await prisma.tenant.create({ data: { name: 'Other Photo Tenant 2', subdomain: `${SUBDOMAIN}-other2` } })
    const otherOwner = await prisma.owner.create({ data: { tenantId: otherTenant.id, firstName: 'Ann', lastName: 'Lee', phone: '0822222222' } })
    const otherPet = await prisma.pet.create({ data: { tenantId: otherTenant.id, ownerId: otherOwner.id, name: 'Ghost', species: 'canine' } })

    await request(server)
      .get(`/api/pets/${otherPet.id}/photo`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404)

    await prisma.pet.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.owner.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.tenant.deleteMany({ where: { id: otherTenant.id } })
  })

})
