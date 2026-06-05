import { useQuery } from '@tanstack/react-query'
import api from '../utils/api'

export interface RevenuePoint { label: string; revenue: number }
export interface RevenueReport { period: 'daily' | 'monthly'; series: RevenuePoint[]; total: number }
export interface TopService { label: string; revenue: number; qty: number }
export interface InventoryUsageRow { itemId: number; name: string; qtyUsed: number }
export interface ReportSnapshot {
  revenueToday:      number
  revenueThisMonth:  number
  pendingInvoices:   number
  lowStockCount:     number
  expiringSoonCount: number
}

export function useRevenue(period: 'daily' | 'monthly') {
  return useQuery<RevenueReport>({
    queryKey: ['reports', 'revenue', period],
    queryFn: () => api.get('/api/reports/revenue', { params: { period } }).then((r) => r.data.data),
  })
}

export function useReportSnapshot() {
  return useQuery<ReportSnapshot>({
    queryKey: ['reports', 'snapshot'],
    queryFn: () => api.get('/api/reports/snapshot').then((r) => r.data.data),
    retry: false,
  })
}

export function useTopServices() {
  return useQuery<TopService[]>({
    queryKey: ['reports', 'top-services'],
    queryFn: () => api.get('/api/reports/top-services').then((r) => r.data.data),
  })
}
