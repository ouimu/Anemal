// Reports repository — read-only aggregates, all tenant-scoped raw SQL.
// NOTE: revenueDaily, revenueMonthly, revenueToday, revenueThisMonth, countPendingInvoices,
// topServices, inventoryUsage are intentionally tenant-wide: admin aggregate reports that
// summarise across ALL branches for the clinic dashboard. Do NOT add branchId filters here.
// branchRevenue is the only function that already breaks down by branch.
import prisma from '../config/db'

export interface SeriesPoint { label: string; revenue: number }
export interface TopServiceRow { label: string; revenue: number; qty: number }
export interface UsageRow { itemId: number; name: string; qtyUsed: number }

export function revenueDaily(tenantId: number, days: number): Promise<SeriesPoint[]> {
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  since.setDate(since.getDate() - (days - 1))
  return prisma.$queryRaw<SeriesPoint[]>`
    SELECT to_char(date_trunc('day', "issuedAt"), 'YYYY-MM-DD') AS label,
           COALESCE(SUM("totalAmount"), 0)::float8 AS revenue
    FROM invoices
    WHERE "tenantId" = ${tenantId} AND "paymentStatus" = 'paid' AND "issuedAt" >= ${since}
    GROUP BY 1 ORDER BY 1
  `
}

export function revenueMonthly(tenantId: number, months: number): Promise<SeriesPoint[]> {
  const now = new Date()
  const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
  return prisma.$queryRaw<SeriesPoint[]>`
    SELECT to_char(date_trunc('month', "issuedAt"), 'YYYY-MM') AS label,
           COALESCE(SUM("totalAmount"), 0)::float8 AS revenue
    FROM invoices
    WHERE "tenantId" = ${tenantId} AND "paymentStatus" = 'paid' AND "issuedAt" >= ${since}
    GROUP BY 1 ORDER BY 1
  `
}

export function topServices(tenantId: number, limit: number): Promise<TopServiceRow[]> {
  return prisma.$queryRaw<TopServiceRow[]>`
    SELECT "itemType" AS label,
           COALESCE(SUM("totalPrice"), 0)::float8 AS revenue,
           COALESCE(SUM(quantity), 0)::float8 AS qty
    FROM invoice_items
    WHERE "tenantId" = ${tenantId}
    GROUP BY "itemType" ORDER BY revenue DESC LIMIT ${limit}
  `
}

export function inventoryUsage(tenantId: number, limit: number): Promise<UsageRow[]> {
  return prisma.$queryRaw<UsageRow[]>`
    SELECT i.id AS "itemId", i.name AS name, COALESCE(SUM(m.qty), 0)::float8 AS "qtyUsed"
    FROM stock_movements m
    JOIN inventory_items i ON i.id = m."itemId"
    WHERE m."tenantId" = ${tenantId} AND m."movementType" = 'out'
    GROUP BY i.id, i.name ORDER BY "qtyUsed" DESC LIMIT ${limit}
  `
}

async function paidRevenueSince(tenantId: number, since: Date, until?: Date): Promise<number> {
  const rows = until
    ? await prisma.$queryRaw<{ value: number }[]>`
        SELECT COALESCE(SUM("totalAmount"), 0)::float8 AS value FROM invoices
        WHERE "tenantId" = ${tenantId} AND "paymentStatus" = 'paid'
          AND "issuedAt" >= ${since} AND "issuedAt" < ${until}`
    : await prisma.$queryRaw<{ value: number }[]>`
        SELECT COALESCE(SUM("totalAmount"), 0)::float8 AS value FROM invoices
        WHERE "tenantId" = ${tenantId} AND "paymentStatus" = 'paid' AND "issuedAt" >= ${since}`
  return Number(rows[0]?.value ?? 0)
}

export async function revenueToday(tenantId: number): Promise<number> {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  return paidRevenueSince(tenantId, start, end)
}

export async function revenueThisMonth(tenantId: number): Promise<number> {
  const now = new Date()
  return paidRevenueSince(tenantId, new Date(now.getFullYear(), now.getMonth(), 1))
}

export function countPendingInvoices(tenantId: number): Promise<number> {
  return prisma.invoice.count({ where: { tenantId, paymentStatus: 'pending' } })
}

export interface BranchRevenueRow { branchId: number; branchName: string; total: number; count: number }

export function branchRevenue(tenantId: number, from?: Date, to?: Date): Promise<BranchRevenueRow[]> {
  if (from && to) {
    return prisma.$queryRaw<BranchRevenueRow[]>`
      SELECT b.id AS "branchId", b.name AS "branchName",
             COALESCE(SUM(i."totalAmount"), 0)::float8 AS total,
             COUNT(i.id)::int AS count
      FROM branches b
      LEFT JOIN invoices i ON i."branchId" = b.id AND i."tenantId" = ${tenantId}
        AND i."paymentStatus" = 'paid' AND i."issuedAt" >= ${from} AND i."issuedAt" < ${to}
      WHERE b."tenantId" = ${tenantId} AND b."isActive" = true
      GROUP BY b.id, b.name ORDER BY total DESC`
  }
  if (from) {
    return prisma.$queryRaw<BranchRevenueRow[]>`
      SELECT b.id AS "branchId", b.name AS "branchName",
             COALESCE(SUM(i."totalAmount"), 0)::float8 AS total,
             COUNT(i.id)::int AS count
      FROM branches b
      LEFT JOIN invoices i ON i."branchId" = b.id AND i."tenantId" = ${tenantId}
        AND i."paymentStatus" = 'paid' AND i."issuedAt" >= ${from}
      WHERE b."tenantId" = ${tenantId} AND b."isActive" = true
      GROUP BY b.id, b.name ORDER BY total DESC`
  }
  return prisma.$queryRaw<BranchRevenueRow[]>`
    SELECT b.id AS "branchId", b.name AS "branchName",
           COALESCE(SUM(i."totalAmount"), 0)::float8 AS total,
           COUNT(i.id)::int AS count
    FROM branches b
    LEFT JOIN invoices i ON i."branchId" = b.id AND i."tenantId" = ${tenantId}
      AND i."paymentStatus" = 'paid'
    WHERE b."tenantId" = ${tenantId} AND b."isActive" = true
    GROUP BY b.id, b.name ORDER BY total DESC`
}

// ─── Branch-scoped, payment-received basis (2026-06-25) ──────────────────────
// Uses payment_history.paidAt + amount. Old invoice-based functions above are
// preserved for admin-dashboard consumers — do NOT delete them.

export async function revenueTodayBranch(tenantId: number, branchId: number | null): Promise<number> {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end   = new Date(start); end.setDate(end.getDate() + 1)
  if (branchId) {
    const rows = await prisma.$queryRaw<{ value: number }[]>`
      SELECT COALESCE(SUM(amount), 0)::float8 AS value FROM payment_history
      WHERE "tenantId" = ${tenantId} AND "branchId" = ${branchId}
        AND "paidAt" >= ${start} AND "paidAt" < ${end}`
    return Number(rows[0]?.value ?? 0)
  }
  const rows = await prisma.$queryRaw<{ value: number }[]>`
    SELECT COALESCE(SUM(amount), 0)::float8 AS value FROM payment_history
    WHERE "tenantId" = ${tenantId} AND "paidAt" >= ${start} AND "paidAt" < ${end}`
  return Number(rows[0]?.value ?? 0)
}

export function revenueSeriesBranch(
  tenantId: number,
  branchId: number | null,
  period:   'daily' | 'monthly',
  n:        number,
): Promise<SeriesPoint[]> {
  if (period === 'daily') {
    const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (n - 1))
    if (branchId) {
      return prisma.$queryRaw<SeriesPoint[]>`
        SELECT to_char(date_trunc('day', "paidAt"), 'YYYY-MM-DD') AS label,
               COALESCE(SUM(amount), 0)::float8 AS revenue
        FROM payment_history
        WHERE "tenantId" = ${tenantId} AND "branchId" = ${branchId} AND "paidAt" >= ${since}
        GROUP BY 1 ORDER BY 1`
    }
    return prisma.$queryRaw<SeriesPoint[]>`
      SELECT to_char(date_trunc('day', "paidAt"), 'YYYY-MM-DD') AS label,
             COALESCE(SUM(amount), 0)::float8 AS revenue
      FROM payment_history
      WHERE "tenantId" = ${tenantId} AND "paidAt" >= ${since}
      GROUP BY 1 ORDER BY 1`
  }
  // monthly
  const now   = new Date()
  const since = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1)
  if (branchId) {
    return prisma.$queryRaw<SeriesPoint[]>`
      SELECT to_char(date_trunc('month', "paidAt"), 'YYYY-MM') AS label,
             COALESCE(SUM(amount), 0)::float8 AS revenue
      FROM payment_history
      WHERE "tenantId" = ${tenantId} AND "branchId" = ${branchId} AND "paidAt" >= ${since}
      GROUP BY 1 ORDER BY 1`
  }
  return prisma.$queryRaw<SeriesPoint[]>`
    SELECT to_char(date_trunc('month', "paidAt"), 'YYYY-MM') AS label,
           COALESCE(SUM(amount), 0)::float8 AS revenue
    FROM payment_history
    WHERE "tenantId" = ${tenantId} AND "paidAt" >= ${since}
    GROUP BY 1 ORDER BY 1`
}
