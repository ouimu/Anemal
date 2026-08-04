/**
 * Platform-customers repository — Prisma access for the tenants table
 * from the platform plane.
 *
 * Platform operators manage tenant metadata (plan, quota, active status) —
 * never clinical/PII data. All functions are intentionally limited to the
 * fields needed by the Platform Console.
 *
 * @module platform-customers.repository
 */

import prisma from '../config/db'
import { Prisma } from '@prisma/client'

/** Lightweight tenant row returned for list views. */
export type TenantRow = {
  id:            number
  name:          string
  subdomain:     string
  isActive:      boolean
  planId:        number | null
  // D-2-06: company type FK
  companyTypeId: number | null
  createdAt:     Date
}

/** Extended list row with fields needed by the Platform Console list view. */
export type TenantListRow = TenantRow & {
  planName:    string | null
  userCount:   number
  trialEndsAt: Date | null
}

/** Full tenant row with plan + quota + company type included. */
export type TenantWithPlanAndQuota = TenantRow & {
  plan: {
    id: number
    key: string
    name: string
    maxBranches: number
    maxUsers: number
    maxOwners: number | null
    maxPets: number | null
  } | null
  quota: {
    maxBranches: number | null
    maxUsers: number | null
    maxOwners: number | null
    maxPets: number | null
    updatedById: number | null
    updatedAt: Date
  } | null
  /** Clinic contact details from tenant_settings (null if not configured). */
  settings: {
    email:   string | null
    phone:   string | null
    address: string | null
    logoUrl: string | null
  } | null
  // D-2-06: company type detail (null if not assigned)
  companyType: {
    id:     number
    key:    string
    nameEn: string
    nameTh: string
  } | null
  userCount:   number
  trialEndsAt: Date | null
}

/** Input shape for creating a new tenant. */
export interface CreateTenantData {
  name:           string
  subdomain:      string
  planId?:        number | null
  // D-2-06: optional company type assignment
  companyTypeId?: number
}

/** Input shape for updating a tenant. */
export interface UpdateTenantData {
  name?:          string
  subdomain?:     string
  planId?:        number | null
  // D-2-06: optional company type update (null to clear)
  companyTypeId?: number | null
}

const TENANT_SELECT = {
  id:            true,
  name:          true,
  subdomain:     true,
  isActive:      true,
  planId:        true,
  // D-2-06: include companyTypeId in all tenant selects
  companyTypeId: true,
  createdAt:     true,
} as const

/**
 * Return all tenants ordered by creation date (newest first).
 * Includes planName (from plan join) and userCount (aggregate).
 */
export async function listTenants(): Promise<TenantListRow[]> {
  const rows = await prisma.tenant.findMany({
    select: {
      ...TENANT_SELECT,
      plan: { select: { name: true } },
      _count: { select: { users: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return rows.map((r) => ({
    id:            r.id,
    name:          r.name,
    subdomain:     r.subdomain,
    isActive:      r.isActive,
    planId:        r.planId,
    companyTypeId: r.companyTypeId,
    createdAt:     r.createdAt,
    planName:      r.plan?.name ?? null,
    userCount:     r._count.users,
    trialEndsAt:   null,
  }))
}

/**
 * Find a single tenant by primary key.
 * Returns null when no matching tenant exists.
 *
 * @param id - Tenant primary key.
 */
export function getTenantById(id: number): Promise<TenantRow | null> {
  return prisma.tenant.findUnique({
    where: { id },
    select: TENANT_SELECT,
  })
}

/**
 * Create a new tenant record.
 *
 * @param data   - Name, subdomain, and optional plan assignment.
 * @param client - Prisma client or transaction client to run on (defaults to
 *                 the module-level client). CO-1 passes a `$transaction`
 *                 callback's `tx` so the tenant insert is atomic with the
 *                 first clinic_admin user insert (ADR-0015).
 */
export function createTenant(
  data: CreateTenantData,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<TenantRow> {
  return client.tenant.create({
    data: {
      name:          data.name,
      subdomain:     data.subdomain,
      planId:        data.planId ?? null,
      // D-2-06: optional company type assignment
      companyTypeId: data.companyTypeId ?? null,
    },
    select: TENANT_SELECT,
  })
}

/**
 * Update a tenant's editable fields.
 *
 * @param id   - Tenant primary key.
 * @param data - Fields to update.
 */
export function updateTenant(id: number, data: UpdateTenantData): Promise<TenantRow> {
  return prisma.tenant.update({
    where: { id },
    data,
    select: TENANT_SELECT,
  })
}

/**
 * Set the `isActive` flag on a tenant (suspend or reactivate).
 *
 * @param id       - Tenant primary key.
 * @param isActive - `false` to suspend, `true` to reactivate.
 */
export function setTenantActive(id: number, isActive: boolean): Promise<TenantRow> {
  return prisma.tenant.update({
    where: { id },
    data: { isActive },
    select: TENANT_SELECT,
  })
}

/**
 * Load a tenant with its plan, quota override, settings, and user count in one query.
 *
 * @param id - Tenant primary key.
 */
export async function getTenantWithPlanAndQuota(id: number): Promise<TenantWithPlanAndQuota | null> {
  const row = await prisma.tenant.findUnique({
    where: { id },
    select: {
      ...TENANT_SELECT,
      plan: {
        select: {
          id: true,
          key: true,
          name: true,
          maxBranches: true,
          maxUsers: true,
          maxOwners: true,
          maxPets: true,
        },
      },
      quota: {
        select: {
          maxBranches: true,
          maxUsers: true,
          maxOwners: true,
          maxPets: true,
          updatedById: true,
          updatedAt: true,
        },
      },
      settings: {
        select: {
          email:   true,
          phone:   true,
          address: true,
          logoUrl: true,
        },
      },
      // D-2-06: include company type detail in tenant get
      companyType: {
        select: {
          id:     true,
          key:    true,
          nameEn: true,
          nameTh: true,
        },
      },
      _count: { select: { users: true } },
    },
  })

  if (!row) return null

  return {
    id:            row.id,
    name:          row.name,
    subdomain:     row.subdomain,
    isActive:      row.isActive,
    planId:        row.planId,
    companyTypeId: row.companyTypeId,
    createdAt:     row.createdAt,
    plan:          row.plan,
    quota:         row.quota,
    settings:    row.settings
      ? {
          email:   row.settings.email   ?? null,
          phone:   row.settings.phone   ?? null,
          address: row.settings.address ?? null,
          logoUrl: row.settings.logoUrl ?? null,
        }
      : null,
    companyType:   row.companyType ?? null,
    userCount:     row._count.users,
    trialEndsAt:   null,
  }
}

/** Clinic-admin user row exposed to the Platform Console (never passwordHash). */
export type TenantAdminUserRow = {
  id:        number
  username:  string
  name:      string
  email:     string | null
  phone:     string | null
  isActive:  boolean
  createdAt: Date
}

const ADMIN_USER_SELECT = {
  id:        true,
  username:  true,
  name:      true,
  email:     true,
  phone:     true,
  isActive:  true,
  createdAt: true,
} as const

/**
 * List all clinic_admin-role users for a tenant (Q-8 — never doctor/staff rows).
 *
 * @param tenantId - Tenant scope.
 */
export function listTenantAdminUsers(tenantId: number): Promise<TenantAdminUserRow[]> {
  return prisma.user.findMany({
    where: {
      tenantId,
      userRoles: { some: { role: { key: 'clinic_admin', tenantId: null, isSystem: true } } },
    },
    select: ADMIN_USER_SELECT,
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Find a single clinic_admin-role user scoped to a tenant.
 * Returns null if the user does not exist, belongs to a different tenant, or
 * does not hold the clinic_admin role (Q-8 role-scope guard).
 *
 * @param tenantId - Tenant scope (BOLA guard).
 * @param userId   - Target user's primary key.
 */
export function findTenantAdminUser(tenantId: number, userId: number): Promise<TenantAdminUserRow | null> {
  return prisma.user.findFirst({
    where: {
      id: userId,
      tenantId,
      userRoles: { some: { role: { key: 'clinic_admin', tenantId: null, isSystem: true } } },
    },
    select: ADMIN_USER_SELECT,
  })
}

/**
 * Create a new clinic_admin user for an existing tenant (CO-2), within a
 * caller-supplied transaction client.
 *
 * R3-HI-04: this used to open its own `prisma.$transaction`, which meant the
 * quota check (`assertCanAddUser`) in the service ran in a separate,
 * unserialized read before this write — the same race the other four
 * user/branch/owner/pet creation paths were fixed for. Taking `tx` lets the
 * caller run this inside `subscription.service.createWithQuotaLock`'s
 * advisory-lock-serialized transaction instead.
 *
 * @param tx       - Transaction client (from `createWithQuotaLock`).
 * @param tenantId - Owning tenant.
 * @param data     - User fields (password already hashed).
 * @param roleId   - The seeded clinic_admin ClinicRole id.
 */
export async function createTenantAdminUserTx(
  tx: Prisma.TransactionClient,
  tenantId: number,
  data: { name: string; username: string; email: string | null; phone: string | null; passwordHash: string },
  roleId: number,
): Promise<TenantAdminUserRow> {
  const user = await tx.user.create({
    data: {
      tenantId,
      name:         data.name,
      username:     data.username,
      email:        data.email,
      phone:        data.phone,
      passwordHash: data.passwordHash,
      roleId,
    },
    select: ADMIN_USER_SELECT,
  })
  await tx.userRole.create({ data: { userId: user.id, roleId, tenantId } })
  return user
}

/**
 * Deactivate a clinic_admin-role user, scoped to tenantId + userId +
 * isActive=true in one WHERE clause (BOLA guard, PR #20 precedent — no
 * separate lookup-then-mutate race).
 *
 * @param tenantId - Tenant scope.
 * @param userId   - Target user.
 * @returns Number of rows updated (0 = not found / not a clinic_admin / already inactive).
 */
export async function deactivateTenantAdminUser(tenantId: number, userId: number): Promise<number> {
  const result = await prisma.user.updateMany({
    where: {
      id: userId,
      tenantId,
      isActive: true,
      userRoles: { some: { role: { key: 'clinic_admin', tenantId: null, isSystem: true } } },
    },
    data: { isActive: false },
  })
  return result.count
}

/**
 * Set a new password hash for a clinic_admin-role user, scoped to
 * tenantId + userId in one WHERE clause (BOLA guard). Works on both active
 * and deactivated rows (CO-10 — reset is not restricted to active admins).
 *
 * @param tenantId     - Tenant scope.
 * @param userId       - Target user.
 * @param passwordHash - New bcrypt hash.
 * @returns Number of rows updated (0 = not found / not a clinic_admin of this tenant).
 */
export async function setTenantAdminUserPassword(
  tenantId: number,
  userId: number,
  passwordHash: string,
): Promise<number> {
  const result = await prisma.user.updateMany({
    where: {
      id: userId,
      tenantId,
      userRoles: { some: { role: { key: 'clinic_admin', tenantId: null, isSystem: true } } },
    },
    data: { passwordHash },
  })
  return result.count
}
