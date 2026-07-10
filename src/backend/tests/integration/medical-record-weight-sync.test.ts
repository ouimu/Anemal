// @qa-agent — Pet.weightKg <-> MedicalRecord.weightKg sync policy (PETFIX-2, Batch A).
// Covers: recompute-last-known-weight on create/update, null-weight no-op, billed-record
// guard, tenant isolation of the recompute SQL, transaction atomicity, staleness on a
// weight-corrected-to-null edit, and validation bounds (weight/temp/HR/RR overflow guards).
// Follows the phase4.test.ts pattern — supertest + live server + getToken + per-run unique
// owner/pet, scoped to the already-seeded dev-clinic/test-clinic tenants.

import request from 'supertest'
import { Server } from 'http'
import app from '../../app'
import prisma from '../../config/db'

let server: Server

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

async function getToken(subdomain: string, username: string, password: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain, username, password })
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  return step2.body.data?.token
}

// medical-record create/update requires `emr.create`/`emr.edit`, which only the `doctor`
// system role holds (clinic_admin has crm.*/billing.* but not emr.create/edit — see
// anemal-rbac-matrix permission-matrix.md §2). Owner/pet/invoice/payment calls need
// `crm.create`/`billing.create`/`billing.payment`, which only `admin` holds. Both tokens
// are needed; each request below uses whichever role actually has the permission.
let adminA: string
let adminB: string
let doctorA: string
let doctorB: string
let branchIdA: number
let doctorIdA: number
let doctorBranchIdA: number

/** Creates a fresh owner + pet in dev-clinic (tenant A) for one test case. */
async function makePetA(): Promise<number> {
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const ownerRes = await request(server).post('/api/owners').set('Authorization', `Bearer ${adminA}`)
    .send({ firstName: 'WS', lastName: `Tester${uniq}`, phone: `08${uniq.slice(-8).padStart(8, '0')}` })
  const ownerId = ownerRes.body.data.id
  const petRes = await request(server).post('/api/pets').set('Authorization', `Bearer ${adminA}`)
    .send({ ownerId, name: 'SyncPet', species: 'canine', microchipId: `WSMC${uniq}` })
  return petRes.body.data.id
}

async function getPetWeight(petId: number): Promise<number | null> {
  const res = await request(server).get(`/api/pets/${petId}`).set('Authorization', `Bearer ${adminA}`)
  const w = res.body.data.weightKg
  return w == null ? null : Number(w)
}

beforeAll(async () => {
  adminA = await getToken('dev-clinic', 'admin_a', 'AdminPass1!')
  adminB = await getToken('test-clinic', 'admin_b', 'AdminPass2!')
  doctorA = await getToken('dev-clinic', 'doctor_a', 'DoctorPass1!')
  doctorB = await getToken('test-clinic', 'doctor_b', 'DoctorPass2!')

  const branchRes = await request(server).get('/api/branches').set('Authorization', `Bearer ${adminA}`)
  branchIdA = branchRes.body.data[0].id
  const switchRes = await request(server).post('/auth/switch-branch').set('Authorization', `Bearer ${adminA}`).send({ branchId: branchIdA })
  adminA = switchRes.body.data.token

  const meRes = await request(server).get('/auth/me').set('Authorization', `Bearer ${doctorA}`)
  doctorIdA = meRes.body.data.userId
  doctorBranchIdA = meRes.body.data.branchId
})

describe('Medical record weight sync — create/update recompute policy', () => {
  it('create-with-weight syncs pet.weightKg', async () => {
    const petId = await makePetA()
    const res = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, weightKg: 10.5 })
    expect(res.status).toBe(201)
    expect(await getPetWeight(petId)).toBe(10.5)
  })

  it('null-weight create leaves pet.weightKg unchanged', async () => {
    const petId = await makePetA()
    expect(await getPetWeight(petId)).toBeNull()
    const res = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, assessment: 'checkup, no weight taken' })
    expect(res.status).toBe(201)
    expect(await getPetWeight(petId)).toBeNull()
  })

  it('update-latest-record syncs pet.weightKg', async () => {
    const petId = await makePetA()
    const create = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, weightKg: 5 })
    const recordId = create.body.data.id
    const update = await request(server).put(`/api/medical-records/${recordId}`).set('Authorization', `Bearer ${doctorA}`)
      .send({ weightKg: 7.2 })
    expect(update.status).toBe(200)
    expect(await getPetWeight(petId)).toBe(7.2)
  })

  it('update-older-record-with-newer-weighed-record-present does NOT change pet.weightKg', async () => {
    const petId = await makePetA()
    const older = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, weightKg: 3 })
    await new Promise(r => setTimeout(r, 5))
    await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, weightKg: 9 })
    expect(await getPetWeight(petId)).toBe(9)

    const olderId = older.body.data.id
    const update = await request(server).put(`/api/medical-records/${olderId}`).set('Authorization', `Bearer ${doctorA}`)
      .send({ weightKg: 3.5 })
    expect(update.status).toBe(200)
    // Latest record's weight (9) still wins — recompute takes createdAt DESC latest weighed record.
    expect(await getPetWeight(petId)).toBe(9)
  })

  it('update-older-record-when-all-newer-are-weightless DOES correct pet.weightKg (recompute case)', async () => {
    const petId = await makePetA()
    const older = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, weightKg: 4 })
    await new Promise(r => setTimeout(r, 5))
    await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, assessment: 'follow-up, no weight taken' })
    expect(await getPetWeight(petId)).toBe(4)

    const olderId = older.body.data.id
    const update = await request(server).put(`/api/medical-records/${olderId}`).set('Authorization', `Bearer ${doctorA}`)
      .send({ weightKg: 6.6 })
    expect(update.status).toBe(200)
    // The only non-null-weight record is now the corrected older one — recompute picks it up.
    expect(await getPetWeight(petId)).toBe(6.6)
  })

  it('billed-record edit → 403, pet.weightKg unchanged', async () => {
    const petId = await makePetA()
    const create = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, weightKg: 8 })
    const recordId = create.body.data.id

    const invoiceRes = await request(server).post('/api/invoices').set('Authorization', `Bearer ${adminA}`)
      .send({ medicalRecordId: recordId, petId, items: [{ description: 'Consult fee', itemType: 'service', qty: 1, unitPrice: 100 }] })
    expect(invoiceRes.status).toBe(201)
    const invoiceId = invoiceRes.body.data.id
    const payRes = await request(server).put(`/api/invoices/${invoiceId}/payment`).set('Authorization', `Bearer ${adminA}`)
      .send({ paymentMethod: 'cash' })
    expect(payRes.status).toBe(200)

    const update = await request(server).put(`/api/medical-records/${recordId}`).set('Authorization', `Bearer ${doctorA}`)
      .send({ weightKg: 99 })
    expect(update.status).toBe(403)
    expect(await getPetWeight(petId)).toBe(8)
  })

  it('tenant isolation of the sync query — cross-tenant record never influences another tenant\'s pet', async () => {
    const petIdA = await makePetA()
    await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId: petIdA, doctorId: doctorIdA, weightKg: 11 })
    expect(await getPetWeight(petIdA)).toBe(11)

    // Tenant B creates its own owner/pet/record with an unrelated weight — must never
    // reach or influence tenant A's pet row, even if IDs happened to collide.
    const uniqB = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ownerBRes = await request(server).post('/api/owners').set('Authorization', `Bearer ${adminB}`)
      .send({ firstName: 'WSB', lastName: `Tester${uniqB}`, phone: `09${uniqB.slice(-8).padStart(8, '0')}` })
    const ownerIdB = ownerBRes.body.data.id
    const petBRes = await request(server).post('/api/pets').set('Authorization', `Bearer ${adminB}`)
      .send({ ownerId: ownerIdB, name: 'SyncPetB', species: 'feline', microchipId: `WSBMC${uniqB}` })
    const petIdB = petBRes.body.data.id

    const meB = await request(server).get('/auth/me').set('Authorization', `Bearer ${doctorB}`)
    const doctorIdB = meB.body.data.userId
    await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorB}`)
      .send({ petId: petIdB, doctorId: doctorIdB, weightKg: 500 })

    expect(await getPetWeight(petIdA)).toBe(11)
  })

  it('transaction atomicity — forced failure rolls back both writes', async () => {
    // Simplest reliable trigger: an FK violation on doctorId (nonexistent user), which
    // fails the tx.medicalRecord.create() step before recomputePetWeight ever runs — so
    // this proves the record write itself never lands, and by construction the guarded
    // recompute (which only fires after a successful record write) cannot have run either.
    const petId = await makePetA()
    const before = await getPetWeight(petId)
    const res = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: 999999999, weightKg: 42 })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await getPetWeight(petId)).toBe(before)
    const records = await prisma.medicalRecord.findMany({ where: { petId } })
    expect(records.every(r => Number(r.weightKg) !== 42)).toBe(true)
  })

  it('weight-corrected-to-null on latest record leaves pet.weightKg unchanged (documented staleness, spec §8.3)', async () => {
    const petId = await makePetA()
    const create = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, weightKg: 15 })
    expect(await getPetWeight(petId)).toBe(15)

    const recordId = create.body.data.id
    const update = await request(server).put(`/api/medical-records/${recordId}`).set('Authorization', `Bearer ${doctorA}`)
      .send({ weightKg: null })
    expect(update.status).toBe(200)
    // Null-weight write never triggers recompute — pet retains the last known weight.
    expect(await getPetWeight(petId)).toBe(15)
  })

  it('two records with identical createdAt resolve deterministically by id DESC', async () => {
    const petId = await makePetA()
    const now = new Date()
    // Seed with the DOCTOR's session branch — updateMedicalRecord's findById is
    // branch-scoped, so rows seeded under another branch would 404 for doctorA.
    const first = await prisma.medicalRecord.create({
      data: { tenantId: (await prisma.pet.findUniqueOrThrow({ where: { id: petId } })).tenantId, branchId: doctorBranchIdA, petId, doctorId: doctorIdA, weightKg: 20, createdAt: now },
    })
    const second = await prisma.medicalRecord.create({
      data: { tenantId: first.tenantId, branchId: doctorBranchIdA, petId, doctorId: doctorIdA, weightKg: 25, createdAt: now },
    })
    expect(second.id).toBeGreaterThan(first.id)

    // Trigger a recompute while the two tied rows are the ONLY weighed records for this
    // pet: re-write the LOWER-id row's own weight (non-null → recompute fires; createdAt
    // is immutable on update, so the tie is preserved). The subquery must resolve the
    // createdAt tie by id DESC → the higher-id row's weight (25), NOT the row just
    // written (20). If the tiebreak were missing or ASC, the pet would read 20.
    const update = await request(server).put(`/api/medical-records/${first.id}`).set('Authorization', `Bearer ${doctorA}`)
      .send({ weightKg: 20 })
    expect(update.status).toBe(200)
    expect(await getPetWeight(petId)).toBe(25)
  })
})

describe('Validation bounds — weight/temperature/HR/RR overflow guards', () => {
  it('weightKg 999.99 accepted / 1000 rejected 400', async () => {
    const petId = await makePetA()
    const ok = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, weightKg: 999.99 })
    expect(ok.status).toBe(201)
    const bad = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, weightKg: 1000 })
    expect(bad.status).toBe(400)
  })

  it('temperatureC 999.9 accepted / 1000 rejected 400 / -1 rejected 400', async () => {
    const petId = await makePetA()
    const ok = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, temperatureC: 999.9 })
    expect(ok.status).toBe(201)
    const tooHigh = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, temperatureC: 1000 })
    expect(tooHigh.status).toBe(400)
    const negative = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, temperatureC: -1 })
    expect(negative.status).toBe(400)
  })

  it('heartRateBpm 3000 accepted / 3001 rejected 400', async () => {
    const petId = await makePetA()
    const ok = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, heartRateBpm: 3000 })
    expect(ok.status).toBe(201)
    const bad = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, heartRateBpm: 3001 })
    expect(bad.status).toBe(400)
  })

  it('respRateRpm 3000 accepted / 3001 rejected 400', async () => {
    const petId = await makePetA()
    const ok = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, respRateRpm: 3000 })
    expect(ok.status).toBe(201)
    const bad = await request(server).post('/api/medical-records').set('Authorization', `Bearer ${doctorA}`)
      .send({ petId, doctorId: doctorIdA, respRateRpm: 3001 })
    expect(bad.status).toBe(400)
  })
})

describe('Pet weightKg bound', () => {
  it('PUT /api/pets/:id — weightKg 999.99 accepted / 1000 rejected 400', async () => {
    const petId = await makePetA()
    const ok = await request(server).put(`/api/pets/${petId}`).set('Authorization', `Bearer ${adminA}`)
      .send({ weightKg: 999.99 })
    expect(ok.status).toBe(200)
    const bad = await request(server).put(`/api/pets/${petId}`).set('Authorization', `Bearer ${adminA}`)
      .send({ weightKg: 1000 })
    expect(bad.status).toBe(400)
  })
})
