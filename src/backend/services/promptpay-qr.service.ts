// PromptPay QR code generation service.
// Reads invoice amount from DB (server-authoritative — never from request body).
// Returns a base64 PNG data URI suitable for embedding in <img src="..." />.
import generatePayload from 'promptpay-qr'
import QRCode from 'qrcode'
import prisma from '../config/db'
import { getOrCreateSettings } from '../models/tenant-settings.repository'
import { AppError } from '../utils/errors'

export async function generatePromptpayQr(
  tenantId: number, branchId: number | null | undefined, invoiceId: number,
): Promise<string> {
  if (!invoiceId || invoiceId <= 0) {
    throw new AppError(400, 'Invalid invoice ID', 'INVALID_INVOICE_ID')
  }

  // Tenant + branch isolated invoice fetch (HI-01) — returns null if invoiceId belongs
  // to a different tenant, or (for a branch-scoped session) a different branch.
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      tenantId,
      ...(branchId != null ? { branchId } : {}),
    },
    select: { totalAmount: true, paymentStatus: true },
  })
  if (!invoice) throw new AppError(404, 'Invoice not found', 'NOT_FOUND')

  if (invoice.paymentStatus === 'void' || invoice.paymentStatus === 'refunded') {
    throw new AppError(422, 'Cannot generate QR for a voided or refunded invoice', 'INVOICE_VOID_OR_REFUNDED')
  }

  const settings = await getOrCreateSettings(tenantId)
  if (!settings.promptpayId) {
    throw new AppError(422, 'PromptPay ID not configured for this clinic', 'PROMPTPAY_ID_NOT_CONFIGURED')
  }

  // Handle Prisma Decimal (has .toNumber()) or plain number/string.
  const amount =
    typeof invoice.totalAmount === 'object' && 'toNumber' in (invoice.totalAmount as object)
      ? (invoice.totalAmount as { toNumber(): number }).toNumber()
      : Number(invoice.totalAmount)

  const payload = generatePayload(settings.promptpayId, { amount })

  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    width: 300,
    margin: 2,
  })
}
