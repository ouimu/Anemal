/**
 * XTI-13 shape 7 (arch §9) — REVERSE include, SECOND instance:
 * `medical-record.repository.findById` includes `attachments`, `prescriptions` and
 * `invoices`, behind `GET /api/medical-records/:id`.
 *
 * A second reverse-include instance is not redundant with shape 6. Shape 6's fix lives
 * in `pet.repository.ts`; this one lives in `medical-record.repository.ts`, was written
 * by a different worker in a different wave (XTI-9 / W1c vs XTI-7 / W1a), and has three
 * child collections rather than two. The dialect is only proven adopted if it is proven
 * adopted in more than one place.
 *
 * Attachments are also the higher-stakes collection: they carry lab and X-ray file
 * names and (post ADR-0021) storage keys.
 */
import { Server } from 'http'
import request from 'supertest'
import prisma from '../../config/db'
import {
  TenantFixture, cleanupTenants, expectNoForeignTrace, expectNoOwnerPiiFields,
  fixtureStamp, seedCrossTenantPair, startFixtureServer, stopFixtureServer,
} from '../helpers/crossTenantRelationFixture'

let server: Server
let A: TenantFixture
let B: TenantFixture
let recordId = 0
let ownAttachmentId = 0
let foreignAttachmentId = 0
let ownPrescriptionId = 0
let foreignPrescriptionId = 0
let ownInvoiceId = 0
let foreignInvoiceId = 0

beforeAll(async () => {
  server = await startFixtureServer()
  const pair = await seedCrossTenantPair(server, fixtureStamp())
  A = pair.A
  B = pair.B

  recordId = (await prisma.medicalRecord.create({
    data: { tenantId: A.tenantId, branchId: A.branchId, petId: A.petId, doctorId: A.doctorUserId, assessment: 'host record' },
  })).id

  ownAttachmentId = (await prisma.attachment.create({
    data: {
      tenantId: A.tenantId, medicalRecordId: recordId,
      fileName: 'own-lab.pdf', fileUrl: 'https://a.example/own-lab.pdf', fileType: 'lab',
    },
  })).id
  // THE CORRUPT CHILD: an attachment owned by tenant B, hanging off tenant A's record.
  foreignAttachmentId = (await prisma.attachment.create({
    data: {
      tenantId: B.tenantId, medicalRecordId: recordId,
      fileName: `FOREIGN-${B.label}-xray.pdf`, fileUrl: 'https://b.example/foreign.pdf', fileType: 'xray',
    },
  })).id

  ownPrescriptionId = (await prisma.prescription.create({
    data: { tenantId: A.tenantId, medicalRecordId: recordId, drugId: A.productId, quantity: 1 },
  })).id
  foreignPrescriptionId = (await prisma.prescription.create({
    data: { tenantId: B.tenantId, medicalRecordId: recordId, drugId: B.productId, quantity: 9 },
  })).id

  const mkInvoice = async (tenantId: number, branchId: number, tag: string) => (await prisma.invoice.create({
    data: {
      tenantId, branchId, medicalRecordId: recordId,
      invoiceNo: `INV-XTI13R-${tag}-${Math.floor(Math.random() * 1e6)}`,
      subtotal: 100, discount: 0, taxRate: 0, taxAmount: 0, totalAmount: 100,
    },
  })).id
  ownInvoiceId = await mkInvoice(A.tenantId, A.branchId, 'own')
  foreignInvoiceId = await mkInvoice(B.tenantId, B.branchId, 'foreign')
}, 180_000)

afterAll(async () => {
  await cleanupTenants([A?.tenantId, B?.tenantId].filter((v): v is number => typeof v === 'number'))
  await stopFixtureServer(server)
}, 180_000)

interface RecordDetail {
  id: number
  attachments: { id: number; tenantId: number; fileName: string }[]
  prescriptions: { id: number; tenantId: number }[]
  invoices: { paymentStatus: string }[]
}

const getRecord = (id: number, token: string) =>
  request(server).get(`/api/medical-records/${id}`).set('Authorization', `Bearer ${token}`)

describe('XTI-13 shape 7 — reverse include #2 (medicalRecord -> attachments / prescriptions / invoices)', () => {
  it('all three corrupt children really hang off A\'s record while belonging to B — precondition', async () => {
    const att = await prisma.attachment.findUniqueOrThrow({
      where: { id: foreignAttachmentId }, select: { tenantId: true, medicalRecordId: true },
    })
    expect(att.tenantId).toBe(B.tenantId)
    expect(att.medicalRecordId).toBe(recordId)

    const rx = await prisma.prescription.findUniqueOrThrow({
      where: { id: foreignPrescriptionId }, select: { tenantId: true, medicalRecordId: true },
    })
    expect(rx.tenantId).toBe(B.tenantId)
    expect(rx.medicalRecordId).toBe(recordId)

    const inv = await prisma.invoice.findUniqueOrThrow({
      where: { id: foreignInvoiceId }, select: { tenantId: true, medicalRecordId: true },
    })
    expect(inv.tenantId).toBe(B.tenantId)
    expect(inv.medicalRecordId).toBe(recordId)
  })

  it('AC-1: the foreign attachment is NOT returned — no foreign file name reaches the caller', async () => {
    const res = await getRecord(recordId, A.adminToken)
    expect(res.status).toBe(200)
    const rec = res.body.data as RecordDetail
    const ids = rec.attachments.map((a) => a.id)
    expect(ids).not.toContain(foreignAttachmentId)
    expect(ids).toContain(ownAttachmentId)
    expect(rec.attachments.every((a) => a.tenantId === A.tenantId)).toBe(true)
    expect(JSON.stringify(res.body)).not.toContain('FOREIGN-')
  })

  it('AC-1: the foreign prescription and the foreign invoice are omitted too', async () => {
    const res = await getRecord(recordId, A.adminToken)
    expect(res.status).toBe(200)
    const rec = res.body.data as RecordDetail
    expect(rec.prescriptions.map((p) => p.id)).not.toContain(foreignPrescriptionId)
    expect(rec.prescriptions.map((p) => p.id)).toContain(ownPrescriptionId)
    expect(rec.prescriptions.every((p) => p.tenantId === A.tenantId)).toBe(true)
    // `invoices` is a projection (paymentStatus only), so assert on the count instead
    expect(rec.invoices).toHaveLength(1)
    expect(ownInvoiceId).toBeGreaterThan(0)
    expect(foreignInvoiceId).toBeGreaterThan(0)
  })

  it('AC-1/AC-8: the response leaks no foreign marker and no owner PII field', async () => {
    const res = await getRecord(recordId, A.adminToken)
    expect(res.status).toBe(200)
    expectNoForeignTrace(res.body, B)
    expectNoOwnerPiiFields(res.body)
  })

  it('positive control — the caller still reads its own record with its own children', async () => {
    const res = await getRecord(recordId, A.adminToken)
    expect(res.status).toBe(200)
    const rec = res.body.data as RecordDetail
    expect(rec.id).toBe(recordId)
    expect(rec.attachments).toHaveLength(1)
    expect(rec.attachments[0].fileName).toBe('own-lab.pdf')
  })

  it('the foreign tenant cannot reach A\'s record by id, despite owning children on it', async () => {
    const res = await getRecord(recordId, B.adminToken)
    expect(res.status).toBe(404)
  })
})
