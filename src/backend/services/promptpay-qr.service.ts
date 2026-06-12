// PromptPay QR code generation service.
// Reads invoice amount from DB (server-authoritative — never from request body).
// Returns a base64 PNG data URI suitable for embedding in <img src="..." />.
import generatePayload from 'promptpay-qr'
import QRCode from 'qrcode'
import prisma from '../config/db'
import { getOrCreateSettings } from '../models/tenant-settings.repository'

export async function generatePromptpayQr(tenantId: number, invoiceId: number): Promise<string> {
  if (!invoiceId || invoiceId <= 0) {
    throw Object.assign(new Error('Invalid invoice ID'), { status: 400 })
  }

  // Tenant-isolated invoice fetch — returns null if invoiceId belongs to a different tenant.
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId, tenantId },
    select: { totalAmount: true, paymentStatus: true },
  })
  if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 })

  if (invoice.paymentStatus === 'void' || invoice.paymentStatus === 'refunded') {
    throw Object.assign(new Error('Cannot generate QR for a voided or refunded invoice'), { status: 422 })
  }

  const settings = await getOrCreateSettings(tenantId)
  if (!settings.promptpayId) {
    throw Object.assign(new Error('PromptPay ID not configured for this clinic'), { status: 422 })
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
