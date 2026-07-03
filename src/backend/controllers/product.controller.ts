// Product / inventory controller — thin HTTP handlers (branch-scoped).
import { Request, Response, NextFunction } from 'express'
import * as productService from '../services/product.service'
import { requireBranchId } from '../utils/context'

export async function listProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Admin token carries branchId: null (all-branches scope). Unlike the per-branch
    // write ops below, listing is a read — scope by tenantId only when branchId is null.
    const branchId = req.context?.branchId ?? null
    const page     = req.query.page ? Number(req.query.page) : 1
    const limit    = req.query.limit ? Number(req.query.limit) : 20
    const category = typeof req.query.category === 'string' ? req.query.category : undefined
    const search   = typeof req.query.search === 'string' ? req.query.search : undefined
    const data = await productService.listProducts(req.context!.tenantId, branchId, page, limit, category, search)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function getAlerts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await productService.getAlerts(req.context!.tenantId, requireBranchId(req))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function getProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await productService.getProduct(req.context!.tenantId, requireBranchId(req), Number(req.params.id))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function getMovements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await productService.getMovements(req.context!.tenantId, requireBranchId(req), Number(req.params.id))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function createProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await productService.createProduct(req.context!.tenantId, requireBranchId(req), req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function updateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await productService.updateProduct(req.context!.tenantId, requireBranchId(req), Number(req.params.id), req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function stockIn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await productService.stockIn(req.context!.tenantId, requireBranchId(req), Number(req.params.id), req.body, req.context!.userId)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function deactivateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await productService.deactivateProduct(req.context!.tenantId, requireBranchId(req), Number(req.params.id))
    res.json({ success: true, data: { message: 'Product deactivated' } })
  } catch (err) { next(err) }
}
