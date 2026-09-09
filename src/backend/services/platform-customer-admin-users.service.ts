/**
 * Platform-customer-admin-users service — business logic for managing a
 * tenant's clinic_admin users from the Platform Console (CO-2/CO-4/CO-5/CO-6).
 *
 * Split out of platform-customers.service.ts (2026-09-09 code-quality
 * refactor, Phase 4): this file owns tenant-ADMIN-USER lifecycle
 * (create/list/deactivate/reset-password on the clinic_admin users of an
 * existing tenant), while platform-customers.service.ts keeps tenant
 * (customer) lifecycle. `platform-customer-admin-users.test.ts` already
 * treated the admin-user half as a separate concern before this split.
 *
 * @module platform-customer-admin-users.service
 */

import { AppError } from '../utils/errors'
import * as customersRepo from '../models/platform-customers.repository'
import * as platformAuditRepo from '../models/platform-audit.repository'
import * as refreshTokenRepo from '../models/refresh-token.repository'
import bcrypt from 'bcrypt'
import { config } from '../config/env'
import { generateSecurePassword } from '../utils/password'
import { Prisma } from '@prisma/client'
import * as roleRepo from '../models/role.repository'
import * as subscriptionService from './subscription.service'
import { CustomerNotFoundError } from './platform-customers.service'

/** Thrown when a target admin-user is not a clinic_admin of the given tenant (or doesn't exist). */
export class AdminUserNotFoundError extends AppError {
  constructor() {
    super(404, 'Clinic admin user not found for this tenant', 'ADMIN_USER_NOT_FOUND')
  }
}

/** Thrown when deactivating a clinic_admin user that is already inactive (G-5). */
export class AlreadyDeactivatedError extends AppError {
  constructor() {
    super(409, 'User is already deactivated', 'ALREADY_DEACTIVATED')
  }
}

/** Thrown when a typed password is shorter than the 8-char minimum (CO-2/CO-5 only, G-6). */
export class WeakPasswordError extends AppError {
  constructor() {
    super(422, 'Password must be at least 8 characters', 'WEAK_PASSWORD')
  }
}

/** Thrown on duplicate username within a tenant (CO-2). */
export class UsernameConflictError extends AppError {
  constructor() {
    super(409, 'Username already in use within this tenant', 'USERNAME_CONFLICT')
  }
}

/**
 * Thrown when neither email nor phone is provided for a new clinic_admin
 * (D-2-02 mirrored here — this path does not call user.service.ts createUser()).
 */
export class ContactRequiredError extends AppError {
  constructor() {
    super(422, 'At least one contact (email or phone) is required', 'CONTACT_REQUIRED')
  }
}

/** Clinic-admin user row exposed to the Platform Console (never passwordHash). */
export interface TenantAdminUser {
  id:        number
  username:  string
  name:      string
  email:     string | null
  phone:     string | null
  isActive:  boolean
  createdAt: Date
}

/** Response shape for create/reset — includes the plaintext password exactly once. */
export interface TenantAdminUserWithPassword extends TenantAdminUser {
  password: string
}

/** Input for CO-2: create an additional clinic_admin user for an existing tenant. */
export interface CreateTenantAdminUserInput {
  name:      string
  username:  string
  email?:    string
  phone?:    string
  password?: string
}

/**
 * Create an additional clinic_admin user for an existing tenant (CO-2).
 * Counts against the tenant's user quota (Q-5 — unlike CO-1's exempt first admin).
 *
 * @param tenantId       - Target tenant (path param — never trusted from body, BOLA guard).
 * @param data           - New admin fields; password optional (server-generates if omitted).
 * @param performedById  - Platform user performing the action.
 */
export async function createTenantAdminUser(
  tenantId: number,
  data: CreateTenantAdminUserInput,
  performedById: number,
): Promise<TenantAdminUserWithPassword> {
  const tenant = await customersRepo.getTenantById(tenantId)
  if (!tenant) throw new CustomerNotFoundError()

  if (!data.email && !data.phone) {
    throw new ContactRequiredError()
  }

  if (data.password !== undefined && data.password.length < 8) {
    throw new WeakPasswordError()
  }

  const clinicAdminRole = await roleRepo.findSystemRoleByKey('clinic_admin')
  if (!clinicAdminRole) throw new Error("System role 'clinic_admin' not seeded")

  const plaintext = data.password ?? generateSecurePassword()
  const passwordHash = await bcrypt.hash(plaintext, config.bcryptRounds)

  try {
    // R3-HI-04: quota check + insert now happen inside one advisory-lock-serialized
    // transaction (subscription.service.createWithQuotaLock) instead of a preceding,
    // independent count check that a concurrent request (from this or any of the
    // other 4 user-creation paths) could race past.
    const user = await subscriptionService.createWithQuotaLock(tenantId, 'users', (tx) =>
      customersRepo.createTenantAdminUserTx(
        tx,
        tenantId,
        { name: data.name, username: data.username, email: data.email ?? null, phone: data.phone ?? null, passwordHash },
        clinicAdminRole.id,
      ),
    )

    await platformAuditRepo.createPlatformAuditLog({
      action: 'tenant.admin_user.create',
      targetTenantId: tenantId,
      performedByPlatformUserId: performedById,
      details: { userId: user.id, username: user.username },
    })

    return { ...user, password: plaintext }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new UsernameConflictError()
    }
    throw err
  }
}

/**
 * List all clinic_admin-role users for a tenant (CO-6). Never leaks
 * doctor/staff rows (Q-8) or passwordHash (R-6).
 *
 * @param tenantId - Target tenant (path param).
 */
export async function listTenantAdminUsers(tenantId: number): Promise<TenantAdminUser[]> {
  const tenant = await customersRepo.getTenantById(tenantId)
  if (!tenant) throw new CustomerNotFoundError()
  return customersRepo.listTenantAdminUsers(tenantId)
}

/**
 * Deactivate a clinic_admin user for a tenant (CO-4). Soft delete only
 * (Q-9) — sets isActive=false. The target must currently hold the
 * clinic_admin role for this exact tenant (Q-8); otherwise 404, same as a
 * cross-tenant userId (BOLA guard, PR #20 precedent).
 *
 * @param tenantId       - Target tenant (path param).
 * @param userId         - Target user (path param).
 * @param performedById  - Platform user performing the action.
 */
export async function deactivateTenantAdminUser(
  tenantId: number,
  userId: number,
  performedById: number,
): Promise<TenantAdminUser> {
  const updated = await customersRepo.deactivateTenantAdminUser(tenantId, userId)
  if (updated === 0) {
    const existing = await customersRepo.findTenantAdminUser(tenantId, userId)
    if (!existing) throw new AdminUserNotFoundError()
    throw new AlreadyDeactivatedError()
  }

  await platformAuditRepo.createPlatformAuditLog({
    action: 'tenant.admin_user.deactivate',
    targetTenantId: tenantId,
    performedByPlatformUserId: performedById,
    details: { userId },
  })

  const user = await customersRepo.findTenantAdminUser(tenantId, userId)
  if (!user) throw new AdminUserNotFoundError() // defensive — unreachable in practice
  return user
}

/**
 * Reset (or generate) a clinic_admin user's password (CO-5). Available on
 * both active and deactivated admins (CO-10). Response includes the
 * plaintext exactly once; audit details never include it (R-6).
 *
 * @param tenantId      - Target tenant (path param).
 * @param userId        - Target user (path param).
 * @param newPassword   - Typed password (>= 8 chars) or undefined to auto-generate.
 * @param performedById - Platform user performing the action.
 */
export async function resetTenantAdminUserPassword(
  tenantId: number,
  userId: number,
  newPassword: string | undefined,
  performedById: number,
): Promise<TenantAdminUserWithPassword> {
  if (newPassword !== undefined && newPassword.length < 8) {
    throw new WeakPasswordError()
  }

  const plaintext    = newPassword ?? generateSecurePassword()
  const passwordHash = await bcrypt.hash(plaintext, config.bcryptRounds)

  const updated = await customersRepo.setTenantAdminUserPassword(tenantId, userId, passwordHash)
  if (updated === 0) throw new AdminUserNotFoundError()

  // PWD-3 retrofit (R-5, brainstorm §4.3): a platform reset used to leave the
  // clinic_admin's 30-day refresh tokens valid. Now revoked, same as B-1/B-2.
  await refreshTokenRepo.revokeAllForUser(userId)

  await platformAuditRepo.createPlatformAuditLog({
    action: 'tenant.admin_user.password_reset',
    targetTenantId: tenantId,
    performedByPlatformUserId: performedById,
    details: { userId },
  })

  const user = await customersRepo.findTenantAdminUser(tenantId, userId)
  if (!user) throw new AdminUserNotFoundError() // defensive — unreachable in practice
  return { ...user, password: plaintext }
}
