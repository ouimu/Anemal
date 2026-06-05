import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

// Decimal columns arrive as strings over JSON — views Number()-convert as needed.
export interface Product {
  id:            number
  name:          string
  category:      string | null
  barcode:       string | null
  unit:          string | null
  stockQuantity: string
  minStockLevel: string
  expiryDate:    string | null
  unitCost:      string | null
  unitPrice:     string | null
  isActive:      boolean
  createdAt:     string
}

export interface ProductList {
  products: Product[]
  total:    number
  page:     number
  limit:    number
}

export interface AlertItem {
  id:            number
  name:          string
  category:      string | null
  unit:          string | null
  stockQuantity: string | number
  minStockLevel: string | number
  expiryDate:    string | null
  unitPrice:     string | number | null
}

export interface InventoryAlerts {
  lowStock:          AlertItem[]
  expiringSoon:      AlertItem[]
  lowStockCount:     number
  expiringSoonCount: number
  inventoryValue:    number
  expiryWindowDays:  number
}

export interface StockMovement {
  id:            number
  itemId:        number
  movementType:  string
  qty:           string
  referenceType: string | null
  referenceId:   number | null
  notes:         string | null
  createdAt:     string
}

export const PRODUCT_CATEGORIES = ['Medicine', 'Vaccine', 'Supply', 'Food', 'Equipment', 'Grooming', 'Other'] as const

export function useProducts(params: { category?: string; search?: string; page?: number }) {
  const { category, search, page = 1 } = params
  return useQuery<ProductList>({
    queryKey: ['inventory', 'products', category ?? '', search ?? '', page],
    queryFn: () =>
      api
        .get('/api/products', { params: { category: category || undefined, search: search || undefined, page } })
        .then((r) => r.data.data),
  })
}

export function useInventoryAlerts() {
  return useQuery<InventoryAlerts>({
    queryKey: ['inventory', 'alerts'],
    queryFn: () => api.get('/api/products/alerts').then((r) => r.data.data),
  })
}

export function useProductMovements(id: number | null) {
  return useQuery<StockMovement[]>({
    queryKey: ['inventory', 'movements', id],
    enabled: !!id,
    queryFn: () => api.get(`/api/products/${id}/movements`).then((r) => r.data.data),
  })
}

function useInventoryMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  })
}

export function useCreateProduct() {
  return useInventoryMutation((data: Record<string, unknown>) => api.post('/api/products', data).then((r) => r.data))
}

export function useUpdateProduct() {
  return useInventoryMutation(({ id, ...data }: { id: number } & Record<string, unknown>) =>
    api.put(`/api/products/${id}`, data).then((r) => r.data),
  )
}

export function useStockIn() {
  return useInventoryMutation(({ id, ...data }: { id: number } & Record<string, unknown>) =>
    api.post(`/api/products/${id}/stock-in`, data).then((r) => r.data),
  )
}

export function useDeactivateProduct() {
  return useInventoryMutation((id: number) => api.delete(`/api/products/${id}`).then((r) => r.data))
}
