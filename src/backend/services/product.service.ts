// Product / inventory service — business logic + co-located Zod schemas (CODING_RULES §5).
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
  qty:        z.number().positive(),
  lotNo:      z.string().max(100).optional().nullable(),
  expiryDate: z.string().datetime().optional().nullable(),
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
  tenantId: number, page = 1, limit = 20, category?: string, search?: string,
) {
  const skip = (page - 1) * limit
  const [products, total] = await Promise.all([
    productRepo.findProducts(tenantId, { skip, take: limit, category, search }),
    productRepo.countProducts(tenantId, category, search),
  ])
  return { products, total, page, limit }
}

export async function getProduct(tenantId: number, id: number) {
  const product = await productRepo.findProductById(tenantId, id)
  if (!product) throw new ProductError('Product not found', 404)
  return product
}

export function createProduct(tenantId: number, data: CreateProductInput) {
  return productRepo.createProduct(tenantId, data)
}

export async function updateProduct(tenantId: number, id: number, data: UpdateProductInput) {
  await getProduct(tenantId, id)
  return productRepo.updateProduct(tenantId, id, data)
}

export async function stockIn(tenantId: number, id: number, data: StockInInput, performedBy?: number) {
  await getProduct(tenantId, id)
  return productRepo.stockIn(tenantId, id, data, performedBy)
}

export async function getMovements(tenantId: number, id: number) {
  await getProduct(tenantId, id)
  return productRepo.findMovements(tenantId, id)
}

export async function deactivateProduct(tenantId: number, id: number) {
  await getProduct(tenantId, id)
  await productRepo.deactivateProduct(tenantId, id)
}

export async function getAlerts(tenantId: number) {
  const [lowStock, expiringSoon, inventoryValue] = await Promise.all([
    productRepo.findLowStock(tenantId),
    productRepo.findExpiringSoon(tenantId, EXPIRY_ALERT_DAYS),
    productRepo.sumInventoryValue(tenantId),
  ])
  return {
    lowStock,
    expiringSoon,
    lowStockCount: lowStock.length,
    expiringSoonCount: expiringSoon.length,
    inventoryValue,
    expiryWindowDays: EXPIRY_ALERT_DAYS,
  }
}
