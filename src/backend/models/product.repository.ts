// Product / inventory repository — all Prisma access for inventory_items + stock_movements.
// @db-agent: every read/write is scoped by tenantId (first parameter, always).
// Phase 3 uses the flat InventoryItem.stockQuantity model; branch_inventory is Phase 4.

import prisma from '../config/db'
import type { CreateProductInput, UpdateProductInput, StockInInput } from '../services/product.service'

interface ListParams {
  skip: number
  take: number
  category?: string
  search?: string
}

function buildWhere(tenantId: number, category?: string, search?: string) {
  return {
    tenantId,
    isActive: true,
    ...(category ? { category } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { barcode: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }
}

export function findProducts(tenantId: number, { skip, take, category, search }: ListParams) {
  return prisma.inventoryItem.findMany({
    where: buildWhere(tenantId, category, search),
    orderBy: { name: 'asc' },
    skip,
    take,
  })
}

export function countProducts(tenantId: number, category?: string, search?: string) {
  return prisma.inventoryItem.count({ where: buildWhere(tenantId, category, search) })
}

export function findProductById(tenantId: number, id: number) {
  return prisma.inventoryItem.findFirst({ where: { id, tenantId } })
}

export function createProduct(tenantId: number, data: CreateProductInput) {
  return prisma.inventoryItem.create({ data: { ...data, tenantId } })
}

export function updateProduct(tenantId: number, id: number, data: UpdateProductInput) {
  // tenantId in the where clause gives defence-in-depth even though existence was checked.
  return prisma.inventoryItem.updateMany({ where: { id, tenantId }, data }).then(() => findProductById(tenantId, id))
}

// Receive stock: increment quantity, optionally refresh expiry, log an 'in' movement — atomic.
export function stockIn(tenantId: number, id: number, data: StockInInput, performedBy?: number) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.update({
      where: { id },
      data: {
        stockQuantity: { increment: data.qty },
        ...(data.expiryDate ? { expiryDate: new Date(data.expiryDate) } : {}),
      },
    })
    await tx.stockMovement.create({
      data: {
        tenantId,
        itemId:        id,
        movementType:  'in',
        qty:           data.qty,
        referenceType: 'manual',
        notes:         data.lotNo ? `Lot ${data.lotNo}` : null,
        performedBy:   performedBy ?? null,
      },
    })
    return item
  })
}

export function findMovements(tenantId: number, itemId: number) {
  return prisma.stockMovement.findMany({
    where: { tenantId, itemId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

export function deactivateProduct(tenantId: number, id: number) {
  return prisma.inventoryItem.updateMany({ where: { id, tenantId }, data: { isActive: false } })
}

interface AlertRow {
  id: number
  name: string
  category: string | null
  unit: string | null
  stockQuantity: string | number
  minStockLevel: string | number
  expiryDate: Date | null
  unitPrice: string | number | null
}

// NOTE: Prisma maps table names (@@map) but NOT column names — DB columns are camelCase,
// so raw SQL must double-quote them ("tenantId", "stockQuantity", …).
export function findLowStock(tenantId: number) {
  return prisma.$queryRaw<AlertRow[]>`
    SELECT id, name, category, unit, "stockQuantity", "minStockLevel", "expiryDate", "unitPrice"
    FROM inventory_items
    WHERE "tenantId" = ${tenantId} AND "isActive" = TRUE
      AND "minStockLevel" > 0 AND "stockQuantity" <= "minStockLevel"
    ORDER BY "stockQuantity" ASC
  `
}

export function findExpiringSoon(tenantId: number, withinDays: number) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + withinDays)
  return prisma.$queryRaw<AlertRow[]>`
    SELECT id, name, category, unit, "stockQuantity", "minStockLevel", "expiryDate", "unitPrice"
    FROM inventory_items
    WHERE "tenantId" = ${tenantId} AND "isActive" = TRUE
      AND "expiryDate" IS NOT NULL AND "expiryDate" <= ${cutoff}
    ORDER BY "expiryDate" ASC
  `
}

export async function sumInventoryValue(tenantId: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ value: number | null }[]>`
    SELECT COALESCE(SUM("stockQuantity" * COALESCE("unitPrice", 0)), 0)::float8 AS value
    FROM inventory_items
    WHERE "tenantId" = ${tenantId} AND "isActive" = TRUE
  `
  return Number(rows[0]?.value ?? 0)
}
