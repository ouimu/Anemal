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
 */
export function listTenants(): Promise<TenantRow[]> {
  return prisma.tenant.findMany({
    select: TENANT_SELECT,
    orderBy: { createdAt: 'desc' },
  })
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
 * Load a tenant with its plan and quota override in one query.
 *
 * @param id - Tenant primary key.
 */
export function getTenantWithPlanAndQuota(id: number): Promise<TenantWithPlanAndQuota | null> {
  return prisma.tenant.findUnique({
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
    },
  })
}
