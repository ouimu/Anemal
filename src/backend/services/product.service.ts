// Product / inventory service — business logic + co-located Zod schemas (CODING_RULES §5).
// Phase 4: stock is per-branch; branchId threaded from the request context.
import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as productRepo from '../models/product.repository'

const PRODUCT_CATEGORIES = ['Medicine', 'Vaccine', 'Supply', 'Food', 'Equipment', 'Grooming', 'Other'] as const

export const createProductSchema = z.object({
  name:          z.string().trim().min(1).max(255),
  category:      z.enum(PRODUCT_CATEGORIES).optional(),
  barcode:       z.string().max(100).optional().nullable(),
  unit:          z.string().max(50).optional().nullable(),
  unitPrice:     z.number().nonnegative().default(0),
  unitCost:      z.number().nonnegative().optional().nullable(),
  minStockLevel: z.number().nonnegative().default(0),
}).strict()

export const updateProductSchema = z.object({
  name:          z.string().trim().min(1).max(255).optional(),
  category:      z.enum(PRODUCT_CATEGORIES).optional(),
  barcode:       z.string().max(100).optional().nullable(),
  unit:          z.string().max(50).optional().nullable(),
  unitPrice:     z.number().nonnegative().optional(),
  unitCost:      z.number().nonnegative().optional().nullable(),
  minStockLevel: z.number().nonnegative().optional(),
}).strict()

export const stockInSchema = z.object({
  qty:         z.number().positive(),
  lotNo:       z.string().max(100).optional().nullable(),
  expiryDate:  z.string().datetime().optional().nullable(),
  minStockQty: z.number().nonnegative().optional(),
}).strict()

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
export type StockInInput = z.infer<typeof stockInSchema>

const EXPIRY_ALERT_DAYS = 30

export class ProductError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'PRODUCT_ERROR')
  }
}

export async function listProducts(
  tenantId: number, branchId: number | null, page = 1, limit = 20, category?: string, search?: string,
) {
  const skip = (page - 1) * limit
  const [products, total] = await Promise.all([
    productRepo.findProducts(tenantId, branchId, { skip, take: limit, category, search }),
    productRepo.countProducts(tenantId, category, search),
  ])
  return { products, total, page, limit }
}

export async function getProduct(tenantId: number, branchId: number, id: number) {
  const product = await productRepo.findProductById(tenantId, branchId, id)
  if (!product) throw new ProductError('Product not found', 404)
  return product
}

export function createProduct(tenantId: number, branchId: number, data: CreateProductInput) {
  return productRepo.createProduct(tenantId, branchId, data)
}

export async function updateProduct(tenantId: number, branchId: number, id: number, data: UpdateProductInput) {
  await getProduct(tenantId, branchId, id)
  if (data.minStockLevel != null) await productRepo.setMinStock(tenantId, branchId, id, data.minStockLevel)
  return productRepo.updateProduct(tenantId, id, data)
}

export async function stockIn(tenantId: number, branchId: number, id: number, data: StockInInput, performedBy?: number) {
  await getProduct(tenantId, branchId, id)
  return productRepo.stockIn(tenantId, branchId, id, data, performedBy)
}

export async function getMovements(tenantId: number, branchId: number, id: number) {
  await getProduct(tenantId, branchId, id)
  return productRepo.findMovements(tenantId, branchId, id)
}

export async function deactivateProduct(tenantId: number, branchId: number, id: number) {
  await getProduct(tenantId, branchId, id)
  await productRepo.deactivateProduct(tenantId, id)
}

export async function getAlerts(tenantId: number, branchId: number) {
  const [lowStock, expiringSoon, inventoryValue] = await Promise.all([
    productRepo.findLowStock(tenantId, branchId),
    productRepo.findExpiringSoon(tenantId, branchId, EXPIRY_ALERT_DAYS),
    productRepo.sumInventoryValue(tenantId, branchId),
  ])
  return {
    lowStock, expiringSoon,
    lowStockCount: lowStock.length,
    expiringSoonCount: expiringSoon.length,
    inventoryValue,
    expiryWindowDays: EXPIRY_ALERT_DAYS,
  }
}
