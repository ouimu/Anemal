import { useQuery } from '@tanstack/react-query'
import api from '../utils/api'

export interface TransactionRow {
  id:             number
  paidAt:         string
  invoiceNo:      string
  invoiceId:      number
  method:         string | null
  amount:         number
  receivedByName: string | null
  note:           string | null
}

interface TransactionsResult {
  rows:  TransactionRow[]
  total: number
}

export function useTransactions(period: 'today' | 'month', page: number) {
  return useQuery<TransactionsResult>({
    queryKey: ['transactions', period, page],
    queryFn:  () =>
      api.get(`/clinic/transactions?period=${period}&page=${page}&pageSize=20`)
         .then(r => r.data.data),
  })
}

export function useTransactionRevenue(period: 'daily' | 'monthly') {
  return useQuery<{ series: { label: string; revenue: number }[]; total: number }>({
    queryKey: ['transactions', 'revenue', period],
    queryFn:  () =>
      api.get(`/clinic/transactions/revenue-series?period=${period}`)
         .then(r => r.data.data),
  })
}
