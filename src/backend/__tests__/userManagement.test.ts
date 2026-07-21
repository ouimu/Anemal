/**
 * Test Suite: user-1.5 — User Management API
 * @qa-agent | Protocol: qa-protocols.md §1 + §2 + §3 + §4
 *
 * Tests GET/POST/PUT/DELETE /users — full CRUD + isolation + validation.
 *
 * Run: npx jest --testPathPattern=userManagement.test
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../app'
import prisma from '../config/db'
import bcrypt from 'bcrypt'
import { signToken } from '../config/jwt'
import { seedUserRoles, cleanupUserRoles } from '../tests/helpers/seedUserRoles'
import * as userService from '../services/user.service'

// ── Fixture ───────────────────────────────────────────────────────────────────
let server: Server
let tenantId: number
let adminId: number
let targetUserId: number
let doctorRoleId: number
let staffRoleId: number

const SUBDOMAIN = `users-test-${Date.now()}`

function adminToken() {
  return `Bearer ${signToken({ userId: adminId, tenantId, plane: 'clinic', permSetVersion: 1, role: 'admin' })}`
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })

  const hash = await bcrypt.hash('TestPass1!', 10)
  const ts = Date.now()
  const tenant = await prisma.tenant.create({ data: { name: 'User Mgmt Test', subdomain: SUBDOMAIN } })
  tenantId = tenant.id

  // Phase 3: user creation enforces the plan's user limit. These CRUD tests create
  // many users, so put this tenant on an unlimited plan (limit behaviour is covered
  // separately in subscription.test.ts).
  await prisma.tenantSettings.create({ data: { tenantId, planTier: 'professional' } })

  const [adminSystemRole, doctorSystemRole, staffSystemRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor',       tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
  ])
  doctorRoleId = doctorSystemRole.id
  staffRoleId  = staffSystemRole.id

  const admin = await prisma.user.create({
    data: { tenantId, name: 'Test Admin', username: `adm_${ts % 100000}`, email: `admin-${ts}@users-test.local`, passwordHash: hash, roleId: adminSystemRole.id },
  })
  adminId = admin.id

  const target = await prisma.user.create({
    data: { tenantId, name: 'Target Doctor', username: `doc_${ts % 100000}`, email: `doctor-${ts}@users-test.local`, passwordHash: hash, roleId: doctorSystemRole.id },
  })
  targetUserId = target.id

  await seedUserRoles(prisma, [
    { userId: adminId,       tenantId, roleKey: 'clinic_admin' },
    { userId: targetUserId,  tenantId, roleKey: 'doctor'       },
  ])
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await cleanupUserRoles(prisma, [tenantId])
  await prisma.user.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('user-1.5 — GET /users', () => {

  test('user-01: List returns all tenant users', async () => {
    // Type: happy_path
    const res = await request(server)
      .get('/users')
      .set('Authorization', adminToken())
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThanOrEqual(2) // admin + doctor

    // No cross-tenant data
    res.body.data.forEach((u: { tenantId: number }) => {
      expect(u.tenantId).toBe(tenantId)
    })
  })

  test('user-02: List response shape has expected fields', async () => {
    // Type: happy_path
    const res = await request(server)
      .get('/users')
      .set('Authorization', adminToken())
      .expect(200)

    const user = res.body.data[0]
    expect(user).toHaveProperty('id')
    expect(user).toHaveProperty('name')
    expect(user).toHaveProperty('email')
    expect(user).toHaveProperty('role')
    expect(user).toHaveProperty('isActive')
    expect(user).toHaveProperty('createdAt')
    // SECURITY: passwordHash must not be exposed
    expect(user).not.toHaveProperty('passwordHash')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('user-1.5 — GET /users/:id', () => {

  test('user-03: Get existing user by ID', async () => {
    // Type: happy_path
    const res = await request(server)
      .get(`/users/${targetUserId}`)
      .set('Authorization', adminToken())
      .expect(200)

    expect(res.body.data.id).toBe(targetUserId)
  })

  test('user-04: Get non-existent ID returns 404', async () => {
    // Type: edge_case
    await request(server)
      .get('/users/999999999')
      .set('Authorization', adminToken())
      .expect(404)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('user-1.5 — POST /users', () => {

  test('user-05: Create new staff user', async () => {
    // Type: happy_path
    const ts = Date.now() % 100000
    const res = await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ name: 'New Staff', username: `newstaff_${ts}`, email: `newstaff-${ts}@users-test.local`, password: 'StaffPass1!', roleId: staffRoleId })
      .expect(201)

    expect(res.body.data.role.key).toBe('clinic_staff')
    expect(res.body.data.isActive).toBe(true)
    expect(res.body.data.tenantId).toBe(tenantId)
  })

  test('user-06: Create new doctor user', async () => {
    // Type: happy_path
    const ts = Date.now() % 100000
    const res = await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ name: 'New Doctor', username: `newdoc_${ts}`, email: `newdoc-${ts}@users-test.local`, password: 'DocPass1!', roleId: doctorRoleId })
      .expect(201)

    expect(res.body.data.role.key).toBe('doctor')
  })

  test('user-07: Duplicate username within same tenant → 409', async () => {
    // Type: edge_case
    const ts = Date.now() % 100000
    const username = `dup_${ts}`
    await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ name: 'First', username, email: `dup1-${ts}@users-test.local`, password: 'Pass1234!', roleId: staffRoleId })
      .expect(201)

    await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ name: 'Second', username, email: `dup2-${ts}@users-test.local`, password: 'Pass1234!', roleId: staffRoleId })
      .expect(409)
  })

  test('user-08: Missing required field name → 400', async () => {
    // Type: edge_case / input validation
    const ts = Date.now() % 100000
    await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ username: `noname_${ts}`, email: `x-${ts}@t.com`, password: 'Pass1234!', roleId: staffRoleId })
      .expect(400)
  })

  test('user-09: Password shorter than 8 chars → 400', async () => {
    // Type: edge_case / input validation (NFR-04)
    const ts = Date.now() % 100000
    await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ name: 'Short Pass', username: `short_${ts}`, email: `sp-${ts}@t.com`, password: 'abc', roleId: staffRoleId })
      .expect(400)
  })

  test('user-10: Invalid roleId type → 400', async () => {
    // Type: edge_case / input validation
    const ts = Date.now() % 100000
    await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ name: 'Bad Role', username: `badrole_${ts}`, email: `br-${ts}@t.com`, password: 'Pass1234!', roleId: 'superuser' })
      .expect(400)
  })

  test('user-11: Admin cannot create user in a different tenant (isolation)', async () => {
    // Given: another tenant exists
    // When:  Admin from Tenant A creates a user — tenantId is always taken from JWT
    // Then:  created user belongs to Tenant A, not any other tenant
    // Type:  security
    const ts = Date.now() % 100000
    const res = await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ name: 'Isolated', username: `iso_${ts}`, email: `iso-${ts}@t.com`, password: 'Pass1234!', roleId: staffRoleId })
      .expect(201)

    // The service always uses req.context.tenantId — never from request body
    expect(res.body.data.tenantId).toBe(tenantId)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('user-1.5 — PUT /users/:id', () => {

  test('user-12: Update user name', async () => {
    // Type: happy_path
    const res = await request(server)
      .put(`/users/${targetUserId}`)
      .set('Authorization', adminToken())
      .send({ name: 'Updated Doctor Name' })
      .expect(200)

    expect(res.body.data.name).toBe('Updated Doctor Name')
  })

  test('user-13: Change role from doctor to staff', async () => {
    // Type: happy_path
    const res = await request(server)
      .put(`/users/${targetUserId}`)
      .set('Authorization', adminToken())
      .send({ roleId: staffRoleId })
      .expect(200)

    expect(res.body.data.role.key).toBe('clinic_staff')
  })

  test('user-14: Deactivate user via PUT isActive=false', async () => {
    // Type: happy_path
    const res = await request(server)
      .put(`/users/${targetUserId}`)
      .set('Authorization', adminToken())
      .send({ isActive: false })
      .expect(200)

    expect(res.body.data.isActive).toBe(false)

    // Restore
    await request(server)
      .put(`/users/${targetUserId}`)
      .set('Authorization', adminToken())
      .send({ isActive: true })
  })

  test('user-15: Update non-existent user → 404', async () => {
    // Type: edge_case
    await request(server)
      .put('/users/999999999')
      .set('Authorization', adminToken())
      .send({ name: 'Ghost' })
      .expect(404)
  })

  test('user-16: Update with invalid roleId type → 400', async () => {
    // Type: edge_case / input validation
    await request(server)
      .put(`/users/${targetUserId}`)
      .set('Authorization', adminToken())
      .send({ roleId: 'superuser' })
      .expect(400)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('user-1.5 — DELETE /users/:id (soft delete)', () => {

  test('user-17: Deactivate user via DELETE', async () => {
    // Type: happy_path
    const ts = Date.now() % 100000
    const hash = await bcrypt.hash('TestPass1!', 10)
    const staffSystemRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    const tempUser = await prisma.user.create({
      data: { tenantId, name: 'Temp User', username: `temp_${ts}`, email: `temp-${ts}@users-test.local`, passwordHash: hash, roleId: staffSystemRole.id },
    })

    await request(server)
      .delete(`/users/${tempUser.id}`)
      .set('Authorization', adminToken())
      .expect(200)

    // Verify soft delete — user still exists but isActive=false
    const updated = await prisma.user.findUnique({ where: { id: tempUser.id } })
    expect(updated?.isActive).toBe(false)
  })

  test('user-18: Delete non-existent user → 404', async () => {
    // Type: edge_case
    await request(server)
      .delete('/users/999999999')
      .set('Authorization', adminToken())
      .expect(404)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('user-1.5 — Concurrent edge cases', () => {

  test('user-19: Double-submit POST /users with same payload is idempotent or 409', async () => {
    // Given: rapid double-submit with identical payload
    // Then:  first succeeds, second returns 409 (duplicate email)
    // Type:  concurrent / edge_case
    const ts = Date.now() % 100000
    const payload = {
      name: 'Double Tap', username: `doubletap_${ts}`, email: `double-${ts}@users-test.local`,
      password: 'Pass1234!', roleId: staffRoleId,
    }
    const [r1, r2] = await Promise.all([
      request(server).post('/users').set('Authorization', adminToken()).send(payload),
      request(server).post('/users').set('Authorization', adminToken()).send(payload),
    ])
    const statuses = [r1.status, r2.status].sort()
    expect(statuses).toContain(201)
    expect(statuses).toContain(409)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// T-URA-2.1 — userService.createUser/updateUser now take roleId directly;
// safe() keeps UserResponse.role as a legacy string (Plan A constraint).
describe('user-1.5 — roleId-based create/update (ADR-0019/D-7)', () => {
  let fullPerms: Set<string>

  beforeAll(async () => {
    const adminRoleWithPerms = await prisma.clinicRole.findFirstOrThrow({
      where: { key: 'clinic_admin', tenantId: null },
      include: { permissions: true },
    })
    fullPerms = new Set([...adminRoleWithPerms.permissions.map(p => p.permissionCode), 'staff.assign_role'])
  })

  test('createUser accepts roleId and persists the correct role FK (role object in the response, Plan B shape)', async () => {
    const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const created = await userService.createUser(tenantId, {
      name: 'New Doctor', username: `new_doctor_ura_${Date.now() % 100000}`, email: `newdoc-ura-${Date.now()}@test.com`,
      password: 'TestPass1!', roleId: doctorRole.id,
    }, fullPerms, true)
    expect(created.role.key).toBe('doctor')
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: created.id } })
    expect(dbUser.roleId).toBe(doctorRole.id)
  })

  test('createUser rejects an unknown roleId', async () => {
    await expect(userService.createUser(tenantId, {
      name: 'Bad', username: `bad_role_ura_${Date.now() % 100000}`, email: `bad-ura-${Date.now()}@test.com`,
      password: 'TestPass1!', roleId: 999999,
    }, fullPerms, true)).rejects.toMatchObject({ statusCode: 400 })
  })

  test('updateUser accepts roleId and replaces the user role (role object in the response, Plan B shape)', async () => {
    const staffRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const user = await userService.createUser(tenantId, {
      name: 'Switchable', username: `switchable_ura_${Date.now() % 100000}`, email: `sw-ura-${Date.now()}@test.com`,
      password: 'TestPass1!', roleId: staffRole.id,
    }, fullPerms, true)
    const updated = await userService.updateUser(
      tenantId, user.id, { roleId: doctorRole.id },
      fullPerms, true,
    )
    expect(updated.role.key).toBe('doctor')
  })

  test('a custom-role user\'s response role carries the full custom role object (Plan B shape)', async () => {
    const customRoleKey = `tenant_${tenantId}_accountant_ura6_${Date.now()}`
    const customRole = await prisma.clinicRole.create({
      data: { tenantId, key: customRoleKey, name: 'Accountant', isSystem: false, permVersion: 1 },
    })
    const created = await userService.createUser(tenantId, {
      name: 'Custom Role User', username: `cr_ura6_${Date.now() % 100000}`, email: `cr-ura-${Date.now()}@test.com`,
      password: 'TestPass1!', roleId: customRole.id,
    }, fullPerms, true)
    expect(created.role).toEqual({ id: customRole.id, name: 'Accountant', key: customRoleKey, isSystem: false })
  })

  test('LEGACY_ROLE_TO_SYSTEM_KEY no longer exists in user.service.ts', () => {
    const source = require('fs').readFileSync(require.resolve('../services/user.service.ts'), 'utf8')
    expect(source).not.toContain('LEGACY_ROLE_TO_SYSTEM_KEY')
  })

  test('rejects a roleId change from a caller lacking staff.assign_role', async () => {
    const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const target = await userService.createUser(tenantId, {
      name: 'Target', username: `tgt1_${Date.now() % 100000}`, email: `t-gate-${Date.now()}@test.com`,
      password: 'TestPass1!', roleId: doctorRole.id,
    }, fullPerms, true)

    await expect(userService.updateUser(
      tenantId, target.id, { roleId: doctorRole.id },
      new Set(['staff.manage']), false,
    )).rejects.toMatchObject({ statusCode: 403 })
  })

  test('allows a name-only edit without staff.assign_role', async () => {
    const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const target = await userService.createUser(tenantId, {
      name: 'Target2', username: `tgt2_${Date.now() % 100000}`, email: `t2-gate-${Date.now()}@test.com`,
      password: 'TestPass1!', roleId: doctorRole.id,
    }, fullPerms, true)

    const updated = await userService.updateUser(
      tenantId, target.id, { name: 'Renamed' },
      new Set(['staff.manage']), false,
    )
    expect(updated.name).toBe('Renamed')
  })

  test('rejects assigning a role whose permissions exceed the caller\'s own', async () => {
    const adminRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
    const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const target = await userService.createUser(tenantId, {
      name: 'Target3', username: `tgt3_${Date.now() % 100000}`, email: `t3-gate-${Date.now()}@test.com`,
      password: 'TestPass1!', roleId: doctorRole.id,
    }, fullPerms, true)

    await expect(userService.updateUser(
      tenantId, target.id, { roleId: adminRole.id },
      new Set(['staff.manage', 'staff.view', 'staff.assign_role']),
      true,
    )).rejects.toMatchObject({ statusCode: 403 })
  })

  test('allows a clinic_admin-level caller to assign any role within their permission set', async () => {
    const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const adminRoleWithPerms = await prisma.clinicRole.findFirstOrThrow({
      where: { key: 'clinic_admin', tenantId: null },
      include: { permissions: true },
    })
    const target = await userService.createUser(tenantId, {
      name: 'Target4', username: `tgt4_${Date.now() % 100000}`, email: `t4-gate-${Date.now()}@test.com`,
      password: 'TestPass1!', roleId: doctorRole.id,
    }, fullPerms, true)

    const fullAdminPerms = new Set([...adminRoleWithPerms.permissions.map(p => p.permissionCode), 'staff.assign_role'])
    const updated = await userService.updateUser(
      tenantId, target.id, { roleId: adminRoleWithPerms.id },
      fullAdminPerms, true,
    )
    expect(updated.role.key).toBe('clinic_admin')
  })

  test('a roles.manage holder who is NOT admin-equivalent still cannot assign the sealed clinic_admin role (D-4 assign-path seal)', async () => {
    const adminRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
    const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const target = await userService.createUser(tenantId, {
      name: 'Target5', username: `tgt5_${Date.now() % 100000}`, email: `t5-gate-${Date.now()}@test.com`,
      password: 'TestPass1!', roleId: doctorRole.id,
    }, fullPerms, true)

    // roles.manage would blanket-exempt the general subset check, but must
    // NOT exempt assigning the sealed clinic_admin role itself.
    const rolesManageOnlyPerms = new Set(['staff.manage', 'staff.assign_role', 'roles.manage'])
    await expect(userService.updateUser(
      tenantId, target.id, { roleId: adminRole.id },
      rolesManageOnlyPerms, true,
    )).rejects.toMatchObject({ statusCode: 403 })
  })

  test('rejects assigning a custom role that belongs to a different tenant (tenant isolation)', async () => {
    const otherTenant = await prisma.tenant.create({
      data: { name: `Other Tenant ${Date.now()}`, subdomain: `other-ura-${Date.now() % 100000}` },
    })
    const otherTenantRole = await prisma.clinicRole.create({
      data: { tenantId: otherTenant.id, key: `tenant_${otherTenant.id}_foreign_${Date.now()}`, name: 'Foreign Role', isSystem: false, permVersion: 1 },
    })
    const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const target = await userService.createUser(tenantId, {
      name: 'Target6', username: `tgt6_${Date.now() % 100000}`, email: `t6-gate-${Date.now()}@test.com`,
      password: 'TestPass1!', roleId: doctorRole.id,
    }, fullPerms, true)

    await expect(userService.updateUser(
      tenantId, target.id, { roleId: otherTenantRole.id },
      fullPerms, true,
    )).rejects.toMatchObject({ statusCode: 404 })

    await prisma.clinicRole.delete({ where: { id: otherTenantRole.id } })
    await prisma.tenant.delete({ where: { id: otherTenant.id } })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Plan B — safe() moves from the transitional legacy-string role to a full
// role object + isPrimaryAdmin flag (T-URA-2.3 deferred half).
describe('user-1.5 — role object + isPrimaryAdmin (Plan B shape)', () => {
  test('GET /users returns a nested role object and isPrimaryAdmin flag (Plan B shape)', async () => {
    const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const adminRoleWithPerms = await prisma.clinicRole.findFirstOrThrow({
      where: { key: 'clinic_admin', tenantId: null },
      include: { permissions: true },
    })
    const fullPerms = new Set([...adminRoleWithPerms.permissions.map(p => p.permissionCode), 'staff.assign_role'])
    const user = await userService.createUser(tenantId, {
      name: 'Shape Check', username: `shape_ura_b_${Date.now() % 100000}`, email: `shape-${Date.now() % 100000}@test.com`,
      password: 'TestPass1!', roleId: doctorRole.id,
    }, fullPerms, true)
    const fetched = await userService.getUserById(tenantId, user.id)
    expect(fetched.role).toEqual({ id: doctorRole.id, name: doctorRole.name, key: 'doctor', isSystem: true })
    expect(typeof fetched.isPrimaryAdmin).toBe('boolean')
  })

  test('isPrimaryAdmin is true for exactly one user per tenant, even if another user also holds clinic_admin', async () => {
    const users = await userService.listUsers(tenantId)
    const primaryAdmins = users.filter(u => u.isPrimaryAdmin)
    expect(primaryAdmins).toHaveLength(1)
    const expectedPrimaryId = primaryAdmins[0].id
    const otherAdminHolders = users.filter(u => u.role.key === 'clinic_admin' && u.id !== expectedPrimaryId)
    for (const other of otherAdminHolders) {
      expect(other.isPrimaryAdmin).toBe(false)
    }
  })
})
