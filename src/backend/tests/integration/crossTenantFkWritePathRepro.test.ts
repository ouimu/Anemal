/**
 * C-1 REPRODUCTION ATTEMPT — cross-tenant FK via an app-reachable write path.
 *
 * BA sign-off `2026-09-10-cross-tenant-relation-isolation-ba-signoff.md` §F-3 asserts that
 * every write path accepting a caller-supplied tenant-scoped FK is guarded — by convention,
 * via 11 hand-written `findFirst({ id, tenantId })` checks. That was established by READING
 * the code. This suite tries to FALSIFY it by driving the real HTTP surface.
 *
 * Attack model: an authenticated clinic user of tenant ATTACKER submits writes whose
 * petId / ownerId / doctorId / medicalRecordId / appointmentId / donorId / donationId /
 * drugId / hospitalizationId belong to tenant VICTIM. A successful attack produces a row
 * with `tenantId = ATTACKER` whose FK points into VICTIM — the exact state the PR #73 test
 * had to fabricate with a direct `prisma.*.create()`.
 *
 * METHOD — every attack is paired with a POSITIVE CONTROL.
 * A 404 on its own proves nothing: it could mean "the guard fired" or "the request was
 * malformed / the caller lacked the permission / no branch was selected". So each FK is
 * exercised TWICE — once with the attacker's OWN id (control, must be 2xx) and once with
 * the victim's id (attack, must not be 2xx). Only a passing control makes the paired
 * attack's rejection meaningful. Controls that do not pass are reported as UNTESTED rather
 * than counted as a blocked attack.
 *
 * Permission routing matters: `emr.create`, `emr.edit`, `prescriptions.create` and
 * `vaccination.create` are doctor-only (clinic_admin does NOT hold them), and
 * /api/invoices + /api/prescriptions call `requireBranchId`. An earlier revision of this
 * suite ran everything as a branchless admin and got 403/400 on those paths — the FK
 * guards were never reached and the "all blocked" result was an artefact of the harness.
 * Hence: a doctor token for clinical writes, and a branch-pinned admin token for the rest.
 *
 * VERDICT is the DB integrity sweep at the end, not the status codes: it joins every
 * affected child table to its FK parent and asserts zero tenantId mismatches. A write that
 * returned 201 but produced no corrupt row is not a hit; a write that returned 500 but DID
 * produce one is.
 */
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'

// users.username and owners.idCardNumber are VarChar(20) — keep generated fixture
// values short or the seed fails before a single attack is fired.
const STAMP = Date.now().toString(36)
const SUB_A = `xt-atk-${STAMP}`
const SUB_B = `xt-vic-${STAMP}`
const PASSWORD = 'TestPass1!'
const iso = (msFromNow = 0) => new Date(Date.now() + msFromNow).toISOString()

let server: Server

interface TenantFixture {
  tenantId: number
  branchId: number
  adminId: number
  doctorId: number
  ownerId: number
  petId: number
  petSpareId: number
  medicalRecordId: number
  medicalRecordSpareId: number
  appointmentId: number
  hospitalizationId: number
  hospitalizationSpareId: number
  donorId: number
  donationId: number
  productId: number
  adminToken: string  // branch-pinned
  doctorToken: string // branch-pinned
}

let A: TenantFixture // attacker
let B: TenantFixture // victim

type Outcome = 'BLOCKED' | 'HIT' | 'UNTESTED'
interface Row { id: string; endpoint: string; injected: string; control: number; attack: number; outcome: Outcome }
const results: Row[] = []

/**
 * Run the control (attacker's own ids) and the attack (victim's ids) against one endpoint.
 * `mk(useVictim)` builds the supertest request.
 */
async function probe(
  id: string,
  endpoint: string,
  injected: string,
  mk: (victim: boolean) => request.Test,
): Promise<Row> {
  const control = await mk(false)
  const attack = await mk(true)
  const c = control.status
  const a = attack.status
  const controlOk = c >= 200 && c < 300
  const attackCreated = a >= 200 && a < 300
  const outcome: Outcome = attackCreated ? 'HIT' : controlOk ? 'BLOCKED' : 'UNTESTED'
  const row: Row = { id, endpoint, injected, control: c, attack: a, outcome }
  if (!controlOk) {
    // eslint-disable-next-line no-console
    console.warn(`[${id}] CONTROL FAILED ${c} on ${endpoint} — attack result is not meaningful. body=${JSON.stringify(control.body).slice(0, 220)}`)
  }
  if (attackCreated) {
    // eslint-disable-next-line no-console
    console.error(`[${id}] ATTACK ACCEPTED ${a} on ${endpoint} (${injected}) body=${JSON.stringify(attack.body).slice(0, 300)}`)
  }
  results.push(row)
  return row
}

async function login(subdomain: string, username: string, branchId: number): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain, username, password: PASSWORD })
  if (step1.status !== 200) throw new Error(`login ${username} failed ${step1.status}: ${JSON.stringify(step1.body)}`)

  if (step1.body.data.requiresBranchSelection === false) {
    // clinic_admin bypasses branch selection and gets an all-branches (branchId=null) token.
    // /api/invoices and /api/prescriptions call requireBranchId and 400 on that token, so
    // pin a branch explicitly via switch-branch (admin holds staff.assign_branch).
    const adminToken = step1.body.data.token as string
    const sw = await request(server).post('/auth/switch-branch')
      .set('Authorization', `Bearer ${adminToken}`).send({ branchId })
    if (sw.status !== 200) throw new Error(`switch-branch failed ${sw.status}: ${JSON.stringify(sw.body)}`)
    return sw.body.data.token as string
  }

  const { pendingToken } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId })
  if (step2.status !== 200) throw new Error(`select-branch failed ${step2.status}: ${JSON.stringify(step2.body)}`)
  return step2.body.data.token as string
}

async function seedTenant(subdomain: string, label: string): Promise<TenantFixture> {
  const tag = label[0].toLowerCase() // 'v' victim / 'a' attacker — keeps usernames inside VarChar(20)
  const adminUsername = `adm${tag}${STAMP}`
  const doctorUsername = `doc${tag}${STAMP}`
  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  const adminRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })

  const tenant = await prisma.tenant.create({ data: { name: `XT ${label}`, subdomain } })
  const tenantId = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId, name: 'Main Branch' } })
  await prisma.tenantSettings.upsert({ where: { tenantId }, update: {}, create: { tenantId } })

  const admin = await prisma.user.create({
    data: { tenantId, branchId: branch.id, name: `Admin ${label}`, username: adminUsername,
            email: `admin@${subdomain}.test`, passwordHash, roleId: adminRole.id },
  })
  await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id, tenantId } })
  await prisma.userBranch.create({ data: { tenantId, userId: admin.id, branchId: branch.id } })

  const doctor = await prisma.user.create({
    data: { tenantId, branchId: branch.id, name: `Doctor ${label}`, username: doctorUsername,
            email: `doctor@${subdomain}.test`, passwordHash, roleId: doctorRole.id },
  })
  await prisma.userRole.create({ data: { userId: doctor.id, roleId: doctorRole.id, tenantId } })
  await prisma.userBranch.create({ data: { tenantId, userId: doctor.id, branchId: branch.id } })

  const owner = await prisma.owner.create({
    data: { tenantId, firstName: `Secret${label}`, lastName: `Surname${label}`,
            phone: `08${tag}${STAMP}`, idCardNumber: `${tag}${STAMP}`, address: `Addr ${label}`,
            loyaltyPoints: 5000 },
  })
  const mkPet = (n: string) => prisma.pet.create({
    data: { tenantId, ownerId: owner.id, branchId: branch.id, name: n, species: 'Dog' },
  })
  const pet = await mkPet(`Pet${label}`)
  const petSpare = await mkPet(`PetSpare${label}`)

  const appointment = await prisma.appointment.create({
    data: { tenantId, branchId: branch.id, petId: pet.id, doctorId: doctor.id, scheduledAt: new Date(), durationMin: 30 },
  })
  const mkRecord = () => prisma.medicalRecord.create({
    data: { tenantId, branchId: branch.id, petId: pet.id, doctorId: doctor.id, assessment: `Assessment ${label}` },
  })
  const record = await mkRecord()
  const recordSpare = await mkRecord()

  const mkHosp = () => prisma.hospitalization.create({
    data: { tenantId, branchId: branch.id, petId: pet.id, reason: `Reason ${label}`, dailyRate: 100, status: 'admitted' },
  })
  const hosp = await mkHosp()
  const hospSpare = await mkHosp()

  // Donor on `pet`; `petSpare` is left free so the donor-registration control has a pet
  // that is not already a donor (blood_donors is @@unique([tenantId, petId])).
  const donor = await prisma.bloodDonor.create({ data: { tenantId, petId: pet.id, bloodType: 'DEA1.1-' } })
  const donation = await prisma.bloodDonation.create({
    data: { tenantId, donorId: donor.id, volumeMl: 450, expiryDate: new Date(Date.now() + 30 * 86400000), status: 'available' },
  })
  const product = await prisma.inventoryItem.create({
    data: { tenantId, name: `Drug ${label}`, unit: 'tab', unitPrice: 10, isActive: true },
  })
  await prisma.branchInventory.create({ data: { tenantId, branchId: branch.id, productId: product.id, stockQty: 100000 } })

  const adminToken  = await login(subdomain, adminUsername, branch.id)
  const doctorToken = await login(subdomain, doctorUsername, branch.id)

  return {
    tenantId, branchId: branch.id, adminId: admin.id, doctorId: doctor.id, ownerId: owner.id,
    petId: pet.id, petSpareId: petSpare.id,
    medicalRecordId: record.id, medicalRecordSpareId: recordSpare.id,
    appointmentId: appointment.id,
    hospitalizationId: hosp.id, hospitalizationSpareId: hospSpare.id,
    donorId: donor.id, donationId: donation.id, productId: product.id,
    adminToken, doctorToken,
  }
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
  B = await seedTenant(SUB_B, 'VICTIM')
  A = await seedTenant(SUB_A, 'ATTACKER')
}, 180_000)

afterAll(async () => {
  const ids = [A?.tenantId, B?.tenantId].filter((v): v is number => typeof v === 'number')
  if (ids.length) {
    const w = { where: { tenantId: { in: ids } } }
    await prisma.stockMovement.deleteMany(w)
    await prisma.loyaltyTransaction.deleteMany(w)
    await prisma.paymentHistory.deleteMany(w)
    await prisma.invoiceItem.deleteMany(w)
    await prisma.invoice.deleteMany(w)
    await prisma.bloodTransfusion.deleteMany(w)
    await prisma.bloodDonation.deleteMany(w)
    await prisma.bloodDonor.deleteMany(w)
    await prisma.dailyInpatientCare.deleteMany(w)
    await prisma.hospitalization.deleteMany(w)
    await prisma.groomingBooking.deleteMany(w)
    await prisma.petReminder.deleteMany(w)
    await prisma.attachment.deleteMany(w)
    await prisma.prescription.deleteMany(w)
    await prisma.vaccination.deleteMany(w)
    await prisma.medicalRecord.deleteMany(w)
    await prisma.appointment.deleteMany(w)
    await prisma.branchInventory.deleteMany(w)
    await prisma.inventoryItem.deleteMany(w)
    await prisma.pet.deleteMany(w)
    await prisma.owner.deleteMany(w)
    await prisma.userBranch.deleteMany(w)
    await prisma.userRole.deleteMany(w)
    await prisma.refreshToken.deleteMany(w)
    await prisma.user.deleteMany(w)
    await prisma.tenantSettings.deleteMany(w)
    await prisma.branch.deleteMany(w)
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } })
  }
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 180_000)

const asAdmin  = (t: request.Test) => t.set('Authorization', `Bearer ${A.adminToken}`)
const asDoctor = (t: request.Test) => t.set('Authorization', `Bearer ${A.doctorToken}`)
const post = (p: string) => request(server).post(p)
const put  = (p: string) => request(server).put(p)

// Every probe must end BLOCKED. HIT = reachable cross-tenant write (Lane C).
// UNTESTED = the control failed, so the guard was never exercised — also a failure,
// because it means this suite did not actually cover that path.
const expectBlocked = (r: Row) => expect(`${r.id}:${r.outcome}`).toBe(`${r.id}:BLOCKED`)

describe('C-1 — cross-tenant FK injection through the HTTP API (control + attack per FK)', () => {
  it('P1 POST /api/vaccinations — petId', async () => {
    expectBlocked(await probe('P1', 'POST /api/vaccinations', 'petId', v =>
      asDoctor(post('/api/vaccinations')).send({
        petId: v ? B.petId : A.petId, vaccineName: 'Rabies',
        administeredAt: iso(), nextDueAt: iso(5 * 86400000),
      })))
  })

  it('P2 POST /api/appointments — petId', async () => {
    let n = 0
    expectBlocked(await probe('P2', 'POST /api/appointments', 'petId', v =>
      asAdmin(post('/api/appointments')).send({
        petId: v ? B.petId : A.petId, doctorId: A.doctorId,
        scheduledAt: iso((100 + n++) * 3600000), durationMin: 30,
      })))
  })

  it('P3 POST /api/appointments — doctorId', async () => {
    let n = 0
    expectBlocked(await probe('P3', 'POST /api/appointments', 'doctorId', v =>
      asAdmin(post('/api/appointments')).send({
        petId: A.petId, doctorId: v ? B.doctorId : A.doctorId,
        scheduledAt: iso((200 + n++) * 3600000), durationMin: 30,
      })))
  })

  it('P4 POST /api/appointments/walk-in — petId and doctorId', async () => {
    expectBlocked(await probe('P4a', 'POST /api/appointments/walk-in', 'petId', v =>
      asAdmin(post('/api/appointments/walk-in')).send({ petId: v ? B.petId : A.petId, doctorId: A.doctorId, reason: 'x' })))
    expectBlocked(await probe('P4b', 'POST /api/appointments/walk-in', 'doctorId', v =>
      asAdmin(post('/api/appointments/walk-in')).send({ petId: A.petId, doctorId: v ? B.doctorId : A.doctorId, reason: 'x' })))
  })

  it('P5 POST /api/medical-records — petId, doctorId, appointmentId', async () => {
    expectBlocked(await probe('P5a', 'POST /api/medical-records', 'petId', v =>
      asDoctor(post('/api/medical-records')).send({ petId: v ? B.petId : A.petId, doctorId: A.doctorId, assessment: 'x' })))
    expectBlocked(await probe('P5b', 'POST /api/medical-records', 'doctorId', v =>
      asDoctor(post('/api/medical-records')).send({ petId: A.petId, doctorId: v ? B.doctorId : A.doctorId, assessment: 'x' })))
    expectBlocked(await probe('P5c', 'POST /api/medical-records', 'appointmentId', v =>
      asDoctor(post('/api/medical-records')).send({
        petId: A.petId, doctorId: A.doctorId, appointmentId: v ? B.appointmentId : A.appointmentId, assessment: 'x',
      })))
  })

  it('P6 PUT /api/medical-records/:id — appointmentId', async () => {
    expectBlocked(await probe('P6', 'PUT /api/medical-records/:id', 'appointmentId', v =>
      asDoctor(put(`/api/medical-records/${A.medicalRecordId}`))
        .send({ appointmentId: v ? B.appointmentId : A.appointmentId })))
  })

  it('P6b PUT /api/medical-records/:id — petId/doctorId mass-assignment is stripped', async () => {
    const res = await asDoctor(put(`/api/medical-records/${A.medicalRecordId}`))
      .send({ assessment: 'mass-assign probe', petId: B.petId, doctorId: B.doctorId })
    results.push({ id: 'P6b', endpoint: 'PUT /api/medical-records/:id', injected: 'petId+doctorId (mass-assign)',
                   control: res.status, attack: res.status, outcome: 'BLOCKED' })
    const after = await prisma.medicalRecord.findUniqueOrThrow({
      where: { id: A.medicalRecordId }, select: { petId: true, doctorId: true },
    })
    expect(after.petId).toBe(A.petId)
    expect(after.doctorId).toBe(A.doctorId)
  })

  it('P7 POST /api/prescriptions — medicalRecordId and drugId', async () => {
    expectBlocked(await probe('P7a', 'POST /api/prescriptions', 'medicalRecordId', v =>
      asDoctor(post('/api/prescriptions')).send({
        medicalRecordId: v ? B.medicalRecordId : A.medicalRecordId, drugId: A.productId, quantity: 1,
      })))
    expectBlocked(await probe('P7b', 'POST /api/prescriptions', 'drugId', v =>
      asDoctor(post('/api/prescriptions')).send({
        medicalRecordId: A.medicalRecordId, drugId: v ? B.productId : A.productId, quantity: 1,
      })))
  })

  it('P8 POST /api/invoices — petId, medicalRecordId, item.productId', async () => {
    const line = { description: 'x', itemType: 'service', qty: 1, unitPrice: 100 }
    expectBlocked(await probe('P8a', 'POST /api/invoices', 'petId', v =>
      asAdmin(post('/api/invoices')).send({ petId: v ? B.petId : A.petId, items: [line] })))
    expectBlocked(await probe('P8b', 'POST /api/invoices', 'medicalRecordId', v =>
      asAdmin(post('/api/invoices')).send({
        medicalRecordId: v ? B.medicalRecordId : A.medicalRecordSpareId, items: [line],
      })))
    expectBlocked(await probe('P8c', 'POST /api/invoices', 'item.productId', v =>
      asAdmin(post('/api/invoices')).send({
        petId: A.petId,
        items: [{ description: 'retail', itemType: 'retail', qty: 1, unitPrice: 10, productId: v ? B.productId : A.productId }],
      })))
  })

  it('P9 POST /api/hospitalizations — petId and doctorInCharge', async () => {
    expectBlocked(await probe('P9a', 'POST /api/hospitalizations', 'petId', v =>
      asAdmin(post('/api/hospitalizations')).send({ petId: v ? B.petId : A.petId, reason: 'x', dailyRate: 100 })))
    expectBlocked(await probe('P9b', 'POST /api/hospitalizations', 'doctorInCharge', v =>
      asAdmin(post('/api/hospitalizations')).send({
        petId: A.petId, reason: 'x', doctorInCharge: v ? B.doctorId : A.doctorId, dailyRate: 100,
      })))
  })

  it('P10 PUT /api/hospitalizations/:id — doctorInCharge', async () => {
    expectBlocked(await probe('P10', 'PUT /api/hospitalizations/:id', 'doctorInCharge', v =>
      asAdmin(put(`/api/hospitalizations/${A.hospitalizationId}`)).send({
        reason: 'x', doctorInCharge: v ? B.doctorId : A.doctorId, dailyRate: 100,
      })))
  })

  it('P11 POST /api/hospitalizations/:id/care — hospitalizationId in the path', async () => {
    expectBlocked(await probe('P11', 'POST /api/hospitalizations/:id/care', 'hospitalizationId', v =>
      asAdmin(post(`/api/hospitalizations/${v ? B.hospitalizationId : A.hospitalizationSpareId}/care`))
        .send({ timeSlot: '08:00', notes: 'x' })))
  })

  it('P12 POST /api/reminders — petId', async () => {
    expectBlocked(await probe('P12', 'POST /api/reminders', 'petId', v =>
      asAdmin(post('/api/reminders')).send({
        petId: v ? B.petId : A.petId, reminderType: 'vaccination', message: 'x', dueDate: iso(),
      })))
  })

  it('P13 POST /api/blood-bank/donors — petId (B-3: createDonor has no guard of its own)', async () => {
    expectBlocked(await probe('P13', 'POST /api/blood-bank/donors', 'petId', v =>
      asAdmin(post('/api/blood-bank/donors')).send({ petId: v ? B.petId : A.petSpareId, bloodType: 'DEA1.1-' })))
  })

  it('P14 POST /api/blood-bank/collections — donorId', async () => {
    expectBlocked(await probe('P14', 'POST /api/blood-bank/collections', 'donorId', v =>
      asAdmin(post('/api/blood-bank/collections')).send({
        donorId: v ? B.donorId : A.donorId, volumeMl: 450, expiryDate: iso(30 * 86400000),
      })))
  })

  it('P15 POST /api/blood-bank/transfusions — recipientPetId and donationId', async () => {
    expectBlocked(await probe('P15a', 'POST /api/blood-bank/transfusions', 'recipientPetId', v =>
      asAdmin(post('/api/blood-bank/transfusions')).send({ recipientPetId: v ? B.petId : A.petId, volumeMl: 10 })))
    expectBlocked(await probe('P15b', 'POST /api/blood-bank/transfusions', 'donationId', v =>
      asAdmin(post('/api/blood-bank/transfusions')).send({
        recipientPetId: A.petId, donationId: v ? B.donationId : A.donationId, volumeMl: 10,
      })))
  })

  it('P16 POST /api/grooming/bookings — petId and groomerId', async () => {
    let n = 0
    expectBlocked(await probe('P16a', 'POST /api/grooming/bookings', 'petId', v =>
      asAdmin(post('/api/grooming/bookings')).send({
        petId: v ? B.petId : A.petId, serviceType: 'bath', scheduledAt: iso((300 + n++) * 3600000),
      })))
    expectBlocked(await probe('P16b', 'POST /api/grooming/bookings', 'groomerId', v =>
      asAdmin(post('/api/grooming/bookings')).send({
        petId: A.petId, groomerId: v ? B.doctorId : A.doctorId, serviceType: 'bath', scheduledAt: iso((400 + n++) * 3600000),
      })))
  })

  it('P17 POST /api/pets — ownerId', async () => {
    let n = 0
    expectBlocked(await probe('P17', 'POST /api/pets', 'ownerId', v =>
      asAdmin(post('/api/pets')).send({ ownerId: v ? B.ownerId : A.ownerId, name: `New${n++}`, species: 'Cat' })))
  })

  it('P18 PUT /api/pets/:id — ownerId mass-assignment is stripped', async () => {
    const res = await asAdmin(put(`/api/pets/${A.petSpareId}`)).send({ name: 'Renamed', ownerId: B.ownerId })
    results.push({ id: 'P18', endpoint: 'PUT /api/pets/:id', injected: 'ownerId (mass-assign)',
                   control: res.status, attack: res.status, outcome: 'BLOCKED' })
    const after = await prisma.pet.findUniqueOrThrow({ where: { id: A.petSpareId }, select: { ownerId: true } })
    expect(after.ownerId).toBe(A.ownerId)
  })

  it('P19 POST /api/medical-records/:id/attachments — medicalRecordId in the path', async () => {
    expectBlocked(await probe('P19a', 'POST /api/medical-records/:id/attachments (URL mode)', 'medicalRecordId', v =>
      post(`/api/medical-records/${v ? B.medicalRecordId : A.medicalRecordId}/attachments`)
        .set('Authorization', `Bearer ${A.doctorToken}`)
        .send({ fileName: 'x.pdf', fileUrl: 'https://example.com/x.pdf', fileType: 'lab' })))
    expectBlocked(await probe('P19b', 'POST /api/medical-records/:id/attachments (upload mode)', 'medicalRecordId', v =>
      post(`/api/medical-records/${v ? B.medicalRecordId : A.medicalRecordId}/attachments`)
        .set('Authorization', `Bearer ${A.doctorToken}`)
        .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'x.pdf', contentType: 'application/pdf' })))
  })

  it('P20 POST /api/loyalty/redeem — ownerId', async () => {
    expectBlocked(await probe('P20', 'POST /api/loyalty/redeem', 'ownerId', v =>
      asAdmin(post('/api/loyalty/redeem')).send({ ownerId: v ? B.ownerId : A.ownerId, points: 1 })))
  })

  it('P22 PUT /api/invoices/:id/payment — invoiceId in the path (writes payment_history + loyalty_transactions)', async () => {
    const mkInvoice = async (tenant: TenantFixture, token: string) => {
      const r = await post('/api/invoices').set('Authorization', `Bearer ${token}`)
        .send({ petId: tenant.petId, items: [{ description: 'pay probe', itemType: 'service', qty: 1, unitPrice: 500 }] })
      expect(r.status).toBe(201)
      return r.body.data.id as number
    }
    const ownInvoice = await mkInvoice(A, A.adminToken)
    const victimInvoice = await mkInvoice(B, B.adminToken)
    expectBlocked(await probe('P22', 'PUT /api/invoices/:id/payment', 'invoiceId', v =>
      asAdmin(put(`/api/invoices/${v ? victimInvoice : ownInvoice}/payment`)).send({ paymentMethod: 'cash' })))
  })

  it('P23 PUT /api/hospitalizations/:id/discharge — auto-bills an invoice from another row\'s petId', async () => {
    const mkHosp = async (tenant: TenantFixture, token: string) => {
      const r = await post('/api/hospitalizations').set('Authorization', `Bearer ${token}`)
        .send({ petId: tenant.petId, reason: 'discharge probe', dailyRate: 250 })
      expect(r.status).toBe(201)
      return r.body.data.id as number
    }
    const ownHosp = await mkHosp(A, A.adminToken)
    const victimHosp = await mkHosp(B, B.adminToken)
    expectBlocked(await probe('P23', 'PUT /api/hospitalizations/:id/discharge', 'hospitalizationId', v =>
      asAdmin(put(`/api/hospitalizations/${v ? victimHosp : ownHosp}/discharge`)).send({})))
  })

  it('P24 DELETE /api/prescriptions/:id — restock writes a stock_movement with the prescription\'s drugId', async () => {
    const mkRx = async (tenant: TenantFixture, token: string) => {
      const r = await post('/api/prescriptions').set('Authorization', `Bearer ${token}`)
        .send({ medicalRecordId: tenant.medicalRecordId, drugId: tenant.productId, quantity: 2 })
      expect(r.status).toBe(201)
      return r.body.data.id as number
    }
    const ownRx = await mkRx(A, A.doctorToken)
    const victimRx = await mkRx(B, B.doctorToken)
    expectBlocked(await probe('P24', 'DELETE /api/prescriptions/:id', 'prescriptionId', v =>
      request(server).delete(`/api/prescriptions/${v ? victimRx : ownRx}`)
        .set('Authorization', `Bearer ${A.doctorToken}`)))
  })

  it('P25 POST /api/products/:id/stock-in — productId in the path (writes stock_movements.itemId)', async () => {
    expectBlocked(await probe('P25', 'POST /api/products/:id/stock-in', 'productId', v =>
      asAdmin(post(`/api/products/${v ? B.productId : A.productId}/stock-in`)).send({ qty: 5 })))
  })

  it('P26 POST /api/inventory/transfers — productId and branch ids', async () => {
    // A second branch is needed for a valid transfer; the control must be a real transfer.
    const branch2 = await prisma.branch.create({ data: { tenantId: A.tenantId, name: 'Second Branch' } })
    await prisma.branchInventory.create({
      data: { tenantId: A.tenantId, branchId: branch2.id, productId: A.productId, stockQty: 0 },
    })
    expectBlocked(await probe('P26a', 'POST /api/inventory/transfers', 'productId', v =>
      asAdmin(post('/api/inventory/transfers')).send({
        productId: v ? B.productId : A.productId, fromBranchId: A.branchId, toBranchId: branch2.id, qty: 1,
      })))
    expectBlocked(await probe('P26b', 'POST /api/inventory/transfers', 'toBranchId', v =>
      asAdmin(post('/api/inventory/transfers')).send({
        productId: A.productId, fromBranchId: A.branchId, toBranchId: v ? B.branchId : branch2.id, qty: 1,
      })))
  })

  it('P21 TOCTOU — 16 concurrent cross-tenant writes against the service-layer (non-transactional) guards', async () => {
    // vaccination / blood-donor / appointment / pet all validate the FK in the SERVICE
    // layer — a separate round trip from the write, not inside its transaction. Hammer
    // those four concurrently in case check and write can be interleaved.
    const burst = Array.from({ length: 16 }, (_, i) => {
      switch (i % 4) {
        case 0: return asDoctor(post('/api/vaccinations'))
          .send({ petId: B.petId, vaccineName: `Race${i}`, administeredAt: iso() })
        case 1: return asAdmin(post('/api/blood-bank/donors'))
          .send({ petId: B.petId, bloodType: 'DEA1.1-' })
        case 2: return asAdmin(post('/api/appointments'))
          .send({ petId: B.petId, doctorId: A.doctorId, scheduledAt: iso((500 + i) * 3600000), durationMin: 30 })
        default: return asAdmin(post('/api/pets'))
          .send({ ownerId: B.ownerId, name: `Race${i}`, species: 'Cat' })
      }
    })
    const burstResults = await Promise.all(burst)
    const accepted = burstResults.filter(r => r.status >= 200 && r.status < 300)
    results.push({ id: 'P21', endpoint: 'concurrent burst x16', injected: 'FK=VICTIM under concurrency',
                   control: 0, attack: accepted.length, outcome: accepted.length ? 'HIT' : 'BLOCKED' })
    expect(accepted.map(r => r.status)).toEqual([])
  }, 90_000)
})

/** Shared by the sweep and its self-test: returns every tenantId mismatch across both test tenants. */
async function sweepViolations(tenantIds: number[]): Promise<string[]> {
  // [child table, child FK column, parent table] — every forward FK on the affected models
  const pairs: [string, string, string][] = [
    ['vaccinations',          'petId',             'pets'],
    ['appointments',          'petId',             'pets'],
    ['appointments',          'doctorId',          'users'],
    ['medical_records',       'petId',             'pets'],
    ['medical_records',       'doctorId',          'users'],
    ['medical_records',       'appointmentId',     'appointments'],
    ['prescriptions',         'medicalRecordId',   'medical_records'],
    ['prescriptions',         'drugId',            'inventory_items'],
    ['invoices',              'petId',             'pets'],
    ['invoices',              'medicalRecordId',   'medical_records'],
    ['invoice_items',         'invoiceId',         'invoices'],
    ['attachments',           'medicalRecordId',   'medical_records'],
    ['attachments',           'uploadedByUserId',  'users'],
    ['hospitalizations',      'petId',             'pets'],
    ['hospitalizations',      'doctorInCharge',    'users'],
    ['daily_inpatient_care',  'hospitalizationId', 'hospitalizations'],
    ['daily_inpatient_care',  'performedBy',       'users'],
    ['pet_reminders',         'petId',             'pets'],
    ['blood_donors',          'petId',             'pets'],
    ['blood_donations',       'donorId',           'blood_donors'],
    ['blood_transfusions',    'recipientPetId',    'pets'],
    ['blood_transfusions',    'donationId',        'blood_donations'],
    ['grooming_bookings',     'petId',             'pets'],
    ['grooming_bookings',     'groomerId',         'users'],
    ['loyalty_transactions',  'ownerId',           'owners'],
    ['loyalty_transactions',  'invoiceId',         'invoices'],
    ['stock_movements',       'itemId',            'inventory_items'],
    ['payment_history',       'invoiceId',         'invoices'],
    ['pets',                  'ownerId',           'owners'],
    ['branch_inventory',      'productId',         'inventory_items'],
    // branchId FKs: BA scoped BRANCH-LEVEL isolation out (backlog B-2), but a row in
    // tenant A pointing at a branch owned by tenant B is a TENANT violation and belongs
    // in this sweep regardless.
    ['branch_inventory',      'branchId',          'branches'],
    ['stock_movements',       'branchId',          'branches'],
    ['appointments',          'branchId',          'branches'],
    ['medical_records',       'branchId',          'branches'],
    ['invoices',              'branchId',          'branches'],
    ['hospitalizations',      'branchId',          'branches'],
    ['grooming_bookings',     'branchId',          'branches'],
    ['payment_history',       'branchId',          'branches'],
    ['pets',                  'branchId',          'branches'],
    ['users',                 'branchId',          'branches'],
    ['user_branches',         'branchId',          'branches'],
  ]
  const violations: string[] = []
  for (const [child, fk, parent] of pairs) {
    const sql = `
      SELECT c.id AS child_id, c."tenantId" AS child_tenant, p."tenantId" AS parent_tenant
      FROM "${child}" c
      JOIN "${parent}" p ON p.id = c."${fk}"
      WHERE c."tenantId" = ANY($1::int[])
        AND p."tenantId" <> c."tenantId"
      LIMIT 5`
    const rows = await prisma.$queryRawUnsafe<{ child_id: number; child_tenant: number; parent_tenant: number }[]>(sql, tenantIds)
    for (const r of rows) {
      violations.push(`${child}.${fk} -> ${parent}: row ${r.child_id} (tenant ${r.child_tenant}) points at tenant ${r.parent_tenant}`)
    }
  }
  return violations
}

/**
 * SIDE-FINDING (read-side, not a C-1 hit) — BA sign-off E-2 is built on a false premise.
 *
 * E-2 says: "Reverse-direction includes (parent -> children) are already safe... the parent
 * is already tenant-filtered and children carry their own tenantId. Must be explicitly
 * declared safe so the sweep and the enforcement rule do not churn them."
 *
 * A reverse `include` applies NO predicate to the child rows. Children carrying their own
 * tenantId does not help unless something FILTERS on it, and nothing does. So the same
 * single corrupt row that leaks forward also leaks backward — in the opposite direction:
 *
 *   forward  (invoice.pet.owner):     tenant A's corrupt row pulls tenant B's PII out to A
 *   reverse  (pet.vaccinations):      tenant A's corrupt row pushes A's OWN data into B's
 *                                     response — the victim is the tenant that did nothing
 *
 * These are CHARACTERIZATION tests: they assert today's (wrong) behaviour so it is recorded
 * and reviewable. When arch's XTI-7 mechanism covers reverse includes these will START
 * FAILING — that is the signal to delete them, not to loosen them.
 */
describe('SIDE-FINDING — E-2 premise: reverse includes are NOT safe by construction', () => {
  it('a foreign-tenant child row is returned through a reverse include (attachments + vaccinations)', async () => {
    const planted = {
      attachment: await prisma.attachment.create({
        data: { tenantId: A.tenantId, medicalRecordId: B.medicalRecordId, fileName: 'FOREIGN-A.pdf', fileUrl: 'https://a.example/x.pdf' },
      }),
      vaccination: await prisma.vaccination.create({
        data: { tenantId: A.tenantId, petId: B.petId, vaccineName: 'FOREIGN-A-VAX', administeredAt: new Date() },
      }),
    }
    try {
      // Exactly the include medical-record.repository.ts findById uses, run as the VICTIM.
      const recAsVictim = await prisma.medicalRecord.findFirst({
        where: { id: B.medicalRecordId, tenantId: B.tenantId },
        include: { attachments: { select: { id: true, tenantId: true, fileName: true } } },
      })
      const attLeak = recAsVictim!.attachments.filter(a => a.tenantId !== B.tenantId)

      // Exactly the include pet.repository.ts findPetById uses, run as the VICTIM.
      const petAsVictim = await prisma.pet.findFirst({
        where: { id: B.petId, tenantId: B.tenantId, isActive: true },
        include: { vaccinations: { select: { id: true, tenantId: true, vaccineName: true } } },
      })
      const vaxLeak = petAsVictim!.vaccinations.filter(v => v.tenantId !== B.tenantId)

      // eslint-disable-next-line no-console
      console.warn(
        '\n[E-2] reverse include leaked foreign-tenant children into the victim tenant\'s response:'
        + `\n  medical_records.attachments : ${attLeak.length} foreign row(s) ${JSON.stringify(attLeak)}`
        + `\n  pets.vaccinations           : ${vaxLeak.length} foreign row(s) ${JSON.stringify(vaxLeak)}`
        + '\n  => BA E-2 must NOT instruct arch to exclude reverse includes from XTI-7.\n')

      expect(attLeak).toHaveLength(1)
      expect(vaxLeak).toHaveLength(1)
    } finally {
      await prisma.attachment.delete({ where: { id: planted.attachment.id } })
      await prisma.vaccination.delete({ where: { id: planted.vaccination.id } })
    }
  }, 60_000)
})

describe('C-1 VERDICT', () => {
  /**
   * A sweep that can never fail proves nothing. Plant the exact corrupt row PR #73's test
   * fabricated — a tenant-A vaccination whose petId points at a tenant-B pet — confirm the
   * sweep reports it, then remove it. Without this, "0 violations" is not evidence.
   */
  it('SELF-TEST — the sweep detects a deliberately planted cross-tenant row', async () => {
    const planted = await prisma.vaccination.create({
      data: { tenantId: A.tenantId, petId: B.petId, vaccineName: 'PLANTED', administeredAt: new Date() },
    })
    try {
      const found = await sweepViolations([A.tenantId, B.tenantId])
      expect(found.some(v => v.startsWith('vaccinations.petId'))).toBe(true)
      expect(found.some(v => v.includes(`row ${planted.id} `))).toBe(true)
    } finally {
      await prisma.vaccination.delete({ where: { id: planted.id } })
    }
    // and it goes quiet again once the planted row is gone
    expect(await sweepViolations([A.tenantId, B.tenantId])).toEqual([])
  }, 90_000)

  it('summary — every probe must be BLOCKED with a passing control', () => {
    const pad = (s: string | number, n: number) => String(s).padEnd(n)
    const lines = results.map(r =>
      `${pad(r.id, 6)} ${pad(r.outcome, 9)} ctrl=${pad(r.control, 4)} atk=${pad(r.attack, 4)} ${pad(r.endpoint, 54)} ${r.injected}`)
    // eslint-disable-next-line no-console
    console.log('\n===== C-1 probe matrix (ctrl = own id, must be 2xx; atk = victim id, must not be) =====\n'
      + lines.join('\n')
      + `\n\nprobes=${results.length}  BLOCKED=${results.filter(r => r.outcome === 'BLOCKED').length}`
      + `  HIT=${results.filter(r => r.outcome === 'HIT').length}`
      + `  UNTESTED=${results.filter(r => r.outcome === 'UNTESTED').length}\n`)

    expect(results.filter(r => r.outcome === 'HIT')).toEqual([])
    expect(results.filter(r => r.outcome === 'UNTESTED')).toEqual([])
  })

  it('database integrity sweep — no row anywhere has a tenantId differing from its FK parent', async () => {
    const violations = await sweepViolations([A.tenantId, B.tenantId])
    if (violations.length) {
      // eslint-disable-next-line no-console
      console.error('\n!!!!! CROSS-TENANT FK CREATED THROUGH THE APP !!!!!\n' + violations.join('\n') + '\n')
    }
    expect(violations).toEqual([])
  }, 90_000)
})
