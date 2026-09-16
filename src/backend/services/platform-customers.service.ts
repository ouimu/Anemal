/**
 * Platform-customers service — business logic for tenant (customer) lifecycle
 * management on the platform plane: list/create/get/update/suspend/reactivate.
 *
 * Tenant-ADMIN-USER lifecycle (create/list/deactivate/reset-password on a
 * tenant's clinic_admin users, CO-2/CO-4/CO-5/CO-6) lives in
 * platform-customer-admin-users.service.ts (split out 2026-09-09, code-quality
 * refactor Phase 4) — a distinct concern that only shares tenant-existence
 * checks and CustomerNotFoundError with this file.
 *
 * Suspend/reactivate operations write an entry to `platform_audit_logs`.
 * All functions operate on tenant metadata only — never on clinical/PII data.
 *
 * @module platform-customers.service
 */

import { AppError } from '../utils/errors'
import * as customersRepo from '../models/platform-customers.repository'
import * as companyTypeRepo from '../models/company-type.repository'
import type {
  CreateTenantData,
  UpdateTenantData,
  TenantListRow,
  TenantWithPlanAndQuota,
} from '../models/platform-customers.repository'
import * as platformAuditRepo from '../models/platform-audit.repository'
import prisma from '../config/db'
import bcrypt from 'bcrypt'
import { config } from '../config/env'
import { generateSecurePassword } from '../utils/password'

/** Tenant status computed from isActive + trialEndsAt. */
type TenantStatus = 'active' | 'trial' | 'suspended'

/**
 * Compute tenant status from its flags.
 *
 * @param isActive    - Whether the tenant account is active.
 * @param trialEndsAt - Trial expiry date, or null if not in trial.
 */
function computeStatus(isActive: boolean, trialEndsAt: Date | null): TenantStatus {
  if (!isActive) return 'suspended'
  if (trialEndsAt && trialEndsAt > new Date()) return 'trial'
  return 'active'
}

/** Normalized list item returned to the API. */
export interface CustomerListItem {
  id:          number
  name:        string
  subdomain:   string
  planId:      number | null
  planName:    string | null
  status:      TenantStatus
  userCount:   number
  trialEndsAt: Date | null
  createdAt:   Date
}

/** Normalized detail item returned to the API. */
export interface CustomerDetail extends CustomerListItem {
  maxBranches:   number | null
  maxUsers:      number | null
  maxOwners:     number | null
  maxPets:       number | null
  email:         string | null
  phone:         string | null
  address:       string | null
  logoUrl:       string | null
  companyTypeId: number | null
  // D-2-06: company type detail (null if not assigned)
  companyType:   { id: number; key: string; nameEn: string; nameTh: string } | null
}

function toListItem(row: TenantListRow): CustomerListItem {
  return {
    id:          row.id,
    name:        row.name,
    subdomain:   row.subdomain,
    planId:      row.planId,
    planName:    row.planName,
    status:      computeStatus(row.isActive, row.trialEndsAt),
    userCount:   row.userCount,
    trialEndsAt: row.trialEndsAt,
    createdAt:   row.createdAt,
  }
}

function toDetailItem(row: TenantWithPlanAndQuota): CustomerDetail {
  const maxBranches = row.quota?.maxBranches ?? row.plan?.maxBranches ?? null
  const maxUsers    = row.quota?.maxUsers    ?? row.plan?.maxUsers    ?? null
  const maxOwners   = row.quota?.maxOwners   ?? row.plan?.maxOwners   ?? null
  const maxPets     = row.quota?.maxPets     ?? row.plan?.maxPets     ?? null
  return {
    id:          row.id,
    name:        row.name,
    subdomain:   row.subdomain,
    planId:      row.planId,
    planName:    row.plan?.name ?? null,
    status:      computeStatus(row.isActive, row.trialEndsAt),
    userCount:   row.userCount,
    trialEndsAt: row.trialEndsAt,
    createdAt:   row.createdAt,
    maxBranches,
    maxUsers,
    maxOwners,
    maxPets,
    email:         row.settings?.email   ?? null,
    phone:         row.settings?.phone   ?? null,
    address:       row.settings?.address ?? null,
    logoUrl:       row.settings?.logoUrl ?? null,
    companyTypeId: row.companyTypeId,
    // D-2-06: company type detail
    companyType:   row.companyType ?? null,
  }
}

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
  name:          string
  subdomain:     string
  planId?:       number | null
  // D-2-06: optional company type assignment
  companyTypeId?: number
}

/** Input for updating a customer (tenant). */
export interface UpdateCustomerInput {
  name?:          string
  subdomain?:     string
  planId?:        number | null
  // D-2-06: optional company type update (null to clear)
  companyTypeId?: number | null
}

/** Thrown when the provided companyTypeId is not active or does not exist. */
export class CompanyTypeNotFoundError extends AppError {
  constructor() {
    super(422, 'Company type not found or is inactive', 'COMPANY_TYPE_NOT_FOUND')
  }
}

/**
 * Return all tenants as a normalized list for the Platform Console.
 */
export async function listCustomers(): Promise<CustomerListItem[]> {
  const rows = await customersRepo.listTenants()
  return rows.map(toListItem)
}

/**
 * Return a single tenant by id with full detail shape.
 * Throws CustomerNotFoundError when missing.
 *
 * @param id - Tenant primary key.
 */
export async function getCustomer(id: number): Promise<CustomerDetail> {
  const tenant = await customersRepo.getTenantWithPlanAndQuota(id)
  if (!tenant) throw new CustomerNotFoundError()
  return toDetailItem(tenant)
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

  // D-2-06: validate companyTypeId when provided
  if (data.companyTypeId !== undefined) {
    const ct = await companyTypeRepo.findCompanyTypeById(data.companyTypeId)
    if (!ct || !ct.isActive) throw new CompanyTypeNotFoundError()
  }

  const createData: CreateTenantData = {
    name:          data.name,
    subdomain:     data.subdomain,
    planId:        data.planId ?? null,
    companyTypeId: data.companyTypeId,
  }

  // CO-1 (ADR-0015): create the tenant and its first clinic_admin user
  // atomically. If the user insert fails for any reason, the tenant insert
  // rolls back too — no tenant-without-admin state is ever reachable.
  const { tenant, adminUserId, branchId } = await prisma.$transaction(async (tx) => {
    const createdTenant = await customersRepo.createTenant(createData, tx)

    // PROV-1 (ADR-0015 amendment, 2026-07-15): every tenant must start with
    // one branch so staff/doctor login and every branch-scoped module has
    // context from day one — matches prisma/seed.ts parity. Server-constant
    // name, no clinic-data read: within the amended B-2 bound. No
    // user_branches row for the admin — the admin role bypasses branch
    // selection entirely (auth.service.ts login()/selectBranch()), exactly
    // as seed-created tenants have no admin user_branches rows either.
    const branch = await tx.branch.create({
      data: { tenantId: createdTenant.id, name: 'Main Branch' },
    })

    const clinicAdminRole = await tx.clinicRole.findFirst({
      where: { key: 'clinic_admin', tenantId: null, isSystem: true },
    })
    if (!clinicAdminRole) {
      throw new Error("System role 'clinic_admin' not seeded")
    }

    const passwordHash = await bcrypt.hash(generateSecurePassword(), config.bcryptRounds)

    // R-E (BA sign-off, docs/superpowers/plans/2026-07-14-customer-onboarding-tasks.md):
    // the auto-created first admin has email=NULL, phone=NULL. D-2-02 does not
    // govern this path — this does not call user.service.ts createUser().
    // Q-5: subscriptionService.assertCanAddUser is intentionally NOT called
    // here — the first admin is exempt from quota enforcement.
    const adminUser = await tx.user.create({
      data: {
        tenantId:     createdTenant.id,
        name:         'Administrator',
        username:     'admin',
        email:        null,
        phone:        null,
        passwordHash,
        roleId:       clinicAdminRole.id,
      },
    })
    await tx.userRole.create({
      data: { userId: adminUser.id, roleId: clinicAdminRole.id, tenantId: createdTenant.id },
    })

    return { tenant: createdTenant, adminUserId: adminUser.id, branchId: branch.id }
  })

  await platformAuditRepo.createPlatformAuditLog({
    action: 'customer.create',
    targetTenantId: tenant.id,
    performedByPlatformUserId: performedById,
    details: { name: tenant.name, subdomain: tenant.subdomain, planId: tenant.planId, adminUserId, branchId },
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

  // D-2-06: validate companyTypeId when provided (null is allowed to clear the assignment)
  if (data.companyTypeId !== undefined && data.companyTypeId !== null) {
    const ct = await companyTypeRepo.findCompanyTypeById(data.companyTypeId)
    if (!ct || !ct.isActive) throw new CompanyTypeNotFoundError()
  }

  const updateData: UpdateTenantData = {
    name:          data.name,
    subdomain:     data.subdomain,
    planId:        data.planId,
    companyTypeId: data.companyTypeId,
  }
  const updated = await customersRepo.updateTenant(id, updateData)

  await platformAuditRepo.createPlatformAuditLog({
    action: 'customer.update',
    targetTenantId: id,
    performedByPlatformUserId: performedById,
    details: {
      before: { name: tenant.name, subdomain: tenant.subdomain, planId: tenant.planId },
      after: { name: data.name, subdomain: data.subdomain, planId: data.planId },
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

  await platformAuditRepo.createPlatformAuditLog({
    action: 'tenant.suspend',
    targetTenantId: id,
    performedByPlatformUserId: performedById,
    details: { tenantName: tenant.name },
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

  await platformAuditRepo.createPlatformAuditLog({
    action: 'tenant.reactivate',
    targetTenantId: id,
    performedByPlatformUserId: performedById,
    details: { tenantName: tenant.name },
  })

  return updated
}

