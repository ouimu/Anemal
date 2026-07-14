/**
 * Platform-customers controller — HTTP handlers for tenant management on the
 * platform plane.
 *
 * Controllers are HTTP-only: validate input with Zod, delegate to the service,
 * return the standard { success, data } envelope. No business logic lives here.
 *
 * @module platform-customers.controller
 */

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as customersService from '../services/platform-customers.service'
import * as plansService from '../services/platform-plans.service'
import * as provisioningService from '../services/platform-provisioning.service'
import * as usageService from '../services/usage.service'

/** Zod schema for POST /platform/customers */
export const createCustomerSchema = z.object({
  name:          z.string().trim().min(1).max(255),
  subdomain:     z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, digits, and hyphens'),
  planId:        z.number().int().positive(),
  // D-2-06: optional company type assignment at creation time
  companyTypeId: z.number().int().positive().optional(),
}).strict()

/** Zod schema for PUT /platform/customers/:id */
export const updateCustomerSchema = z.object({
  name:          z.string().trim().min(1).max(255).optional(),
  subdomain:     z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, digits, and hyphens').optional(),
  planId:        z.number().int().positive().optional().nullable(),
  // D-2-06: optional company type update (nullable to clear the assignment)
  companyTypeId: z.number().int().positive().nullable().optional(),
}).strict()

/** Zod schema for PUT /platform/customers/:id/provisioning */
export const updateProvisioningSchema = z.object({
  s3Bucket:         z.string().trim().max(255).optional().nullable(),
  s3Prefix:         z.string().trim().max(255).optional().nullable(),
  s3Region:         z.string().trim().max(50).optional().nullable(),
  baseSmsProvider:  z.string().trim().max(50).optional().nullable(),
  baseSmsApiKey:    z.string().trim().optional().nullable(),
  smtpHost:         z.string().trim().max(255).optional().nullable(),
  smtpPort:         z.number().int().min(1).max(65535).optional().nullable(),
  smtpUser:         z.string().trim().max(255).optional().nullable(),
  smtpPassword:     z.string().trim().optional().nullable(),
  lineChannelId:    z.string().trim().max(100).optional().nullable(),
  lineChannelSecret: z.string().trim().optional().nullable(),
}).strict()

/** Zod schema for PUT /platform/customers/:id/quota */
export const setQuotaSchema = z.object({
  maxBranches: z.number().int().positive().optional().nullable(),
  maxUsers:    z.number().int().positive().optional().nullable(),
  maxOwners:   z.number().int().positive().optional().nullable(),
}).strict()

/**
 * Zod schema for POST /platform/customers/:id/admin-users.
 *
 * Shape/format validation only (→ 400 on failure via validate.middleware).
 * The "at least one of email/phone" and "password >= 8 chars" business rules
 * are enforced in the service layer instead (→ 422), matching the existing
 * `user.service.ts` UserError precedent — this codebase's validate.middleware
 * always maps Zod failures to 400, so those two rules cannot be Zod-level
 * checks if they must surface as 422.
 */
export const createTenantAdminUserSchema = z.object({
  name:     z.string().trim().min(1).max(255),
  username: z.string().trim().min(1).max(20),
  email:    z.string().trim().email().max(255).optional(),
  phone:    z.string().trim().max(20).optional(),
  password: z.string().optional(),
}).strict()

/**
 * GET /platform/customers
 */
export async function handleListCustomers(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await customersService.listCustomers()
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /platform/customers
 */
export async function handleCreateCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as z.infer<typeof createCustomerSchema>
    const performedById = req.context!.platformUserId!
    const data = await customersService.createCustomer(body, performedById)
    res.status(201).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /platform/customers/:id
 */
export async function handleGetCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id)
    const data = await customersService.getCustomer(id)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * PUT /platform/customers/:id
 */
export async function handleUpdateCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id)
    const body = req.body as z.infer<typeof updateCustomerSchema>
    const performedById = req.context!.platformUserId!
    const data = await customersService.updateCustomer(id, body, performedById)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /platform/customers/:id/suspend
 */
export async function handleSuspendCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id)
    const performedById = req.context!.platformUserId!
    const data = await customersService.suspendCustomer(id, performedById)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /platform/customers/:id/reactivate
 */
export async function handleReactivateCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id)
    const performedById = req.context!.platformUserId!
    const data = await customersService.reactivateCustomer(id, performedById)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /platform/customers/:id/quota
 */
export async function handleGetEffectiveQuota(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id)
    const data = await plansService.getEffectiveQuota(id)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * PUT /platform/customers/:id/quota
 */
export async function handleSetQuotaOverride(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id)
    const body = req.body as z.infer<typeof setQuotaSchema>
    const performedById = req.context!.platformUserId!
    const data = await plansService.setQuotaOverride(id, body, performedById)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /platform/customers/:id/usage
 *
 * Returns live usage counts (branches, users, owners) and plan caps for a
 * tenant, plus an `overPlan` flag when any count exceeds its cap.
 * A null cap means unlimited — that dimension never triggers overPlan.
 */
export async function handleGetCustomerUsage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id)
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid customer id' })
      return
    }
    const quota = await plansService.getEffectiveQuota(id)
    const data  = await usageService.getPlatformCustomerUsage(id, quota.effective)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /platform/customers/:id/provisioning
 *
 * Returns the provisioning configuration for a tenant with secrets masked.
 * Returns 404 when no provisioning row exists yet for this tenant.
 */
export async function handleGetProvisioning(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id)
    const data = await provisioningService.getProvisioning(id)
    if (!data) {
      res.status(404).json({ success: false, error: 'Provisioning not configured for this tenant' })
      return
    }
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * PUT /platform/customers/:id/provisioning
 *
 * Create or update the provisioning configuration for a tenant.
 * Partial updates are supported — only provided fields are written.
 * Secret fields are encrypted before storage; the response has them masked.
 */
export async function handleUpdateProvisioning(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id)
    const body = req.body as z.infer<typeof updateProvisioningSchema>
    const performedById = req.context!.platformUserId!
    const data = await provisioningService.updateProvisioning(id, body, performedById)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /platform/customers/:id/admin-users
 */
export async function handleCreateTenantAdminUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = Number(req.params.id)
    const body = req.body as z.infer<typeof createTenantAdminUserSchema>
    const performedById = req.context!.platformUserId!
    const data = await customersService.createTenantAdminUser(tenantId, body, performedById)
    res.status(201).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /platform/customers/:id/admin-users/:userId/deactivate
 */
export async function handleDeactivateTenantAdminUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = Number(req.params.id)
    const userId = Number(req.params.userId)
    const performedById = req.context!.platformUserId!
    const data = await customersService.deactivateTenantAdminUser(tenantId, userId, performedById)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}
