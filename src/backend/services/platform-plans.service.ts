/**
 * Platform-plans service — business logic for plan management and
 * per-tenant quota overrides on the platform plane.
 *
 * Quota model: effective value = override (tenant_quotas) ?? plan default.
 * A null plan value means unlimited; a null override field means "inherit from plan".
 *
 * @module platform-plans.service
 */

import { AppError } from '../utils/errors'
import * as plansRepo from '../models/platform-plans.repository'
import type { PlanRow } from '../models/platform-plans.repository'
import * as customersRepo from '../models/platform-customers.repository'
import type {
  CreatePlanData,
  UpdatePlanData,
  QuotaOverrideData,
} from '../models/platform-plans.repository'
import { CustomerNotFoundError } from './platform-customers.service'
import * as platformAuditRepo from '../models/platform-audit.repository'

/** Normalized plan shape returned to API callers. */
export interface PlanResponse {
  id:          number
  key:         string
  name:        string
  price:       number
  maxBranches: number
  maxUsers:    number
  maxOwners:   number | null
  features:    string[]
  isRetired:   boolean
  createdAt:   null
}

/**
 * Transform a raw PlanRow into the normalized API shape.
 * - `priceMonth` (Prisma Decimal) → `price` (number)
 * - `isActive` → `isRetired` (inverted)
 * - `features` (Json object) → `features` (string[] of keys, or [])
 * - `createdAt` not in schema → null
 */
function normalizePlan(row: PlanRow): PlanResponse {
  const featuresRaw = row.features
  const features: string[] =
    featuresRaw !== null &&
    typeof featuresRaw === 'object' &&
    !Array.isArray(featuresRaw)
      ? Object.keys(featuresRaw as Record<string, unknown>)
      : []

  return {
    id:          row.id,
    key:         row.key,
    name:        row.name,
    price:       parseFloat(String(row.priceMonth)),
    maxBranches: row.maxBranches,
    maxUsers:    row.maxUsers,
    maxOwners:   row.maxOwners,
    features,
    isRetired:   !row.isActive,
    createdAt:   null,
  }
}

/** Thrown when a requested plan does not exist. */
export class PlanNotFoundError extends AppError {
  constructor() {
    super(404, 'Plan not found', 'PLAN_NOT_FOUND')
  }
}

/** Thrown when retiring a plan that still has active tenants. */
export class PlanInUseError extends AppError {
  constructor(count: number) {
    super(
      409,
      `Cannot retire plan: ${count} tenant(s) are currently assigned to it`,
      'PLAN_IN_USE',
    )
  }
}

/** Effective quota shape returned to callers. */
export interface EffectiveQuota {
  plan: {
    maxBranches: number
    maxUsers: number
    maxOwners: number | null
  } | null
  override: {
    maxBranches: number | null
    maxUsers: number | null
    maxOwners: number | null
  } | null
  effective: {
    maxBranches: number | null
    maxUsers: number | null
    maxOwners: number | null
  }
}

/**
 * Return all plans with normalized API shape.
 */
export async function listPlans(): Promise<PlanResponse[]> {
  const rows = await plansRepo.listPlans()
  return rows.map(normalizePlan)
}

/**
 * Return a single plan by id with normalized API shape.
 * Throws PlanNotFoundError when missing.
 *
 * @param id - Plan primary key.
 */
export async function getPlan(id: number): Promise<PlanResponse> {
  const plan = await plansRepo.getPlanById(id)
  if (!plan) throw new PlanNotFoundError()
  return normalizePlan(plan)
}

/**
 * Create a new subscription plan.
 *
 * @param data           - Plan definition.
 * @param performedById  - Platform user creating the plan.
 */
export async function createPlan(data: Omit<CreatePlanData, 'features'> & { features?: Record<string, unknown> }, performedById: number): Promise<PlanResponse> {
  const plan = await plansRepo.createPlan(data as CreatePlanData)

  await platformAuditRepo.createPlatformAuditLog({
    action: 'plan.create',
    targetTenantId: null,
    performedByPlatformUserId: performedById,
    details: { planId: plan.id, key: plan.key, name: plan.name },
  })

  return normalizePlan(plan)
}

/**
 * Update an existing plan's fields.
 *
 * @param id             - Plan primary key.
 * @param data           - Fields to update.
 * @param performedById  - Platform user making the change.
 */
export async function updatePlan(id: number, data: Omit<UpdatePlanData, 'features'> & { features?: Record<string, unknown> }, performedById: number): Promise<PlanResponse> {
  await getPlan(id)
  const updated = await plansRepo.updatePlan(id, data as UpdatePlanData)

  await platformAuditRepo.createPlatformAuditLog({
    action: 'plan.update',
    targetTenantId: null,
    performedByPlatformUserId: performedById,
    details: { planId: id, changes: JSON.parse(JSON.stringify(data)) },
  })

  return normalizePlan(updated)
}

/**
 * Retire a plan (soft-delete via isActive = false).
 * Rejects with PlanInUseError when any tenant is still assigned to the plan.
 *
 * @param id             - Plan primary key.
 * @param performedById  - Platform user retiring the plan.
 */
export async function retirePlan(id: number, performedById: number): Promise<PlanResponse> {
  const plan = await getPlan(id)
  const count = await plansRepo.countTenantsOnPlan(id)
  if (count > 0) throw new PlanInUseError(count)
  const retired = await plansRepo.retirePlan(id)

  await platformAuditRepo.createPlatformAuditLog({
    action: 'plan.delete',
    targetTenantId: null,
    performedByPlatformUserId: performedById,
    details: { planId: id, key: plan.key, name: plan.name },
  })

  return normalizePlan(retired)
}

/**
 * Compute the effective quota for a tenant.
 *
 * Resolution order:
 *   1. tenant_quotas override (if field is non-null)
 *   2. plan default
 *   3. null (unlimited) if neither is set
 *
 * @param tenantId - Tenant primary key.
 */
export async function getEffectiveQuota(tenantId: number): Promise<EffectiveQuota> {
  const tenant = await customersRepo.getTenantWithPlanAndQuota(tenantId)
  if (!tenant) throw new CustomerNotFoundError()

  const plan = tenant.plan
  const override = tenant.quota ?? null

  const effective = {
    maxBranches: override?.maxBranches ?? plan?.maxBranches ?? null,
    maxUsers:    override?.maxUsers    ?? plan?.maxUsers    ?? null,
    maxOwners:   override?.maxOwners   ?? plan?.maxOwners   ?? null,
  }

  return {
    plan: plan
      ? { maxBranches: plan.maxBranches, maxUsers: plan.maxUsers, maxOwners: plan.maxOwners }
      : null,
    override: override
      ? { maxBranches: override.maxBranches, maxUsers: override.maxUsers, maxOwners: override.maxOwners }
      : null,
    effective,
  }
}

/**
 * Set (or clear) quota override fields for a tenant.
 * Writes an audit log entry after the update.
 *
 * @param tenantId       - Tenant primary key.
 * @param data           - Override values (null to clear a field back to plan default).
 * @param performedById  - Platform user making the change.
 */
export async function setQuotaOverride(
  tenantId: number,
  data: QuotaOverrideData,
  performedById: number,
) {
  const tenant = await customersRepo.getTenantById(tenantId)
  if (!tenant) throw new CustomerNotFoundError()

  return plansRepo.upsertTenantQuota(tenantId, data, performedById)
}
