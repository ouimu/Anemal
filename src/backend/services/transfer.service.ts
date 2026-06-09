// Inventory transfer service (Phase 4).
import { z } from 'zod'
import { AppError } from '../utils/errors'
import prisma from '../config/db'
import * as transferRepo from '../models/transfer.repository'

export const createTransferSchema = z.object({
  productId:    z.number().int().positive(),
  fromBranchId: z.number().int().positive(),
  toBranchId:   z.number().int().positive(),
  qty:          z.number().positive(),
  notes:        z.string().max(500).optional().nullable(),
}).strict().refine((d) => d.fromBranchId !== d.toBranchId, {
  message: 'Source and destination branches must differ', path: ['toBranchId'],
})

export type CreateTransferInput = z.infer<typeof createTransferSchema>

export class TransferError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'TRANSFER_ERROR')
  }
}

export async function createTransfer(tenantId: number, data: CreateTransferInput, performedBy?: number) {
  const branchCount = await prisma.branch.count({
    where: { tenantId, id: { in: [data.fromBranchId, data.toBranchId] } },
  })
  if (branchCount !== 2) throw new TransferError('Branch not found', 404)

  const product = await prisma.inventoryItem.findFirst({ where: { id: data.productId, tenantId } })
  if (!product) throw new TransferError('Product not found', 404)

  return transferRepo.createTransfer(tenantId, data, performedBy)
}

export function listTransfers(tenantId: number, branchId?: number) {
  return transferRepo.listTransfers(tenantId, branchId)
}
