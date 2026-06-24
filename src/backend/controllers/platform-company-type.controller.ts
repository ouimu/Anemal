/**
 * Platform company-type controller — HTTP handlers for managing the
 * company_types reference table on the platform plane.
 *
 * Controllers are HTTP-only: validate input with Zod, delegate to the service,
 * return the standard { success, data } envelope. No business logic lives here.
 *
 * @module platform-company-type.controller
 */

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as companyTypeService from '../services/platform-company-type.service'

/** Key validation: lowercase letters and underscores only, 2–50 chars. */
const KEY_REGEX = /^[a-z_]+$/

/** Zod schema for POST /platform/company-types */
export const createCompanyTypeSchema = z.object({
  key:       z.string().min(2).max(50).regex(KEY_REGEX, 'Key may only contain lowercase letters and underscores'),
  nameEn:    z.string().min(1).max(100),
  nameTh:    z.string().min(1).max(100),
  sortOrder: z.number().int().min(0).optional().default(0),
}).strict()

/** Zod schema for PATCH /platform/company-types/:id */
export const updateCompanyTypeSchema = z.object({
  nameEn:    z.string().min(1).max(100).optional(),
  nameTh:    z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive:  z.boolean().optional(),
}).strict()

/**
 * GET /platform/company-types
 * Returns all company types (active + inactive) for the platform admin.
 */
export async function handleListCompanyTypes(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await companyTypeService.listCompanyTypes()
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /platform/company-types
 * Creates a new company type. Requires a unique key.
 */
export async function handleCreateCompanyType(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as z.infer<typeof createCompanyTypeSchema>
    const data = await companyTypeService.createCompanyType(body)
    res.status(201).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /platform/company-types/:id
 * Updates nameEn, nameTh, sortOrder, or isActive for a company type.
 */
export async function handleUpdateCompanyType(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id   = Number(req.params.id)
    const body = req.body as z.infer<typeof updateCompanyTypeSchema>
    const data = await companyTypeService.updateCompanyType(id, body)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * DELETE /platform/company-types/:id
 * Soft-deletes a company type. Returns 409 if any tenants still reference it.
 */
export async function handleDeleteCompanyType(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id)
    await companyTypeService.deleteCompanyType(id)
    res.status(200).json({ success: true, data: { message: 'Company type deleted' } })
  } catch (err) {
    next(err)
  }
}
