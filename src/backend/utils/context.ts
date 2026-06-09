// Helpers to pull required values off the authenticated request context.
import { Request } from 'express'
import { AppError } from './errors'

export function requireBranchId(req: Request): number {
  const branchId = req.context?.branchId
  if (!branchId) throw new AppError(400, 'No active branch selected', 'NO_BRANCH')
  return branchId
}
