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

/** Zod schema for POST /platform/customers */
export const createCustomerSchema = z.object({
  name:      z.string().trim().min(1).max(255),
  subdomain: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, digits, and hyphens'),
  planId:    z.number().int().positive().optional().nullable(),
}).strict()

/** Zod schema for PUT /platform/customers/:id */
export const updateCustomerSchema = z.object({
  name:      z.string().trim().min(1).max(255).optional(),
  subdomain: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, digits, and hyphens').optional(),
  planId:    z.number().int().positive().optional().nullable(),
}).strict()

/** Zod schema for PUT /platform/customers/:id/quota */
export const setQuotaSchema = z.object({
  maxBranches: z.number().int().positive().optional().nullable(),
  maxUsers:    z.number().int().positive().optional().nullable(),
  maxOwners:   z.number().int().positive().optional().nullable(),
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
    const data = await customersService.createCustomer(body)
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
    const data = await customersService.updateCustomer(id, body)
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
