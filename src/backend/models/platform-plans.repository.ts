/**
 * Platform-plans repository — Prisma access for the plans table
 * and tenant_quotas table.
 *
 * Plans are global (no tenant_id). Quota overrides are keyed by tenantId.
 *
 * @module platform-plans.repository
 */

import prisma from '../config/db'
import { Prisma } from '@prisma/client'

/** Full plan row. */
export type PlanRow = {
  id: number
  key: string
  name: string
  priceMonth: import('@prisma/client').Prisma.Decimal
  maxBranches: number
  maxUsers: number
  maxOwners: number | null
  maxPets: number | null
  features: import('@prisma/client').Prisma.JsonValue
  isActive: boolean
}

/** Input for creating a plan. */
export interface CreatePlanData {
  key: string
  name: string
  priceMonth?: number
  maxBranches?: number
  maxUsers?: number
  maxOwners?: number | null
  maxPets?: number | null
  features?: Prisma.InputJsonValue
}

/** Input for updating a plan. */
export interface UpdatePlanData {
  name?: string
  priceMonth?: number
  maxBranches?: number
  maxUsers?: number
  maxOwners?: number | null
  maxPets?: number | null
  features?: Prisma.InputJsonValue
  isActive?: boolean
}

/** Input for upserting a tenant quota override. */
export interface QuotaOverrideData {
  maxBranches?: number | null
  maxUsers?: number | null
  maxOwners?: number | null
  maxPets?: number | null
}

/**
 * Return all plans ordered by price ascending.
 */
export function listPlans(): Promise<PlanRow[]> {
  return prisma.plan.findMany({ orderBy: { priceMonth: 'asc' } })
}

/**
 * Find a plan by primary key.
 *
 * @param id - Plan primary key.
 */
export function getPlanById(id: number): Promise<PlanRow | null> {
  return prisma.plan.findUnique({ where: { id } })
}

/**
 * Create a new plan.
 *
 * @param data - Plan definition fields.
 */
export function createPlan(data: CreatePlanData): Promise<PlanRow> {
  return prisma.plan.create({
    data: {
      key: data.key,
      name: data.name,
      priceMonth: data.priceMonth ?? 0,
      maxBranches: data.maxBranches ?? 1,
      maxUsers: data.maxUsers ?? 5,
      maxOwners: data.maxOwners ?? null,
      maxPets: data.maxPets === undefined ? 500 : data.maxPets,
      features: data.features ?? {},
    },
  })
}

/**
 * Update a plan's editable fields.
 *
 * @param id   - Plan primary key.
 * @param data - Fields to update.
 */
export function updatePlan(id: number, data: UpdatePlanData): Promise<PlanRow> {
  return prisma.plan.update({ where: { id }, data })
}

/**
 * Soft-retire a plan by setting isActive = false.
 *
 * @param id - Plan primary key.
 */
export function retirePlan(id: number): Promise<PlanRow> {
  return prisma.plan.update({ where: { id }, data: { isActive: false } })
}

/**
 * Count tenants currently assigned to a plan.
 *
 * @param id - Plan primary key.
 */
export function countTenantsOnPlan(id: number): Promise<number> {
  return prisma.tenant.count({ where: { planId: id } })
}

/**
 * Upsert the quota override record for a tenant.
 *
 * @param tenantId       - The tenant whose quota is being overridden.
 * @param data           - The override values.
 * @param performedById  - Platform user who made the change.
 */
export function upsertTenantQuota(
  tenantId: number,
  data: QuotaOverrideData,
  performedById: number,
) {
  return prisma.tenantQuota.upsert({
    where: { tenantId },
    update: { ...data, updatedById: performedById },
    create: { tenantId, ...data, updatedById: performedById },
  })
}
