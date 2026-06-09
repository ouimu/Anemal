// Reports service — composes tenant-scoped aggregates for the analytics dashboard.
import * as reportRepo from '../models/report.repository'
import * as productRepo from '../models/product.repository'

const DAILY_DAYS = 14
const MONTHLY_MONTHS = 6
const TOP_SERVICES_LIMIT = 5
const USAGE_LIMIT = 10
const EXPIRY_WINDOW_DAYS = 30

export async function getRevenue(tenantId: number, period: 'daily' | 'monthly') {
  const series = period === 'monthly'
    ? await reportRepo.revenueMonthly(tenantId, MONTHLY_MONTHS)
    : await reportRepo.revenueDaily(tenantId, DAILY_DAYS)
  const total = series.reduce((sum, p) => sum + Number(p.revenue), 0)
  return { period, series, total: Math.round(total * 100) / 100 }
}

export function getTopServices(tenantId: number) {
  return reportRepo.topServices(tenantId, TOP_SERVICES_LIMIT)
}

export function getInventoryUsage(tenantId: number) {
  return reportRepo.inventoryUsage(tenantId, USAGE_LIMIT)
}

export function getBranchRevenue(tenantId: number, from?: Date, to?: Date) {
  return reportRepo.branchRevenue(tenantId, from, to)
}

export async function getSnapshot(tenantId: number, branchId: number) {
  const [revenueToday, revenueThisMonth, pendingInvoices, lowStock, expiringSoon] = await Promise.all([
    reportRepo.revenueToday(tenantId),
    reportRepo.revenueThisMonth(tenantId),
    reportRepo.countPendingInvoices(tenantId),
    productRepo.findLowStock(tenantId, branchId),
    productRepo.findExpiringSoon(tenantId, branchId, EXPIRY_WINDOW_DAYS),
  ])
  return {
    revenueToday,
    revenueThisMonth,
    pendingInvoices,
    lowStockCount: lowStock.length,
    expiringSoonCount: expiringSoon.length,
  }
}
