/**
 * Platform-customers service — business logic for tenant (customer) management
 * on the platform plane.
 *
 * Suspend/reactivate operations write an entry to `platform_audit_logs`.
 * All functions operate on tenant metadata only — never on clinical/PII data.
 *
 * @module platform-customers.service
 */

import { AppError } from '../utils/errors'
import * as customersRepo from '../models/platform-customers.repository'
import type {
  CreateTenantData,
  UpdateTenantData,
} from '../models/platform-customers.repository'
import prisma from '../config/db'

/** Thrown when a requested tenant does not exist. */
export class CustomerNotFoundError extends AppError {
  constructor() {
    super(404, 'Customer not found', 'CUSTOMER_NOT_FOUND')
  }
}

/** Thrown when a subdomain is already taken. */
export class SubdomainConflictError extends AppError {
  constructor() {
    super(409, 'Subdomain already in use', 'SUBDOMAIN_CONFLICT')
  }
}

/** Input for creating a customer (tenant). */
export interface CreateCustomerInput {
  name: string
  subdomain: string
  planId?: number | null
}

/** Input for updating a customer (tenant). */
export interface UpdateCustomerInput {
  name?: string
  subdomain?: string
  planId?: number | null
}

/**
 * Return all tenants as a list for the Platform Console.
 */
export function listCustomers() {
  return customersRepo.listTenants()
}

/**
 * Return a single tenant by id.
 * Throws CustomerNotFoundError when missing.
 *
 * @param id - Tenant primary key.
 */
export async function getCustomer(id: number) {
  const tenant = await customersRepo.getTenantWithPlanAndQuota(id)
  if (!tenant) throw new CustomerNotFoundError()
  return tenant
}

/**
 * Create a new tenant (customer) record.
 * Validates subdomain uniqueness before inserting.
 *
 * @param data           - Name, subdomain, and optional plan.
 * @param performedById  - Platform user creating the customer.
 */
export async function createCustomer(data: CreateCustomerInput, performedById: number) {
  const existing = await prisma.tenant.findUnique({
    where: { subdomain: data.subdomain },
    select: { id: true },
  })
  if (existing) throw new SubdomainConflictError()

  const createData: CreateTenantData = {
    name: data.name,
    subdomain: data.subdomain,
    planId: data.planId ?? null,
  }
  const tenant = await customersRepo.createTenant(createData)

  await prisma.platformAuditLog.create({
    data: {
      action: 'customer.create',
      targetTenantId: tenant.id,
      performedByPlatformUserId: performedById,
      details: { name: tenant.name, subdomain: tenant.subdomain, planId: tenant.planId },
    },
  })

  return tenant
}

/**
 * Update an existing tenant's metadata.
 * Validates subdomain uniqueness when it changes.
 *
 * @param id             - Tenant primary key.
 * @param data           - Fields to update.
 * @param performedById  - Platform user making the change.
 */
export async function updateCustomer(id: number, data: UpdateCustomerInput, performedById: number) {
  const tenant = await customersRepo.getTenantById(id)
  if (!tenant) throw new CustomerNotFoundError()

  if (data.subdomain && data.subdomain !== tenant.subdomain) {
    const existing = await prisma.tenant.findUnique({
      where: { subdomain: data.subdomain },
      select: { id: true },
    })
    if (existing) throw new SubdomainConflictError()
  }

  const updateData: UpdateTenantData = {
    name: data.name,
    subdomain: data.subdomain,
    planId: data.planId,
  }
  const updated = await customersRepo.updateTenant(id, updateData)

  await prisma.platformAuditLog.create({
    data: {
      action: 'customer.update',
      targetTenantId: id,
      performedByPlatformUserId: performedById,
      details: {
        before: { name: tenant.name, subdomain: tenant.subdomain, planId: tenant.planId },
        after: { name: data.name, subdomain: data.subdomain, planId: data.planId },
      },
    },
  })

  return updated
}

/**
 * Suspend a tenant — sets isActive = false and writes an audit log entry.
 * Suspended tenants are immediately blocked at the authMiddleware layer.
 *
 * @param id             - Tenant primary key.
 * @param performedById  - Platform user who triggered the suspension.
 */
export async function suspendCustomer(id: number, performedById: number) {
  const tenant = await customersRepo.getTenantById(id)
  if (!tenant) throw new CustomerNotFoundError()

  const updated = await customersRepo.setTenantActive(id, false)

  await prisma.platformAuditLog.create({
    data: {
      action: 'tenant.suspend',
      targetTenantId: id,
      performedByPlatformUserId: performedById,
      details: { tenantName: tenant.name },
    },
  })

  return updated
}

/**
 * Reactivate a previously suspended tenant and write an audit log entry.
 *
 * @param id             - Tenant primary key.
 * @param performedById  - Platform user who triggered the reactivation.
 */
export async function reactivateCustomer(id: number, performedById: number) {
  const tenant = await customersRepo.getTenantById(id)
  if (!tenant) throw new CustomerNotFoundError()

  const updated = await customersRepo.setTenantActive(id, true)

  await prisma.platformAuditLog.create({
    data: {
      action: 'tenant.reactivate',
      targetTenantId: id,
      performedByPlatformUserId: performedById,
      details: { tenantName: tenant.name },
    },
  })

  return updated
}
