// @qa-agent — Phase 4 integration + cross-tenant isolation tests.
// Covers: Branch management (RBAC), Loyalty (earn/redeem caps), Hospitalization
// (admit→care→discharge billing), Blood Bank (donor + transfusion compatibility guard),
// Reminders, and write-once Audit logging. Requires a live, freshly-seeded PostgreSQL.

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
  const res = await request(server).post('/auth/login').send({ subdomain, username, password })
  return res.body.data?.token
}

let adminA: string
let adminB: string
let staffA: string
let ownerId: number
let petId: number

beforeAll(async () => {
  adminA = await getToken('dev-clinic',  'admin_a', 'AdminPass1!')
  adminB = await getToken('test-clinic', 'admin_b', 'AdminPass2!')
  staffA = await getToken('dev-clinic',  'staff_a', 'StaffPass1!')

  // Each run creates its own owner + pet (unique microchip via timestamp) in Tenant A.
  const uniq = `${Date.now()}`
  const ownerRes = await request(server).post('/api/owners').set('Authorization', `Bearer ${adminA}`)
    .send({ firstName: 'P4', lastName: `Tester${uniq}`, phone: `08${uniq.slice(-8)}` })
  ownerId = ownerRes.body.data.id

  const petRes = await request(server).post('/api/pets').set('Authorization', `Bearer ${adminA}`)
    .send({ ownerId, name: 'Rex', species: 'dog', microchipId: `MC${uniq}` })
  petId = petRes.body.data.id
})

describe('Phase 4 — Branch Management (admin-only)', () => {
  it('✅ admin lists own branches (seeded ≥ 2 for dev-clinic)', async () => {
    const res = await request(server).get('/api/branches').set('Authorization', `Bearer ${adminA}`)
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThanOrEqual(2)
  })

  it('✅ admin creates a branch', async () => {
    const res = await request(server).post('/api/branches').set('Authorization', `Bearer ${adminA}`)
      .send({ name: `Satellite ${Date.now()}`, phone: '02-111-2222' })
    expect(res.status).toBe(201)
    expect(res.body.data.id).toBeDefined()
  })

  it('✅ staff can view branches → 200 (clinic.branch.view granted to all roles)', async () => {
    const res = await request(server).get('/api/branches').set('Authorization', `Bearer ${staffA}`)
    expect(res.status).toBe(200)
  })

  it('❌ Tenant B cannot read a Tenant A branch by id → 404', async () => {
    const listA = await request(server).get('/api/branches').set('Authorization', `Bearer ${adminA}`)
    const branchAId = listA.body.data[0].id
    const res = await request(server).get(`/api/branches/${branchAId}`).set('Authorization', `Bearer ${adminB}`)
    expect(res.status).toBe(404)
  })
})

describe('Phase 4 — Loyalty (earn on payment, redeem caps)', () => {
  it('✅ paying an invoice earns floor(total/100) points for the pet owner', async () => {
    const before = await request(server).get(`/api/loyalty/owners/${ownerId}`).set('Authorization', `Bearer ${adminA}`)
    const startPoints = before.body.data.points

    // Invoice of 1,000 (+7% VAT = 1,070) → floor(1070/100) = 10 points.
    const inv = await request(server).post('/api/invoices').set('Authorization', `Bearer ${adminA}`)
      .send({ petId, items: [{ description: 'Consult', itemType: 'service', qty: 1, unitPrice: 1000 }], taxRate: 7 })
    expect(inv.status).toBe(201)
    const pay = await request(server).put(`/api/invoices/${inv.body.data.id}/payment`)
      .set('Authorization', `Bearer ${adminA}`).send({ paymentMethod: 'cash' })
    expect(pay.status).toBe(200)

    const after = await request(server).get(`/api/loyalty/owners/${ownerId}`).set('Authorization', `Bearer ${adminA}`)
    expect(after.body.data.points).toBe(startPoints + 10)
  })

  it('❌ redeeming more than 20% of the invoice total → 400', async () => {
    const res = await request(server).post('/api/loyalty/redeem').set('Authorization', `Bearer ${adminA}`)
      .send({ ownerId, points: 5, invoiceTotal: 10 }) // cap = floor(10*0.2)=2
    expect(res.status).toBe(400)
  })

  it('❌ redeeming more points than the owner holds → 400', async () => {
    const res = await request(server).post('/api/loyalty/redeem').set('Authorization', `Bearer ${adminA}`)
      .send({ ownerId, points: 9_999_999 })
    expect(res.status).toBe(400)
  })

  it('❌ Tenant B cannot read Tenant A owner loyalty → 404', async () => {
    const res = await request(server).get(`/api/loyalty/owners/${ownerId}`).set('Authorization', `Bearer ${adminB}`)
    expect(res.status).toBe(404)
  })
})

describe('Phase 4 — Hospitalization (admit → care → discharge billing)', () => {
  let hospId: number

  it('✅ admit a pet → 201, status admitted', async () => {
    const res = await request(server).post('/api/hospitalizations').set('Authorization', `Bearer ${adminA}`)
      .send({ petId, reason: 'Observation', cageNo: 'A-1', dailyRate: 500 })
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('admitted')
    hospId = res.body.data.id
  })

  it('✅ active list includes the admitted patient', async () => {
    const res = await request(server).get('/api/hospitalizations/active').set('Authorization', `Bearer ${adminA}`)
    expect(res.status).toBe(200)
    expect((res.body.data as { id: number }[]).some(h => h.id === hospId)).toBe(true)
  })

  it('✅ log a care entry for a valid time slot → 201', async () => {
    const res = await request(server).post(`/api/hospitalizations/${hospId}/care`).set('Authorization', `Bearer ${adminA}`)
      .send({ timeSlot: '08:00', temperatureC: 38.5, heartRateBpm: 90 })
    expect(res.status).toBe(201)
  })

  it('✅ discharge generates an invoice from the daily rate', async () => {
    const res = await request(server).put(`/api/hospitalizations/${hospId}/discharge`).set('Authorization', `Bearer ${adminA}`).send({})
    expect(res.status).toBe(200)
    expect(res.body.data.hospitalization.status).toBe('discharged')
    expect(res.body.data.invoice).not.toBeNull()
  })

  it('❌ logging care after discharge → 409', async () => {
    const res = await request(server).post(`/api/hospitalizations/${hospId}/care`).set('Authorization', `Bearer ${adminA}`)
      .send({ timeSlot: '12:00' })
    expect(res.status).toBe(409)
  })

  it('❌ Tenant B cannot read a Tenant A hospitalization → 404', async () => {
    const res = await request(server).get(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminB}`)
    expect(res.status).toBe(404)
  })
})

describe('Phase 4 — Blood Bank (donor registry + transfusion compatibility guard)', () => {
  let donorId: number
  let donationId: number

  it('✅ register a donor → 201', async () => {
    const res = await request(server).post('/api/blood-bank/donors').set('Authorization', `Bearer ${adminA}`)
      .send({ petId, bloodType: 'DEA1.1+' })
    expect(res.status).toBe(201)
    donorId = res.body.data.id
  })

  it('❌ registering the same pet twice → 409', async () => {
    const res = await request(server).post('/api/blood-bank/donors').set('Authorization', `Bearer ${adminA}`)
      .send({ petId, bloodType: 'DEA1.1+' })
    expect(res.status).toBe(409)
  })

  it('✅ record a collection bag', async () => {
    const res = await request(server).post('/api/blood-bank/collections').set('Authorization', `Bearer ${adminA}`)
      .send({ donorId, volumeMl: 450, expiryDate: new Date(Date.now() + 30 * 864e5).toISOString() })
    expect(res.status).toBe(201)
    donationId = res.body.data.id
  })

  it('❌ transfusing a mismatched blood type without acknowledgement → 409 INCOMPATIBLE_BLOOD', async () => {
    const res = await request(server).post('/api/blood-bank/transfusions').set('Authorization', `Bearer ${adminA}`)
      .send({ recipientPetId: petId, donationId, volumeMl: 100, recipientBloodType: 'DEA1.1-' })
    expect(res.status).toBe(409)
    expect(res.body.error?.code ?? res.body.code).toBe('INCOMPATIBLE_BLOOD')
  })

  it('✅ transfusing a mismatch WITH acknowledgeMismatch succeeds', async () => {
    const res = await request(server).post('/api/blood-bank/transfusions').set('Authorization', `Bearer ${adminA}`)
      .send({ recipientPetId: petId, donationId, volumeMl: 100, recipientBloodType: 'DEA1.1-', acknowledgeMismatch: true })
    expect(res.status).toBe(201)
  })
})

describe('Phase 4 — Proactive Reminders', () => {
  it('✅ a reminder due today appears in /due, then can be marked sent', async () => {
    const create = await request(server).post('/api/reminders').set('Authorization', `Bearer ${adminA}`)
      .send({ petId, reminderType: 'vaccination', message: 'Rabies booster', dueDate: new Date().toISOString() })
    expect(create.status).toBe(201)
    const id = create.body.data.id

    const due = await request(server).get('/api/reminders/due').set('Authorization', `Bearer ${adminA}`)
    expect((due.body.data as { id: number }[]).some(r => r.id === id)).toBe(true)

    const upd = await request(server).put(`/api/reminders/${id}/status`).set('Authorization', `Bearer ${adminA}`)
      .send({ status: 'sent' })
    expect(upd.status).toBe(200)
    expect(upd.body.data.status).toBe('sent')
  })
})

describe('Phase 4 — Audit logging (write-once trail)', () => {
  it('✅ a state-changing request writes a tenant-scoped audit_logs row', async () => {
    const tenant = await prisma.tenant.findFirst({ where: { subdomain: 'dev-clinic' } })
    const before = await prisma.auditLog.count({ where: { tenantId: tenant!.id } })

    const res = await request(server).post('/api/branches').set('Authorization', `Bearer ${adminA}`)
      .send({ name: `Audited ${Date.now()}` })
    expect(res.status).toBe(201)

    // res.on('finish') fires after the response is flushed; poll briefly for the async write.
    let after = before
    for (let i = 0; i < 20 && after <= before; i++) {
      await new Promise(r => setTimeout(r, 50))
      after = await prisma.auditLog.count({ where: { tenantId: tenant!.id } })
    }
    expect(after).toBeGreaterThan(before)
  })

  it('✅ admin reads paginated audit log (newest first)', async () => {
    const res = await request(server).get('/api/audit?limit=10').set('Authorization', `Bearer ${adminA}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.items)).toBe(true)
    expect(res.body.data).toHaveProperty('total')
    expect(res.body.data.items.length).toBeLessThanOrEqual(10)
  })

  it('✅ audit log is tenant-scoped (Tenant B never sees Tenant A actions)', async () => {
    const res = await request(server).get('/api/audit?limit=100').set('Authorization', `Bearer ${adminB}`)
    expect(res.status).toBe(200)
    const tenantB = await prisma.tenant.findFirst({ where: { subdomain: 'test-clinic' } })
    for (const row of res.body.data.items) expect(row.tenantId).toBe(tenantB!.id)
  })

  it('🚫 staff cannot read the audit log (admin-only)', async () => {
    const res = await request(server).get('/api/audit').set('Authorization', `Bearer ${staffA}`)
    expect(res.status).toBe(403)
  })
})
