// tests/security/tenant-isolation.test.ts
// CRITICAL: These tests MUST pass 100% before every production deploy
// Run with: npm run test:security

import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-ci';

// ── Test Fixtures ─────────────────────────────────────────
let tenantA: any, tenantB: any;
let userA: any,   userB: any;
let tokenA: string, tokenB: string;
let petA_id: number, petB_id: number;
let recordA_id: number;

function makeToken(userId: number, tenantId: number, role = 'doctor') {
  return jwt.sign({ userId, tenantId, role }, JWT_SECRET, { expiresIn: '1h' });
}

beforeAll(async () => {
  const hash = await bcrypt.hash('Test@1234', 12);

  // Create two separate clinics
  tenantA = await prisma.tenants.create({ data: { name: 'Clinic Alpha', subdomain: `alpha-${Date.now()}` } });
  tenantB = await prisma.tenants.create({ data: { name: 'Clinic Beta',  subdomain: `beta-${Date.now()}`  } });

  userA = await prisma.users.create({ data: { tenant_id: tenantA.id, name: 'Dr A', email: `dra-${Date.now()}@a.com`, password_hash: hash, role: 'doctor' } });
  userB = await prisma.users.create({ data: { tenant_id: tenantB.id, name: 'Dr B', email: `drb-${Date.now()}@b.com`, password_hash: hash, role: 'doctor' } });

  tokenA = makeToken(userA.id, tenantA.id);
  tokenB = makeToken(userB.id, tenantB.id);

  // Create a pet in each clinic
  const ownerA = await prisma.owners.create({ data: { tenant_id: tenantA.id, first_name: 'Alice', last_name: 'A', phone: `080-A-${Date.now()}` } });
  const ownerB = await prisma.owners.create({ data: { tenant_id: tenantB.id, first_name: 'Bob',   last_name: 'B', phone: `080-B-${Date.now()}` } });

  const petA = await prisma.pets.create({ data: { tenant_id: tenantA.id, owner_id: ownerA.id, name: 'PetAlpha', species: 'Dog' } });
  const petB = await prisma.pets.create({ data: { tenant_id: tenantB.id, owner_id: ownerB.id, name: 'PetBeta',  species: 'Cat' } });

  petA_id = petA.id;
  petB_id = petB.id;

  // Create an EMR in clinic A
  const record = await prisma.medical_records.create({
    data: { tenant_id: tenantA.id, pet_id: petA_id, doctor_id: userA.id, subjective: 'secret clinical note' },
  });
  recordA_id = record.id;
});

afterAll(async () => {
  // Cleanup test data (order matters for FK constraints)
  await prisma.medical_records.deleteMany({ where: { tenant_id: { in: [tenantA.id, tenantB.id] } } });
  await prisma.pets.deleteMany(           { where: { tenant_id: { in: [tenantA.id, tenantB.id] } } });
  await prisma.owners.deleteMany(         { where: { tenant_id: { in: [tenantA.id, tenantB.id] } } });
  await prisma.users.deleteMany(          { where: { tenant_id: { in: [tenantA.id, tenantB.id] } } });
  await prisma.tenants.deleteMany(        { where: { id:        { in: [tenantA.id, tenantB.id] } } });
  await prisma.$disconnect();
});

// ── Tests ──────────────────────────────────────────────────

describe('🔒 Tenant Isolation — Pets', () => {

  test('Clinic A can read their own pet', async () => {
    const res = await request(app)
      .get(`/api/pets/${petA_id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(petA_id);
  });

  test('Clinic B CANNOT read Clinic A pet — returns 404 (not 403)', async () => {
    const res = await request(app)
      .get(`/api/pets/${petA_id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    // Must be 404, NOT 403 — do not reveal existence to other tenants
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('PetAlpha');
  });

  test('Clinic A list returns ONLY their own pets', async () => {
    const res = await request(app)
      .get('/api/pets')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const ids: number[] = res.body.data.map((p: any) => p.tenant_id);
    expect(ids.every(id => id === tenantA.id)).toBe(true);
    expect(ids).not.toContain(tenantB.id);
  });
});

describe('🔒 Tenant Isolation — Medical Records', () => {

  test('Clinic A can read their own medical record', async () => {
    const res = await request(app)
      .get(`/api/medical-records/${recordA_id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
  });

  test('Clinic B CANNOT read Clinic A medical record', async () => {
    const res = await request(app)
      .get(`/api/medical-records/${recordA_id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
    // The secret note must never appear in response to wrong tenant
    expect(JSON.stringify(res.body)).not.toContain('secret clinical note');
  });
});

describe('🔒 Authentication', () => {

  test('Request with no token returns 401', async () => {
    const res = await request(app).get('/api/pets');
    expect(res.status).toBe(401);
  });

  test('Request with expired token returns 401', async () => {
    const expiredToken = jwt.sign({ userId: 1, tenantId: 1, role: 'doctor' }, JWT_SECRET, { expiresIn: '-1s' });
    const res = await request(app)
      .get('/api/pets')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  test('Request with invalid token returns 401', async () => {
    const res = await request(app)
      .get('/api/pets')
      .set('Authorization', 'Bearer this.is.invalid');
    expect(res.status).toBe(401);
  });

  test('Token without tenantId is rejected', async () => {
    const badToken = jwt.sign({ userId: 99, role: 'doctor' }, JWT_SECRET, { expiresIn: '1h' });
    const res = await request(app)
      .get('/api/pets')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });
});

describe('🔒 RBAC — Role Enforcement', () => {

  test('Staff cannot create medical records', async () => {
    const staffToken = makeToken(userA.id, tenantA.id, 'staff');
    const res = await request(app)
      .post('/api/medical-records')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ petId: petA_id, subjective: 'test' });
    expect(res.status).toBe(403);
  });

  test('Doctor can create medical records', async () => {
    const res = await request(app)
      .post('/api/medical-records')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ petId: petA_id, subjective: 'test visit' });
    expect([200, 201]).toContain(res.status);
  });
});

describe('🔒 Input Validation', () => {

  test('Negative weight is rejected', async () => {
    const res = await request(app)
      .post('/api/medical-records')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ petId: petA_id, weightKg: -5 });
    expect(res.status).toBe(400);
  });

  test('Missing petId is rejected', async () => {
    const res = await request(app)
      .post('/api/medical-records')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ subjective: 'no petId provided' });
    expect(res.status).toBe(400);
  });
});
