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

/** Lightweight tenant row returned for list views. */
export type TenantRow = {
  id: number
  name: string
  subdomain: string
  isActive: boolean
  planId: number | null
  createdAt: Date
}

/** Extended list row with fields needed by the Platform Console list view. */
export type TenantListRow = TenantRow & {
  planName:    string | null
  userCount:   number
  trialEndsAt: Date | null
}

/** Full tenant row with plan + quota included. */
export type TenantWithPlanAndQuota = TenantRow & {
  plan: {
    id: number
    key: string
    name: string
    maxBranches: number
    maxUsers: number
    maxOwners: number | null
  } | null
  quota: {
    maxBranches: number | null
    maxUsers: number | null
    maxOwners: number | null
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
  userCount:   number
  trialEndsAt: Date | null
}

/** Input shape for creating a new tenant. */
export interface CreateTenantData {
  name: string
  subdomain: string
  planId?: number | null
}

/** Input shape for updating a tenant. */
export interface UpdateTenantData {
  name?: string
  subdomain?: string
  planId?: number | null
}

const TENANT_SELECT = {
  id: true,
  name: true,
  subdomain: true,
  isActive: true,
  planId: true,
  createdAt: true,
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
    id:          r.id,
    name:        r.name,
    subdomain:   r.subdomain,
    isActive:    r.isActive,
    planId:      r.planId,
    createdAt:   r.createdAt,
    planName:    r.plan?.name ?? null,
    userCount:   r._count.users,
    trialEndsAt: null,
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
 * @param data - Name, subdomain, and optional plan assignment.
 */
export function createTenant(data: CreateTenantData): Promise<TenantRow> {
  return prisma.tenant.create({
    data: {
      name: data.name,
      subdomain: data.subdomain,
      planId: data.planId ?? null,
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
        },
      },
      quota: {
        select: {
          maxBranches: true,
          maxUsers: true,
          maxOwners: true,
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
      _count: { select: { users: true } },
    },
  })

  if (!row) return null

  return {
    id:          row.id,
    name:        row.name,
    subdomain:   row.subdomain,
    isActive:    row.isActive,
    planId:      row.planId,
    createdAt:   row.createdAt,
    plan:        row.plan,
    quota:       row.quota,
    settings:    row.settings
      ? {
          email:   row.settings.email   ?? null,
          phone:   row.settings.phone   ?? null,
          address: row.settings.address ?? null,
          logoUrl: row.settings.logoUrl ?? null,
        }
      : null,
    userCount:   row._count.users,
    trialEndsAt: null,
  }
}
