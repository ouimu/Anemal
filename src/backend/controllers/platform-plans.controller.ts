/**
 * Platform-plans controller — HTTP handlers for subscription plan management
 * on the platform plane.
 *
 * Controllers are HTTP-only: validate input with Zod, delegate to the service,
 * return the standard { success, data } envelope. No business logic lives here.
 *
 * @module platform-plans.controller
 */

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as plansService from '../services/platform-plans.service'

/** Zod schema for POST /platform/plans */
export const createPlanSchema = z.object({
  key:         z.string().trim().min(1).max(50).regex(/^[a-z0-9_]+$/, 'Only lowercase letters, digits, and underscores'),
  name:        z.string().trim().min(1).max(100),
  priceMonth:  z.number().min(0).optional(),
  maxBranches: z.number().int().positive().optional(),
  maxUsers:    z.number().int().positive().optional(),
  maxOwners:   z.number().int().positive().optional().nullable(),
  features:    z.record(z.unknown()).optional(),
}).strict()

/** Zod schema for PUT /platform/plans/:id */
export const updatePlanSchema = z.object({
  name:        z.string().trim().min(1).max(100).optional(),
  priceMonth:  z.number().min(0).optional(),
  maxBranches: z.number().int().positive().optional(),
  maxUsers:    z.number().int().positive().optional(),
  maxOwners:   z.number().int().positive().optional().nullable(),
  features:    z.record(z.unknown()).optional(),
  isActive:    z.boolean().optional(),
}).strict()

/**
 * GET /platform/plans
 */
export async function handleListPlans(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await plansService.listPlans()
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /platform/plans
 */
export async function handleCreatePlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as z.infer<typeof createPlanSchema>
    const performedById = req.context!.platformUserId!
    const data = await plansService.createPlan(body, performedById)
    res.status(201).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /platform/plans/:id
 */
export async function handleGetPlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id)
    const data = await plansService.getPlan(id)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * PUT /platform/plans/:id
 */
export async function handleUpdatePlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id)
    const body = req.body as z.infer<typeof updatePlanSchema>
    const performedById = req.context!.platformUserId!
    const data = await plansService.updatePlan(id, body, performedById)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * DELETE /platform/plans/:id
 */
export async function handleRetirePlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id)
    const performedById = req.context!.platformUserId!
    const data = await plansService.retirePlan(id, performedById)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}
