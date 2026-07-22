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
