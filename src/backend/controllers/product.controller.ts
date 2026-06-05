// Product / inventory controller — thin HTTP handlers (parse → service → respond).
import { Request, Response, NextFunction } from 'express'
import * as productService from '../services/product.service'

export async function listProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page     = req.query.page ? Number(req.query.page) : 1
    const limit    = req.query.limit ? Number(req.query.limit) : 20
    const category = typeof req.query.category === 'string' ? req.query.category : undefined
    const search   = typeof req.query.search === 'string' ? req.query.search : undefined
    const data = await productService.listProducts(req.context!.tenantId, page, limit, category, search)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function getAlerts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await productService.getAlerts(req.context!.tenantId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function getProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await productService.getProduct(req.context!.tenantId, Number(req.params.id))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function getMovements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await productService.getMovements(req.context!.tenantId, Number(req.params.id))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function createProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await productService.createProduct(req.context!.tenantId, req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function updateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await productService.updateProduct(req.context!.tenantId, Number(req.params.id), req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function stockIn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await productService.stockIn(req.context!.tenantId, Number(req.params.id), req.body, req.context!.userId)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function deactivateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await productService.deactivateProduct(req.context!.tenantId, Number(req.params.id))
    res.json({ success: true, data: { message: 'Product deactivated' } })
  } catch (err) { next(err) }
}
