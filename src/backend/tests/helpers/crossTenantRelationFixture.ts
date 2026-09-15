/**
 * Shared two-tenant fixture for the XTI-13 behavioural corrupt-row suites
 * (plan `2026-09-11-cross-tenant-relation-isolation-plan.md`, arch §9).
 *
 * WHY A HELPER AND NOT A COPY-PASTED `beforeAll` PER FILE
 * Arch §9 asks for nine behavioural suites, one per *shape*. Each needs the same
 * two-tenant world: a READER tenant (the caller) and a FOREIGN tenant whose rows
 * must never surface. Nine hand-rolled seeds would be nine places for the seed to
 * drift, and a seed that quietly stops creating (say) the foreign owner turns every
 * "no leak" assertion into a vacuous pass. One seed, asserted once, keeps the
 * suites honest.
 *
 * Seeding recipe is the one proven by `vaccinationDueSoonTenantLeak.test.ts` and
 * `crossTenantFkWritePathRepro.test.ts`: a real Postgres test database via Prisma,
 * real HTTP through supertest, no mocks. The corrupt rows the suites read back are
 * created with direct `prisma.*.create()` calls on purpose — no app write path can
 * produce one (that is exactly what the converted write-path prober proves), so the
 * only way to test the READ guard is to fabricate the row the schema permits but
 * the application refuses to make.
 *
 * @module crossTenantRelationFixture
 */

import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'

/** Password every fixture user is seeded with. */
export const FIXTURE_PASSWORD = 'TestPass1!'

/** PII values seeded on every fixture owner — AC-8 asserts none of these ever ship. */
export const OWNER_PII = {
  addressOf:      (label: string) => `${label} Secret Street 42`,
  lineIdOf:       (label: string) => `line-${label.toLowerCase()}`,
} as const

/** One seeded tenant and the tokens needed to drive it over HTTP. */
export interface TenantFixture {
  label:       string
  subdomain:   string
  tenantId:    number
  branchId:    number
  adminUserId: number
  doctorUserId: number
  ownerId:     number
  /** The owner's marker strings — asserted absent from other tenants' responses. */
  ownerFirstName: string
  ownerPhone:     string
  ownerIdCard:    string
  ownerAddress:   string
  ownerLineId:    string
  petId:       number
  petName:     string
  productId:   number
  productName: string
  /** Branch-pinned admin token — required by routes calling `requireBranchId`. */
  adminToken:  string
  /** All-branches admin token (`branchId = null`) — drives the NULL-branch query variants. */
  adminAllBranchToken: string
  /** Branch-pinned doctor token — `emr.create` / `prescriptions.create` / `vaccination.create`. */
  doctorToken: string
}

/** Short, collision-free stamp for subdomains and usernames (`users.username` is VarChar(20)). */
export function fixtureStamp(): string {
  return Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')
}

/** Boots the real Express app on an ephemeral port. */
export async function startFixtureServer(): Promise<Server> {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  server.keepAliveTimeout = 0
  return server
}

/**
 * Logs in and returns a token pinned to `branchId`, plus the pre-pin token when the
 * account skips branch selection (clinic_admin gets an all-branches `branchId = null`
 * token — several repository queries take a different code path on it, which is why
 * both are handed back).
 */
async function loginBoth(
  server: Server, subdomain: string, username: string, branchId: number,
): Promise<{ pinned: string; allBranches: string | null }> {
  const step1 = await request(server).post('/auth/login')
    .send({ subdomain, username, password: FIXTURE_PASSWORD })
  if (step1.status !== 200) {
    throw new Error(`login ${username}@${subdomain} failed ${step1.status}: ${JSON.stringify(step1.body)}`)
  }

  if (step1.body.data.requiresBranchSelection === false) {
    const allBranches = step1.body.data.token as string
    const sw = await request(server).post('/auth/switch-branch')
      .set('Authorization', `Bearer ${allBranches}`).send({ branchId })
    if (sw.status !== 200) {
      throw new Error(`switch-branch ${username} failed ${sw.status}: ${JSON.stringify(sw.body)}`)
    }
    return { pinned: sw.body.data.token as string, allBranches }
  }

  const { pendingToken } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId })
  if (step2.status !== 200) {
    throw new Error(`select-branch ${username} failed ${step2.status}: ${JSON.stringify(step2.body)}`)
  }
  return { pinned: step2.body.data.token as string, allBranches: null }
}

/**
 * Seeds one complete tenant: branch, settings, clinic_admin + doctor users (with
 * branch assignments), an owner carrying every PII field AC-8 forbids leaking, a pet,
 * and an inventory item with branch stock.
 *
 * @param server - The running fixture server (used for the login round trips).
 * @param stamp - Per-suite uniqueness stamp from {@link fixtureStamp}.
 * @param tag - 1-2 character tenant tag; keeps `username` inside VarChar(20).
 * @param label - Human label baked into the seeded PII so leaks are greppable.
 */
export async function seedTenantFixture(
  server: Server, stamp: string, tag: string, label: string,
): Promise<TenantFixture> {
  const subdomain     = `xti13-${tag}-${stamp}`
  const adminUsername = `a${tag}${stamp}`
  const doctorUsername = `d${tag}${stamp}`
  const passwordHash  = await bcrypt.hash(FIXTURE_PASSWORD, 4)

  const adminRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })

  const tenant = await prisma.tenant.create({ data: { name: `XTI13 ${label}`, subdomain } })
  const tenantId = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId, name: 'Main Branch' } })
  await prisma.tenantSettings.upsert({ where: { tenantId }, update: {}, create: { tenantId } })

  const admin = await prisma.user.create({
    data: {
      tenantId, branchId: branch.id, name: `Admin ${label}`, username: adminUsername,
      email: `admin@${subdomain}.test`, passwordHash, roleId: adminRole.id,
    },
  })
  await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id, tenantId } })
  await prisma.userBranch.create({ data: { tenantId, userId: admin.id, branchId: branch.id } })

  const doctor = await prisma.user.create({
    data: {
      tenantId, branchId: branch.id, name: `Doctor ${label}`, username: doctorUsername,
      email: `doctor@${subdomain}.test`, passwordHash, roleId: doctorRole.id,
    },
  })
  await prisma.userRole.create({ data: { userId: doctor.id, roleId: doctorRole.id, tenantId } })
  await prisma.userBranch.create({ data: { tenantId, userId: doctor.id, branchId: branch.id } })

  // Every field arch §4.2 removed from cross-tenant-visible responses is populated
  // here on purpose: AC-8 asserts none of them ship for ANY owner, own tenant included.
  const ownerFirstName = `Own${label}${stamp}`
  const ownerPhone     = `08${tag}${stamp}`.slice(0, 20)
  const ownerIdCard    = `id${tag}${stamp}`.slice(0, 20)
  const ownerAddress   = OWNER_PII.addressOf(label)
  const ownerLineId    = OWNER_PII.lineIdOf(label + stamp)
  const owner = await prisma.owner.create({
    data: {
      tenantId, firstName: ownerFirstName, lastName: `Surname${label}`,
      phone: ownerPhone, idCardType: 'thai_id', idCardNumber: ownerIdCard,
      address: ownerAddress, lineId: ownerLineId, loyaltyPoints: 4242,
    },
  })

  const petName = `Pet${label}${stamp}`
  const pet = await prisma.pet.create({
    data: { tenantId, ownerId: owner.id, branchId: branch.id, name: petName, species: 'Dog' },
  })

  const productName = `Drug${label}${stamp}`
  const product = await prisma.inventoryItem.create({
    data: { tenantId, name: productName, unit: 'tab', unitPrice: 10, isActive: true },
  })
  await prisma.branchInventory.create({
    data: { tenantId, branchId: branch.id, productId: product.id, stockQty: 100000 },
  })

  const adminTokens  = await loginBoth(server, subdomain, adminUsername, branch.id)
  const doctorTokens = await loginBoth(server, subdomain, doctorUsername, branch.id)

  return {
    label, subdomain, tenantId, branchId: branch.id,
    adminUserId: admin.id, doctorUserId: doctor.id,
    ownerId: owner.id, ownerFirstName, ownerPhone, ownerIdCard, ownerAddress, ownerLineId,
    petId: pet.id, petName,
    productId: product.id, productName,
    adminToken: adminTokens.pinned,
    adminAllBranchToken: adminTokens.allBranches ?? adminTokens.pinned,
    doctorToken: doctorTokens.pinned,
  }
}

/**
 * Seeds the READER (`A`) and FOREIGN (`B`) tenants used by every XTI-13 suite.
 * `B` is seeded first so `A`'s ids are the higher ones — a suite that accidentally
 * leaks `B`'s row therefore cannot be masked by an id collision.
 */
export async function seedCrossTenantPair(
  server: Server, stamp: string,
): Promise<{ A: TenantFixture; B: TenantFixture }> {
  const B = await seedTenantFixture(server, stamp, 'b', 'FOREIGN')
  const A = await seedTenantFixture(server, stamp, 'a', 'READER')
  return { A, B }
}

/** Deletes every row belonging to `tenantIds`, child tables first. */
export async function cleanupTenants(tenantIds: number[]): Promise<void> {
  const ids = tenantIds.filter((v): v is number => typeof v === 'number')
  if (!ids.length) return
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
  await prisma.rolePermission.deleteMany({ where: { role: { tenantId: { in: ids } } } })
  await prisma.clinicRole.deleteMany(w)
  await prisma.tenantSettings.deleteMany(w)
  await prisma.branch.deleteMany(w)
  await prisma.tenant.deleteMany({ where: { id: { in: ids } } })
}

/** Closes the fixture server. */
export async function stopFixtureServer(server: Server | undefined): Promise<void> {
  if (!server) return
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

/**
 * Asserts that no marker string belonging to the FOREIGN tenant appears anywhere in
 * a response body. Serialising and substring-matching (rather than walking known
 * keys) is deliberate: a leak through a field nobody thought to check is exactly the
 * failure mode these suites exist to catch.
 *
 * @param body - The parsed response body.
 * @param foreign - The FOREIGN tenant fixture whose markers must be absent.
 */
export function expectNoForeignTrace(body: unknown, foreign: TenantFixture): void {
  const serialized = JSON.stringify(body ?? null)
  for (const marker of [
    foreign.ownerFirstName, foreign.ownerPhone, foreign.ownerIdCard,
    foreign.ownerAddress, foreign.ownerLineId, foreign.petName, foreign.productName,
  ]) {
    expect(serialized).not.toContain(marker)
  }
}

/**
 * Asserts that no owner PII field arch §4.2 removed appears anywhere in a response —
 * for ANY owner, the caller's own tenant included (AC-8).
 *
 * Checks the field NAMES rather than only the seeded values: a response that ships
 * `"idCardNumber": null` has still re-introduced the key the frozen
 * `ownerSummarySelect` contract removed, and the next change that populates it leaks.
 */
export function expectNoOwnerPiiFields(body: unknown): void {
  const serialized = JSON.stringify(body ?? null)
  for (const field of ['idCardNumber', 'idCardType', 'address', 'lineId', 'loyaltyPoints', 'membershipTier']) {
    expect(serialized).not.toContain(`"${field}"`)
  }
}
