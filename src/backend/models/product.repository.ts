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

// branchId === null (admin, all-branches scope): aggregate stock across every branch
// instead of picking one row, so the catalog view still reports meaningful totals.
function flatten<T extends ItemWithStock>(item: T, branchId: number | null) {
  const rows = item.branchInventory ?? []
  const { branchInventory: _bi, ...rest } = item
  if (branchId != null) {
    const bi = rows[0]
    return {
      ...rest,
      branchId,
      stockQty:    bi ? Number(bi.stockQty) : 0,
      minStockQty: bi ? Number(bi.minStockQty) : 0,
      expiryDate:  bi?.expiryDate ?? null,
      lotNo:       bi?.lotNo ?? null,
    }
  }
  return {
    ...rest,
    branchId: null,
    stockQty:    rows.reduce((sum, bi) => sum + Number(bi.stockQty), 0),
    minStockQty: rows.reduce((sum, bi) => sum + Number(bi.minStockQty), 0),
    expiryDate:  null,
    lotNo:       null,
  }
}

export async function findProducts(
  tenantId: number, branchId: number | null, { skip, take, category, search }: ListParams,
) {
  const items = await prisma.inventoryItem.findMany({
    where: catalogWhere(tenantId, category, search),
    orderBy: { name: 'asc' },
    skip, take,
    include: { branchInventory: branchId != null ? { where: { branchId } } : true },
  })
  return items.map((i) => flatten(i, branchId))
}

export function countProducts(tenantId: number, category?: string, search?: string) {
  return prisma.inventoryItem.count({ where: catalogWhere(tenantId, category, search) })
}

export async function findProductById(tenantId: number, branchId: number | null, id: number) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id, tenantId },
    include: { branchInventory: branchId != null ? { where: { branchId } } : true },
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

// R3-HI-05: a receipt's expiry/lot must never silently hide a nearer-expiry
// or differently-lotted batch already on the shelf. The aggregate
// BranchInventory row can only carry one expiryDate/lotNo (it is a sum
// across lots, not a lot table), so:
//   - expiryDate is earliest-wins (SQL LEAST) so alerts never point past
//     the soonest-expiring stock actually on hand.
//   - lotNo is cleared to NULL on a mismatch — the aggregate can no longer
//     honestly claim a single lot identity once two different lots exist.
// The StockMovement row created for this receipt is the real, permanent
// per-receipt lot/expiry record (never aggregated, never overwritten).
export function stockIn(tenantId: number, branchId: number, productId: number, data: StockInInput, performedBy?: number) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.branchInventory.findUnique({
      where: { tenantId_branchId_productId: { tenantId, branchId, productId } },
      select: { lotNo: true },
    })
    const lotChanged = existing != null && data.lotNo != null && existing.lotNo !== data.lotNo
    const receivedExpiry = data.expiryDate ? new Date(data.expiryDate) : null

    await tx.branchInventory.upsert({
      where: { tenantId_branchId_productId: { tenantId, branchId, productId } },
      update: {
        stockQty: { increment: data.qty },
        ...(lotChanged ? { lotNo: null } : data.lotNo ? { lotNo: data.lotNo } : {}),
        ...(data.minStockQty != null ? { minStockQty: data.minStockQty } : {}),
      },
      create: {
        tenantId, branchId, productId,
        stockQty: data.qty, minStockQty: data.minStockQty ?? 0,
        lotNo: data.lotNo ?? null, expiryDate: receivedExpiry,
      },
    })

    // Earliest-wins expiry update, kept on $executeRaw only for this one
    // LEAST comparison (Prisma's fluent API cannot express "min of existing
    // and incoming"); the tenantId+branchId+productId predicate stays scoped.
    if (receivedExpiry) {
      await tx.$executeRaw`
        UPDATE "branch_inventory"
        SET "expiryDate" = LEAST(COALESCE("expiryDate", ${receivedExpiry}), ${receivedExpiry})
        WHERE "tenantId" = ${tenantId} AND "branchId" = ${branchId} AND "productId" = ${productId}
      `
    }

    const bi = await tx.branchInventory.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId, branchId, productId } },
    })

    await tx.stockMovement.create({
      data: {
        tenantId, branchId, itemId: productId, movementType: 'in', qty: data.qty,
        referenceType: 'manual', notes: data.lotNo ? `Lot ${data.lotNo}` : null, performedBy: performedBy ?? null,
        lotNo: data.lotNo ?? null, expiryDate: receivedExpiry,
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

// R2-HI-02: the join predicate must tenant-scope BOTH tables, not just the outer WHERE —
// an outer-WHERE-only filter still lets a malformed/cross-tenant `inventory_items` row
// (matched purely on `productId`) leak into results if one ever exists.
export function findLowStock(tenantId: number, branchId: number) {
  return prisma.$queryRaw<AlertRow[]>`
    SELECT i.id, i.name, i.category, i.unit, bi."stockQty", bi."minStockQty", bi."expiryDate", i."unitPrice"
    FROM branch_inventory bi
    JOIN inventory_items i ON i.id = bi."productId" AND i."tenantId" = ${tenantId}
    WHERE bi."tenantId" = ${tenantId} AND bi."branchId" = ${branchId} AND i."isActive" = TRUE
      AND bi."minStockQty" > 0 AND bi."stockQty" <= bi."minStockQty"
    ORDER BY bi."stockQty" ASC
  `
}

export function findExpiringSoon(tenantId: number, branchId: number, withinDays: number) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + withinDays)
  return prisma.$queryRaw<AlertRow[]>`
    SELECT i.id, i.name, i.category, i.unit, bi."stockQty", bi."minStockQty", bi."expiryDate", i."unitPrice"
    FROM branch_inventory bi
    JOIN inventory_items i ON i.id = bi."productId" AND i."tenantId" = ${tenantId}
    WHERE bi."tenantId" = ${tenantId} AND bi."branchId" = ${branchId} AND i."isActive" = TRUE
      AND bi."stockQty" > 0
      AND bi."expiryDate" IS NOT NULL AND bi."expiryDate" <= ${cutoff}
    ORDER BY bi."expiryDate" ASC
  `
}

export async function sumInventoryValue(tenantId: number, branchId: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ value: number | null }[]>`
    SELECT COALESCE(SUM(bi."stockQty" * COALESCE(i."unitPrice", 0)), 0)::float8 AS value
    FROM branch_inventory bi
    JOIN inventory_items i ON i.id = bi."productId" AND i."tenantId" = ${tenantId}
    WHERE bi."tenantId" = ${tenantId} AND bi."branchId" = ${branchId} AND i."isActive" = TRUE
  `
  return Number(rows[0]?.value ?? 0)
}
