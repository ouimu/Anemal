/**
 * CI-enforced role/route authorization matrix (ADR-0005 D2).
 *
 * Enumerates every mounted route via `walkRoutes` and asserts the
 * authorization OUTCOME (not functional correctness) for each system role:
 *   - allowed = response status NOT IN {401, 403}
 *   - denied  = exactly 403
 *   - no-token sweep = exactly 401
 *
 * A mounted clinic route with no guard annotation FAILS unless it appears on
 * the explicit `UNMAPPED_ALLOWLIST` below (verified intentionally-unguarded
 * by reading its route file). This is the "unmapped-route guard" — a route
 * added later without an annotation and without an allowlist entry breaks CI.
 *
 * Also sweeps both plane-mismatch directions: a clinic token hitting any
 * `/platform/*` route, and a platform token hitting any guarded clinic
 * route, must both be rejected with 403 (requirePlane runs before any
 * permission check on both mount trees — see routes/*.routes.ts).
 */
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { signPlatformToken } from '../../config/jwt'
import { seedUserRoles, cleanupUserRoles } from '../helpers/seedUserRoles'
import { walkRoutes, EnumeratedRoute } from '../helpers/expressRouteWalker'

const SUB = 'role-route-matrix'
const PASSWORD = 'TestPass1!'

type ClinicRoleKey = 'clinic_admin' | 'doctor' | 'clinic_staff'
const CLINIC_ROLE_KEYS: readonly ClinicRoleKey[] = ['clinic_admin', 'doctor', 'clinic_staff']

let server: Server
let tid = 0
let adminToken = ''
let doctorToken = ''
let staffToken = ''
let platformToken = ''
let platformUserId = 0
let rolePerms: Record<ClinicRoleKey, Set<string>>

/**
 * Routes intentionally left without a `requirePermission`/`requireAnyPermission`
 * guard, verified by reading each route file directly (ADR-0005 D2).
 */
const UNMAPPED_ALLOWLIST: Array<{ method: string; path: string; reason: string }> = [
  { method: 'GET',  path: '/health',               reason: 'Public health check, mounted directly on app, no auth at all.' },
  { method: 'POST', path: '/auth/login',            reason: 'Public — credentials ARE the auth.' },
  { method: 'POST', path: '/auth/select-branch',    reason: 'Public — step 2 of login, secured by signed pendingToken, not a permission.' },
  { method: 'POST', path: '/auth/refresh',          reason: 'Public — refresh token IS the auth.' },
  { method: 'POST', path: '/auth/logout',           reason: 'Public — revokes by refresh token, no permission needed.' },
  { method: 'GET',  path: '/auth/me',               reason: "requirePlane('clinic') only — any authenticated clinic user reads their own identity, no permission gate by design." },
  { method: 'GET',  path: '/api/settings/personal', reason: 'requirePlane(\'clinic\') only — S2.3: personal preferences are self-service for any clinic role.' },
  { method: 'PUT',  path: '/api/settings/personal', reason: "requirePlane('clinic') only — same as above." },
]

function isAllowlisted(route: EnumeratedRoute): boolean {
  return UNMAPPED_ALLOWLIST.some(a => a.method === route.method && a.path === route.path)
}

/**
 * Public `/platform/auth/*` endpoints that carry NO `authMiddleware`/`requirePlane`
 * at all (verified against routes/platform-auth.routes.ts — login/refresh/logout are
 * public by design, the credential/refresh-token/logout-token IS the auth). A clinic
 * token sent to these is simply ignored, not rejected for plane mismatch, so they are
 * out of scope for the plane-mismatch sweep below (mirrors the clinic-side
 * UNMAPPED_ALLOWLIST reasoning for /auth/login, /auth/refresh, /auth/logout).
 */
const PLATFORM_PUBLIC_ROUTES: Array<{ method: string; path: string }> = [
  { method: 'POST', path: '/platform/auth/login' },
  { method: 'POST', path: '/platform/auth/refresh' },
  { method: 'POST', path: '/platform/auth/logout' },
]

function isPlatformPublic(route: EnumeratedRoute): boolean {
  return PLATFORM_PUBLIC_ROUTES.some(p => p.method === route.method && p.path === route.path)
}

/** Replaces `:param` segments with a dummy id — guards run before any id is resolved. */
function buildUrl(path: string): string {
  return path.replace(/:[^/]+/g, '999999')
}

/** Issues the HTTP call for a single enumerated route, optionally bearing a token. */
async function callRoute(route: EnumeratedRoute, token?: string): Promise<number> {
  const url = buildUrl(route.path)
  const base = request(server)
  let req
  switch (route.method) {
    case 'GET':    req = base.get(url); break
    case 'POST':   req = base.post(url).send({}); break
    case 'PUT':    req = base.put(url).send({}); break
    case 'PATCH':  req = base.patch(url).send({}); break
    case 'DELETE': req = base.delete(url); break
  }
  if (token) req = req.set('Authorization', `Bearer ${token}`)
  const res = await req
  return res.status
}

/** Derives a role's granted permission codes at runtime (no seed-rbac import — ADR-0005 D2/grill F2/F3). */
async function expectedPermissionsFor(roleKey: ClinicRoleKey): Promise<Set<string>> {
  const role = await prisma.clinicRole.findFirstOrThrow({ where: { key: roleKey, tenantId: null } })
  const grants = await prisma.rolePermission.findMany({ where: { roleId: role.id } })
  return new Set(grants.map(g => g.permissionCode))
}

async function login(username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain: SUB, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const tenant = await prisma.tenant.create({ data: { name: 'Role Route Matrix', subdomain: SUB } })
  tid = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId: tid, name: 'RRM Main' } })

  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  await prisma.user.createMany({
    data: [
      { tenantId: tid, branchId: branch.id, name: 'Admin RRM',  username: 'admin_rrm',  email: 'admin@rrm.test',  passwordHash, role: 'admin' },
      { tenantId: tid, branchId: branch.id, name: 'Doctor RRM', username: 'doctor_rrm', email: 'doctor@rrm.test', passwordHash, role: 'doctor' },
      { tenantId: tid, branchId: branch.id, name: 'Staff RRM',  username: 'staff_rrm',  email: 'staff@rrm.test',  passwordHash, role: 'staff' },
    ],
  })
  const [uAdmin, uDoctor, uStaff] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { tenantId: tid, username: 'admin_rrm' } }),
    prisma.user.findFirstOrThrow({ where: { tenantId: tid, username: 'doctor_rrm' } }),
    prisma.user.findFirstOrThrow({ where: { tenantId: tid, username: 'staff_rrm' } }),
  ])
  await seedUserRoles(prisma, [
    { userId: uAdmin.id,  tenantId: tid, roleKey: 'clinic_admin' },
    { userId: uDoctor.id, tenantId: tid, roleKey: 'doctor' },
    { userId: uStaff.id,  tenantId: tid, roleKey: 'clinic_staff' },
  ])
  await prisma.userBranch.createMany({
    data: [
      { tenantId: tid, userId: uAdmin.id,  branchId: branch.id },
      { tenantId: tid, userId: uDoctor.id, branchId: branch.id },
      { tenantId: tid, userId: uStaff.id,  branchId: branch.id },
    ],
    skipDuplicates: true,
  })

  adminToken  = await login('admin_rrm')
  doctorToken = await login('doctor_rrm')
  staffToken  = await login('staff_rrm')

  const platformUser = await prisma.platformUser.create({
    data: { name: 'RRM Platform Admin', email: 'rrm-platform-admin@test.anemal', passwordHash: 'x', role: 'platform_super_admin' },
  })
  platformUserId = platformUser.id
  platformToken = signPlatformToken({ platformUserId: platformUser.id, plane: 'platform', role: 'platform_super_admin' })

  rolePerms = {
    clinic_admin: await expectedPermissionsFor('clinic_admin'),
    doctor:       await expectedPermissionsFor('doctor'),
    clinic_staff: await expectedPermissionsFor('clinic_staff'),
  }
}, 30000)

afterAll(async () => {
  await cleanupUserRoles(prisma, [tid])
  await prisma.userBranch.deleteMany({ where: { tenantId: tid } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
  await prisma.platformUser.deleteMany({ where: { id: platformUserId } })
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30000)

const allRoutes = walkRoutes(app)
const clinicRoutes = allRoutes.filter(r => !r.path.startsWith('/platform'))
const platformRoutes = allRoutes.filter(r => r.path.startsWith('/platform'))

describe('role-route authorization matrix — clinic routes (unmapped-route guard + per-role sweep)', () => {
  for (const route of clinicRoutes) {
    it(`${route.method} ${route.path}`, async () => {
      if (isAllowlisted(route)) {
        // Guards against the allowlist going stale: if someone adds a guard
        // later without removing the allowlist entry, this assertion catches it.
        expect(route.permissionCodes).toBeUndefined()
        return
      }
      if (!route.permissionCodes || !route.mode) {
        throw new Error(
          `Unmapped route with no guard annotation and not on UNMAPPED_ALLOWLIST: ${route.method} ${route.path}`,
        )
      }
      const codes = route.permissionCodes
      const mode = route.mode

      const noTokenStatus = await callRoute(route)
      expect(noTokenStatus).toBe(401)

      for (const roleKey of CLINIC_ROLE_KEYS) {
        const token = { clinic_admin: adminToken, doctor: doctorToken, clinic_staff: staffToken }[roleKey]
        const expectedAllowed =
          mode === 'all' ? codes.every(c => rolePerms[roleKey].has(c)) : codes.some(c => rolePerms[roleKey].has(c))
        const status = await callRoute(route, token)
        if (expectedAllowed) {
          expect(status).not.toBe(401)
          expect(status).not.toBe(403)
        } else {
          expect(status).toBe(403)
        }
      }
    })
  }
})

describe('role-route authorization matrix — plane sweep (clinic token -> /platform/*)', () => {
  for (const route of platformRoutes.filter(r => !isPlatformPublic(r))) {
    it(`${route.method} ${route.path} rejects a clinic-plane token with 403`, async () => {
      const status = await callRoute(route, adminToken)
      expect(status).toBe(403)
    })
  }
})

describe('role-route authorization matrix — plane sweep (platform token -> guarded clinic routes)', () => {
  const guardedClinicRoutes = clinicRoutes.filter(r => r.permissionCodes)
  for (const route of guardedClinicRoutes) {
    it(`${route.method} ${route.path} rejects a platform-plane token with 403`, async () => {
      const status = await callRoute(route, platformToken)
      expect(status).toBe(403)
    })
  }
})
