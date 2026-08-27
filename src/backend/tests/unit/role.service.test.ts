/**
 * role.service.test.ts — RST-6 service-level tests for `deleteRole`.
 *
 * The load-bearing case (T5): RST-1 narrowed `countRoleUsage` to the caller's own
 * tenant, which means the pre-check can now legitimately return 0 while a
 * cross-tenant `UserRole` row still holds an `onDelete: Restrict` FK against the
 * role (schema.prisma:942). Before RST-6 that combination escaped as an unhandled
 * `PrismaClientKnownRequestError` (P2003) → 500. It must surface as ConflictError → 409.
 *
 * Real Prisma against the test DB with isolated tenant fixtures, same convention as
 * `tests/unit/user.repository.test.ts`. Never touches seeded dev-clinic / test-clinic rows.
 *
 * See `tests/unit/role.repository.test.ts` for the full description of the drift
 * fixture and for T1–T4 (the repository-level scoping proofs).
 */

import prisma from '../../config/db'
import * as roleRepo from '../../models/role.repository'
import * as roleService from '../../services/role.service'
import { ConflictError, ForbiddenError, NotFoundError, AppError } from '../../utils/errors'
import { createTenantPair, findSystemStaffRoleId, teardownRoleTenantFixtures } from './helpers/role-tenant-fixtures'

const STAMP = Date.now()

let tenantAId = 0
let tenantBId = 0
let systemStaffRoleId = 0

/** Owned by tenant A; its ONLY UserRole row is a drifted tenant-B row. */
let driftRoleId = 0
/** Owned by tenant A; legitimately assigned to a tenant-A user. */
let inUseRoleId = 0

let userAId = 0  // tenant A — legitimate holder of inUseRoleId
let userBId = 0  // tenant B — drifted holder of driftRoleId

/** Create a fresh unassigned custom role in tenant A (for happy-path deletes). */
async function makeDisposableRole(label: string): Promise<number> {
  const role = await prisma.clinicRole.create({
    data: {
      tenantId: tenantAId,
      isSystem: false,
      name:     `RS ${label} ${STAMP}`,
      key:      `rs_${label}_${STAMP}`.slice(0, 50),
    },
  })
  return role.id
}

beforeAll(async () => {
  const tenantPair = await createTenantPair('RoleSvc Unit', 'role-svc-unit', STAMP)
  tenantAId = tenantPair.tenantAId
  tenantBId = tenantPair.tenantBId
  systemStaffRoleId = await findSystemStaffRoleId()

  driftRoleId = await makeDisposableRole('drift')
  inUseRoleId = await makeDisposableRole('inuse')

  const [userA, userB] = await Promise.all([
    prisma.user.create({
      data: {
        tenantId: tenantAId, name: 'RS User A', username: `rsa_${STAMP}`,
        email: `rsa-${STAMP}@example.test`, passwordHash: 'x', roleId: inUseRoleId, isActive: true,
      },
    }),
    // Primary roleId stays on the SYSTEM role so the only FK holding driftRoleId
    // is UserRole.role — the Restrict edge RST-6 has to translate into a 409.
    prisma.user.create({
      data: {
        tenantId: tenantBId, name: 'RS User B', username: `rsb_${STAMP}`,
        email: `rsb-${STAMP}@example.test`, passwordHash: 'x', roleId: systemStaffRoleId, isActive: true,
      },
    }),
  ])
  userAId = userA.id
  userBId = userB.id

  await prisma.userRole.createMany({
    data: [
      { userId: userAId, roleId: inUseRoleId, tenantId: tenantAId }, // legitimate
      { userId: userBId, roleId: driftRoleId, tenantId: tenantBId }, // DRIFTED
    ],
  })
})

afterAll(async () => {
  await teardownRoleTenantFixtures([tenantAId, tenantBId])
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('deleteRole — FK violation is a 409, not a 500 (RST-6)', () => {
  it('T5: drift fixture — usage count says 0 but the Restrict FK still blocks → ConflictError (409)', async () => {
    // Precondition that makes this test load-bearing rather than incidental: after
    // RST-1 the tenant-scoped pre-check genuinely reports "no usage", so control
    // reaches roleRepo.deleteRole and the DB — not the count guard — is what refuses.
    await expect(roleRepo.countRoleUsage(driftRoleId, tenantAId)).resolves.toBe(0)

    const err: unknown = await roleService.deleteRole(tenantAId, driftRoleId).then(() => null, e => e)

    expect(err).toBeInstanceOf(ConflictError)
    expect((err as AppError).statusCode).toBe(409)
    expect((err as AppError).code).toBe('CONFLICT')

    // The role must survive the refused delete — no partial state.
    const still = await prisma.clinicRole.findFirst({ where: { id: driftRoleId, tenantId: tenantAId } })
    expect(still).not.toBeNull()
  })

  it('the same-tenant in-use path still returns 409 from the count pre-check, before touching the DB', async () => {
    // Distinguishes the two 409 producers: this one must never reach roleRepo.deleteRole.
    const deleteSpy = jest.spyOn(roleRepo, 'deleteRole')

    const err: unknown = await roleService.deleteRole(tenantAId, inUseRoleId).then(() => null, e => e)

    expect(err).toBeInstanceOf(ConflictError)
    expect((err as AppError).statusCode).toBe(409)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('T6: happy path — an unassigned custom role still deletes cleanly', async () => {
    const happyRoleId = await makeDisposableRole('happy')

    await expect(roleService.deleteRole(tenantAId, happyRoleId)).resolves.toBeUndefined()

    const gone = await prisma.clinicRole.findUnique({ where: { id: happyRoleId } })
    expect(gone).toBeNull()
  })

  it('a non-P2003 error from roleRepo.deleteRole propagates unchanged (not swallowed as a 409)', async () => {
    const roleId = await makeDisposableRole('passthru')
    const boom = new Error('transport exploded')
    jest.spyOn(roleRepo, 'deleteRole').mockRejectedValueOnce(boom)

    const err: unknown = await roleService.deleteRole(tenantAId, roleId).then(() => null, e => e)

    // Identity check — the exact object, not a re-wrapped clone.
    expect(err).toBe(boom)
    expect(err).not.toBeInstanceOf(ConflictError)
  })
})

describe('deleteRole — pre-existing guards must not regress', () => {
  it('tenant B cannot delete tenant A\'s custom role (tenant isolation)', async () => {
    // Pins EXISTING behavior, not a claim it's correct: role.service.ts:182 returns
    // 403 for a cross-tenant role, which confirms the role exists elsewhere (a BOLA
    // existence-leak per ADR-0014's 404-not-403 pattern, already applied for the
    // analogous case in user.service.ts:158-160). This deviation is out of scope for
    // this branch (RST-1..RST-7 don't touch it) and is tracked as BA sign-off backlog
    // B-1 (docs/superpowers/plans/2026-08-27-role-service-tenant-scope-ba-signoff.md).
    // Do not "fix" this assertion without also fixing role.service.ts and updating B-1.
    const roleId = await makeDisposableRole('isolation')

    const err: unknown = await roleService.deleteRole(tenantBId, roleId).then(() => null, e => e)

    expect(err).toBeInstanceOf(ForbiddenError)
    expect((err as AppError).statusCode).toBe(403)

    // Tenant A's role is untouched by tenant B's attempt.
    const still = await prisma.clinicRole.findFirst({ where: { id: roleId, tenantId: tenantAId } })
    expect(still).not.toBeNull()
  })

  it('a system role cannot be deleted (403)', async () => {
    const err: unknown = await roleService.deleteRole(tenantAId, systemStaffRoleId).then(() => null, e => e)

    expect(err).toBeInstanceOf(ForbiddenError)
    expect((err as AppError).statusCode).toBe(403)
  })

  it('an unknown role id is a 404, not a 409', async () => {
    const err: unknown = await roleService.deleteRole(tenantAId, 2_147_000_000).then(() => null, e => e)

    expect(err).toBeInstanceOf(NotFoundError)
    expect((err as AppError).statusCode).toBe(404)
  })
})
