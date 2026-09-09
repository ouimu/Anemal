// Product / inventory repository — catalog (inventory_items) + per-branch stock (branch_inventory).
// Phase 4: stock is branch-scoped (branchId required). Raw SQL double-quotes camelCase columns.
import { Prisma } from '@prisma/client'
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
    include: {
      branchInventory: branchId != null
        ? { where: { tenantId, branchId } }
        : { where: { tenantId } },
    },
  })
  return items.map((i) => flatten(i, branchId))
}

export function countProducts(tenantId: number, category?: string, search?: string) {
  return prisma.inventoryItem.count({ where: catalogWhere(tenantId, category, search) })
}

export async function findProductById(tenantId: number, branchId: number | null, id: number) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id, tenantId },
    include: {
      branchInventory: branchId != null
        ? { where: { tenantId, branchId } }
        : { where: { tenantId } },
    },
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
//   - expiryDate is earliest-wins (SQL LEAST) while stock remains, so alerts
//     never point past the soonest-expiring stock actually on hand — but a
//     receipt landing on an emptied-out bin (pre-receipt stockQty <= 0)
//     replaces the expiry/lot outright instead of LEAST'ing against a stale,
//     now-meaningless value, so the aggregate can self-correct forward.
//   - lotNo is cleared to NULL on a mismatch — the aggregate can no longer
//     honestly claim a single lot identity once two different lots exist.
// The StockMovement row created for this receipt is the real, permanent
// per-receipt lot/expiry record (never aggregated, never overwritten).
export function stockIn(tenantId: number, branchId: number, productId: number, data: StockInInput, performedBy?: number) {
  return prisma.$transaction(async (tx) => {
    const receivedExpiry = data.expiryDate ? new Date(data.expiryDate) : null
    const lotParam = data.lotNo ?? null

    await tx.branchInventory.upsert({
      where: { tenantId_branchId_productId: { tenantId, branchId, productId } },
      update: {
        stockQty: { increment: data.qty },
        ...(data.minStockQty != null ? { minStockQty: data.minStockQty } : {}),
      },
      create: {
        tenantId, branchId, productId,
        stockQty: data.qty, minStockQty: data.minStockQty ?? 0,
        lotNo: lotParam, expiryDate: receivedExpiry,
      },
    })

    // QA follow-up (post a563b7b): the lot-mismatch decision and the
    // earliest-wins expiry update are folded into ONE atomic UPDATE so both
    // are computed under the row's UPDATE lock against the just-committed
    // value — not from a separately-read `existing` snapshot, which left a
    // TOCTOU window where two concurrent receipts could both read the same
    // prior lotNo and produce an inconsistent final aggregate.
    //
    // Lot CASE precedence: bin was empty pre-receipt (stockQty - qty <= 0,
    // where "stockQty" is read AT THE START of this UPDATE — i.e. already
    // includes the increment from the upsert above, so subtracting data.qty
    // recovers the pre-receipt quantity) -> adopt this receipt's lotNo
    // outright (an empty bin's stale lot identity is meaningless); no lotNo
    // on this receipt -> keep as-is; aggregate has no lotNo yet -> adopt
    // this receipt's lotNo (first population, e.g. the very first receipt
    // against a freshly-created NULL-lotNo row); aggregate lotNo differs
    // from this receipt's -> clear to NULL (can't honestly claim a single
    // lot identity across two different lots); else unchanged.
    //
    // Expiry stays in the date domain end-to-end: both columns are
    // `@db.Date`, but a bound JS `Date` param resolves to `timestamptz`, so
    // LEAST(...)  cast back to `date` would be session-TimeZone-dependent
    // (wrong day on a negative-UTC-offset server). Passing the plain
    // `YYYY-MM-DD` string cast to `::date` keeps the comparison and the
    // stored value TZ-independent, matching the `.slice(0,10)` convention
    // already used elsewhere in this function.
    //
    // BA ruling (this session): earliest-wins expiry is otherwise monotone
    // — it can only move earlier, never resets forward. Once a lot fully
    // depletes (stockQty hits 0) the aggregate must be able to self-correct
    // when a later, differently-dated lot arrives, so a receipt landing on
    // an empty bin replaces the expiry outright instead of LEAST'ing it
    // against the now-meaningless stale value.
    if (receivedExpiry) {
      const receivedExpiryDay = receivedExpiry.toISOString().slice(0, 10)
      await tx.$executeRaw`
        UPDATE "branch_inventory"
        SET
          "lotNo" = CASE
            WHEN "stockQty" - ${data.qty}::numeric <= 0 THEN ${lotParam}::text
            WHEN ${lotParam}::text IS NULL THEN "lotNo"
            WHEN "lotNo" IS NULL THEN ${lotParam}::text
            WHEN "lotNo" IS DISTINCT FROM ${lotParam}::text THEN NULL
            ELSE "lotNo"
          END,
          "expiryDate" = CASE
            WHEN "stockQty" - ${data.qty}::numeric <= 0 THEN ${receivedExpiryDay}::date
            ELSE LEAST(COALESCE("expiryDate", ${receivedExpiryDay}::date), ${receivedExpiryDay}::date)
          END
        WHERE "tenantId" = ${tenantId} AND "branchId" = ${branchId} AND "productId" = ${productId}
      `
    } else {
      await tx.$executeRaw`
        UPDATE "branch_inventory"
        SET
          "lotNo" = CASE
            WHEN "stockQty" - ${data.qty}::numeric <= 0 THEN ${lotParam}::text
            WHEN ${lotParam}::text IS NULL THEN "lotNo"
            WHEN "lotNo" IS NULL THEN ${lotParam}::text
            WHEN "lotNo" IS DISTINCT FROM ${lotParam}::text THEN NULL
            ELSE "lotNo"
          END,
          "expiryDate" = CASE WHEN "stockQty" - ${data.qty}::numeric <= 0 THEN NULL ELSE "expiryDate" END
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

/**
 * Atomically deduct `qty` from a branch's stock inside an open transaction,
 * failing silently (returns false, does not throw) if stock is insufficient
 * — the conditional-UPDATE pattern shared by invoice creation, prescription
 * dispensing, and inter-branch transfer to prevent overselling under
 * concurrent writes. The caller decides how to react to a false return
 * (throw a ConflictError with its own message, return null, etc.) — this
 * function has no opinion on failure handling, only on the atomic check.
 */
export async function deductBranchStock(
  tx: Prisma.TransactionClient,
  tenantId: number,
  branchId: number | null | undefined,
  productId: number,
  qty: number,
): Promise<boolean> {
  const affected = await tx.$executeRaw`
    UPDATE branch_inventory
    SET "stockQty" = "stockQty" - ${qty}
    WHERE "tenantId" = ${tenantId} AND "branchId" = ${branchId}
      AND "productId" = ${productId} AND "stockQty" >= ${qty}
  `
  return affected > 0
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
