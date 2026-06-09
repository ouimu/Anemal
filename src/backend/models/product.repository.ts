// Product / inventory repository — catalog (inventory_items) + per-branch stock (branch_inventory).
// Phase 4: stock is branch-scoped (branchId required). Raw SQL double-quotes camelCase columns.
import prisma from '../config/db'
import type { CreateProductInput, UpdateProductInput, StockInInput } from '../services/product.service'

interface ListParams { skip: number; take: number; category?: string; search?: string }

function catalogWhere(tenantId: number, category?: string, search?: string) {
  return {
    tenantId,
    isActive: true,
    ...(category ? { category } : {}),
    ...(search
      ? { OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { barcode: { contains: search, mode: 'insensitive' as const } },
        ] }
      : {}),
  }
}

type ItemWithStock = { branchInventory?: { stockQty: unknown; minStockQty: unknown; expiryDate: Date | null; lotNo: string | null }[] }
function flatten<T extends ItemWithStock>(item: T, branchId: number) {
  const bi = item.branchInventory?.[0]
  const { branchInventory: _bi, ...rest } = item
  return {
    ...rest,
    branchId,
    stockQty:    bi ? Number(bi.stockQty) : 0,
    minStockQty: bi ? Number(bi.minStockQty) : 0,
    expiryDate:  bi?.expiryDate ?? null,
    lotNo:       bi?.lotNo ?? null,
  }
}

export async function findProducts(tenantId: number, branchId: number, { skip, take, category, search }: ListParams) {
  const items = await prisma.inventoryItem.findMany({
    where: catalogWhere(tenantId, category, search),
    orderBy: { name: 'asc' },
    skip, take,
    include: { branchInventory: { where: { branchId } } },
  })
  return items.map((i) => flatten(i, branchId))
}

export function countProducts(tenantId: number, category?: string, search?: string) {
  return prisma.inventoryItem.count({ where: catalogWhere(tenantId, category, search) })
}

export async function findProductById(tenantId: number, branchId: number, id: number) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id, tenantId },
    include: { branchInventory: { where: { branchId } } },
  })
  return item ? flatten(item, branchId) : null
}

export function createProduct(tenantId: number, branchId: number, data: CreateProductInput) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.create({
      data: {
        tenantId,
        name: data.name, category: data.category, barcode: data.barcode ?? null,
        unit: data.unit ?? null, unitPrice: data.unitPrice, unitCost: data.unitCost ?? null,
      },
    })
    await tx.branchInventory.create({
      data: { tenantId, branchId, productId: item.id, stockQty: 0, minStockQty: data.minStockLevel ?? 0 },
    })
    return item
  })
}

export function updateProduct(tenantId: number, id: number, data: UpdateProductInput) {
  const { minStockLevel: _drop, ...catalog } = data
  return prisma.inventoryItem
    .updateMany({ where: { id, tenantId }, data: catalog })
    .then(() => prisma.inventoryItem.findFirst({ where: { id, tenantId } }))
}

// Per-branch minStock threshold update (used when editing a product's branch row).
export function setMinStock(tenantId: number, branchId: number, productId: number, minStockQty: number) {
  return prisma.branchInventory.upsert({
    where: { tenantId_branchId_productId: { tenantId, branchId, productId } },
    update: { minStockQty },
    create: { tenantId, branchId, productId, stockQty: 0, minStockQty },
  })
}

export function stockIn(tenantId: number, branchId: number, productId: number, data: StockInInput, performedBy?: number) {
  return prisma.$transaction(async (tx) => {
    const bi = await tx.branchInventory.upsert({
      where: { tenantId_branchId_productId: { tenantId, branchId, productId } },
      update: {
        stockQty: { increment: data.qty },
        ...(data.expiryDate ? { expiryDate: new Date(data.expiryDate) } : {}),
        ...(data.lotNo ? { lotNo: data.lotNo } : {}),
        ...(data.minStockQty != null ? { minStockQty: data.minStockQty } : {}),
      },
      create: {
        tenantId, branchId, productId,
        stockQty: data.qty, minStockQty: data.minStockQty ?? 0,
        lotNo: data.lotNo ?? null, expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
      },
    })
    await tx.stockMovement.create({
      data: {
        tenantId, branchId, itemId: productId, movementType: 'in', qty: data.qty,
        referenceType: 'manual', notes: data.lotNo ? `Lot ${data.lotNo}` : null, performedBy: performedBy ?? null,
      },
    })
    return bi
  })
}

export function findMovements(tenantId: number, branchId: number, itemId: number) {
  return prisma.stockMovement.findMany({
    where: { tenantId, branchId, itemId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

export function deactivateProduct(tenantId: number, id: number) {
  return prisma.inventoryItem.updateMany({ where: { id, tenantId }, data: { isActive: false } })
}

interface AlertRow {
  id: number; name: string; category: string | null; unit: string | null
  stockQty: number; minStockQty: number; expiryDate: Date | null; unitPrice: number | null
}

export function findLowStock(tenantId: number, branchId: number) {
  return prisma.$queryRaw<AlertRow[]>`
    SELECT i.id, i.name, i.category, i.unit, bi."stockQty", bi."minStockQty", bi."expiryDate", i."unitPrice"
    FROM branch_inventory bi JOIN inventory_items i ON i.id = bi."productId"
    WHERE bi."tenantId" = ${tenantId} AND bi."branchId" = ${branchId} AND i."isActive" = TRUE
      AND bi."minStockQty" > 0 AND bi."stockQty" <= bi."minStockQty"
    ORDER BY bi."stockQty" ASC
  `
}

export function findExpiringSoon(tenantId: number, branchId: number, withinDays: number) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + withinDays)
  return prisma.$queryRaw<AlertRow[]>`
    SELECT i.id, i.name, i.category, i.unit, bi."stockQty", bi."minStockQty", bi."expiryDate", i."unitPrice"
    FROM branch_inventory bi JOIN inventory_items i ON i.id = bi."productId"
    WHERE bi."tenantId" = ${tenantId} AND bi."branchId" = ${branchId} AND i."isActive" = TRUE
      AND bi."expiryDate" IS NOT NULL AND bi."expiryDate" <= ${cutoff}
    ORDER BY bi."expiryDate" ASC
  `
}

export async function sumInventoryValue(tenantId: number, branchId: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ value: number | null }[]>`
    SELECT COALESCE(SUM(bi."stockQty" * COALESCE(i."unitPrice", 0)), 0)::float8 AS value
    FROM branch_inventory bi JOIN inventory_items i ON i.id = bi."productId"
    WHERE bi."tenantId" = ${tenantId} AND bi."branchId" = ${branchId} AND i."isActive" = TRUE
  `
  return Number(rows[0]?.value ?? 0)
}
