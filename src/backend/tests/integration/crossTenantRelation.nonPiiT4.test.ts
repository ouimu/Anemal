/**
 * XTI-13 shape 9 (arch §9) — NON-PII, TIER 4:
 * `medical-record.repository.findByPet` behind `GET /api/medical-records?petId=`,
 * following `MedicalRecord -> doctor` (a User) and
 * `MedicalRecord -> prescriptions -> drug` (an InventoryItem).
 *
 * Tier 4 relations were triaged as lower severity because neither target carries owner
 * PII. They are still tenant data: a doctor's name identifies staff at another clinic,
 * and a drug row carries that clinic's own item naming (and, on the `findById` variant
 * which selects the whole row, `unitCost` — a competitor's purchase price).
 *
 * The `prescriptions -> drug` hop is deliberately the hardest case in the suite: `drug`
 * sits NESTED inside a to-many include, two levels down from the root `where`. A guard
 * (or an analyzer) that only reaches top-level include keys does not see it at all.
 */
import { Server } from 'http'
import request from 'supertest'
import prisma from '../../config/db'
import {
  TenantFixture, cleanupTenants, expectNoForeignTrace,
  fixtureStamp, seedCrossTenantPair, startFixtureServer, stopFixtureServer,
} from '../helpers/crossTenantRelationFixture'

let server: Server
let A: TenantFixture
let B: TenantFixture
let cleanRecordId = 0
let foreignDoctorRecordId = 0
let recordWithForeignDrugRxId = 0
let foreignDrugPrescriptionId = 0

beforeAll(async () => {
  server = await startFixtureServer()
  const pair = await seedCrossTenantPair(server, fixtureStamp())
  A = pair.A
  B = pair.B

  cleanRecordId = (await prisma.medicalRecord.create({
    data: { tenantId: A.tenantId, branchId: A.branchId, petId: A.petId, doctorId: A.doctorUserId, assessment: 'clean t4' },
  })).id
  await prisma.prescription.create({
    data: { tenantId: A.tenantId, medicalRecordId: cleanRecordId, drugId: A.productId, quantity: 1 },
  })

  // CORRUPT #1 — the record is A's, the doctor on it is B's staff member.
  foreignDoctorRecordId = (await prisma.medicalRecord.create({
    data: { tenantId: A.tenantId, branchId: A.branchId, petId: A.petId, doctorId: B.doctorUserId, assessment: 'foreign doctor' },
  })).id

  // CORRUPT #2 — the record AND the prescription are A's; only the drug is B's.
  // Nothing in the request path can create this (the write-path prober's P7b proves
  // POST /api/prescriptions rejects a foreign drugId), so it is fabricated here.
  recordWithForeignDrugRxId = (await prisma.medicalRecord.create({
    data: { tenantId: A.tenantId, branchId: A.branchId, petId: A.petId, doctorId: A.doctorUserId, assessment: 'foreign drug' },
  })).id
  foreignDrugPrescriptionId = (await prisma.prescription.create({
    data: { tenantId: A.tenantId, medicalRecordId: recordWithForeignDrugRxId, drugId: B.productId, quantity: 2 },
  })).id
}, 180_000)

afterAll(async () => {
  await cleanupTenants([A?.tenantId, B?.tenantId].filter((v): v is number => typeof v === 'number'))
  await stopFixtureServer(server)
}, 180_000)

interface RecordRow {
  id: number
  doctor: { id: number; name: string } | null
  prescriptions: { id: number; drug: { id: number; name: string } | null }[]
}

const listForPet = () => request(server).get(`/api/medical-records?petId=${A.petId}&limit=50`)
  .set('Authorization', `Bearer ${A.adminToken}`)

describe('XTI-13 shape 9 — non-PII T4 relations (medicalRecord -> doctor, prescriptions -> drug)', () => {
  it('both corrupt rows really are corrupt — precondition', async () => {
    const rec = await prisma.medicalRecord.findUniqueOrThrow({
      where: { id: foreignDoctorRecordId },
      select: { tenantId: true, doctor: { select: { tenantId: true } } },
    })
    expect(rec.tenantId).toBe(A.tenantId)
    expect(rec.doctor.tenantId).toBe(B.tenantId)

    const rx = await prisma.prescription.findUniqueOrThrow({
      where: { id: foreignDrugPrescriptionId },
      select: { tenantId: true, drug: { select: { tenantId: true } } },
    })
    expect(rx.tenantId).toBe(A.tenantId)
    expect(rx.drug.tenantId).toBe(B.tenantId)
  })

  it('positive control — the clean record and its own drug still list', async () => {
    const res = await listForPet()
    expect(res.status).toBe(200)
    const rows = (res.body.data.rows ?? res.body.data.records ?? res.body.data) as RecordRow[]
    const clean = rows.find((r) => r.id === cleanRecordId)
    expect(clean).toBeDefined()
    expect(clean!.doctor?.id).toBe(A.doctorUserId)
    expect(clean!.prescriptions[0].drug?.name).toBe(A.productName)
  })

  it('AC-1: a record whose doctor belongs to another tenant is omitted from the list', async () => {
    const res = await listForPet()
    expect(res.status).toBe(200)
    const rows = (res.body.data.rows ?? res.body.data.records ?? res.body.data) as RecordRow[]
    expect(rows.map((r) => r.id)).not.toContain(foreignDoctorRecordId)
    expect(JSON.stringify(res.body)).not.toContain(`Doctor ${B.label}`)
  })

  it('AC-1: the list total matches the rows returned once the foreign-doctor record is excluded', async () => {
    const res = await listForPet()
    expect(res.status).toBe(200)
    const rows = (res.body.data.rows ?? res.body.data.records ?? res.body.data) as RecordRow[]
    const total = res.body.data.total as number
    if (typeof total === 'number') expect(rows).toHaveLength(total)
    expect(rows.map((r) => r.id).sort()).toEqual([cleanRecordId, recordWithForeignDrugRxId].sort())
  })

  it('AC-1: no other tenant\'s drug row reaches the caller through the nested prescriptions -> drug hop', async () => {
    const res = await listForPet()
    expect(res.status).toBe(200)
    expectNoForeignTrace(res.body, B)
    const rows = (res.body.data.rows ?? res.body.data.records ?? res.body.data) as RecordRow[]
    const leaked = rows.flatMap((r) => r.prescriptions).filter((p) => p.drug && p.drug.id === B.productId)
    expect(leaked).toEqual([])
  })

  it('AC-1: the single-record read (findById, which selects the WHOLE drug row) leaks no foreign drug either', async () => {
    const res = await request(server).get(`/api/medical-records/${recordWithForeignDrugRxId}`)
      .set('Authorization', `Bearer ${A.adminToken}`)
    // Either the record is refused outright, or it comes back with the foreign-drug
    // prescription stripped — both satisfy AC-1; shipping B's drug row does not.
    expect([200, 404]).toContain(res.status)
    expectNoForeignTrace(res.body, B)
    expect(JSON.stringify(res.body)).not.toContain(B.productName)
  })
})
