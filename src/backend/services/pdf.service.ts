// PDF generation service — invoice receipts + prescription slips via pdfkit.
import path from 'path'
import PDFDocument from 'pdfkit'
import { AppError } from '../utils/errors'
import * as invoiceRepo from '../models/invoice.repository'
import * as prescriptionRepo from '../models/prescription.repository'

const FONT_PATH = path.join(__dirname, '../assets/fonts/NotoSansThai-Regular.ttf')
const PRIMARY = '#000000'
const MUTED   = '#45464d'
const PAGE_W  = 595.28
const MARGIN  = 50
const COL_W   = PAGE_W - MARGIN * 2

export class PdfError extends AppError {
  constructor(message: string, statusCode = 500) {
    super(statusCode, message, 'PDF_ERROR')
  }
}

function buildBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end',  () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}

const baht = (n: number) =>
  '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function hRule(doc: PDFKit.PDFDocument, y: number): void {
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor('#c6c6cd').lineWidth(0.5).stroke()
}

function row2(
  doc: PDFKit.PDFDocument,
  y: number,
  left: string,
  right: string,
  opts: { bold?: boolean; large?: boolean } = {},
): void {
  const sz = opts.large ? 13 : 11
  doc.font(FONT_PATH).fontSize(sz).fillColor(opts.bold ? PRIMARY : MUTED)
  doc.text(left,  MARGIN, y, { width: COL_W * 0.7 })
  doc.text(right, MARGIN + COL_W * 0.7, y, { width: COL_W * 0.3, align: 'right' })
}

// ─── Invoice PDF ─────────────────────────────────────────────────────────────

export async function generateInvoicePdf(tenantId: number, invoiceId: number): Promise<Buffer> {
  const inv = await invoiceRepo.findInvoiceById(tenantId, invoiceId)
  if (!inv) throw new PdfError('Invoice not found', 404)

  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: inv.invoiceNo } })
  doc.registerFont('NotoThai', FONT_PATH)
  doc.font('NotoThai')

  let y = MARGIN

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.fontSize(22).fillColor(PRIMARY).text('Anemal', MARGIN, y, { continued: false })
  doc.fontSize(9).fillColor(MUTED)
  doc.text('Tax Invoice / Receipt', MARGIN, y + 26)

  const issuedStr = new Date(inv.issuedAt).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  doc.fontSize(9).fillColor(MUTED)
  doc.text(inv.invoiceNo, PAGE_W - MARGIN - 160, y, { width: 160, align: 'right' })
  doc.text(issuedStr,     PAGE_W - MARGIN - 160, y + 14, { width: 160, align: 'right' })

  y += 50
  hRule(doc, y)
  y += 12

  // ── Bill To ──────────────────────────────────────────────────────────────────
  doc.fontSize(8).fillColor(MUTED).text('BILL TO', MARGIN, y)
  y += 13
  const petName   = inv.pet?.name ?? '—'
  const ownerName = inv.pet?.owner
    ? `${inv.pet.owner.firstName} ${inv.pet.owner.lastName}`
    : '—'
  const phone     = inv.pet?.owner?.phone ?? ''
  doc.fontSize(11).fillColor(PRIMARY).text(petName,   MARGIN, y)
  doc.fontSize(10).fillColor(MUTED)  .text(ownerName, MARGIN, y + 14)
  if (phone) doc.fontSize(9).fillColor(MUTED).text(phone, MARGIN, y + 26)
  y += phone ? 46 : 34

  hRule(doc, y)
  y += 10

  // ── Items table header ───────────────────────────────────────────────────────
  doc.fontSize(8).fillColor(MUTED)
  doc.text('DESCRIPTION', MARGIN,              y)
  doc.text('QTY',         MARGIN + COL_W * 0.62, y, { width: 50, align: 'right' })
  doc.text('UNIT PRICE',  MARGIN + COL_W * 0.73, y, { width: 70, align: 'right' })
  doc.text('TOTAL',       MARGIN + COL_W * 0.85, y, { width: COL_W * 0.15, align: 'right' })
  y += 14
  hRule(doc, y)
  y += 8

  // ── Items rows ───────────────────────────────────────────────────────────────
  const items = inv.items ?? []
  for (const item of items) {
    const qty      = Number(item.quantity)
    const unit     = Number(item.unitPrice)
    const total    = Number(item.totalPrice)
    doc.fontSize(10).fillColor(PRIMARY)
    doc.text(item.description, MARGIN, y, { width: COL_W * 0.60 })
    doc.text(String(qty),      MARGIN + COL_W * 0.62, y, { width: 50, align: 'right' })
    doc.text(baht(unit),       MARGIN + COL_W * 0.73, y, { width: 70, align: 'right' })
    doc.text(baht(total),      MARGIN + COL_W * 0.85, y, { width: COL_W * 0.15, align: 'right' })
    y += 18
  }

  y += 4
  hRule(doc, y)
  y += 10

  // ── Totals block ─────────────────────────────────────────────────────────────
  const subtotal    = Number(inv.subtotal)
  const discount    = Number(inv.discount)
  const taxRate     = Number(inv.taxRate)
  const taxAmount   = Number(inv.taxAmount)
  const totalAmount = Number(inv.totalAmount)

  row2(doc, y,      'Subtotal',               baht(subtotal))
  y += 16
  if (discount > 0) {
    row2(doc, y, `Discount${inv.discountReason ? ` (${inv.discountReason})` : ''}`, `-${baht(discount)}`)
    y += 16
  }
  row2(doc, y, `VAT ${taxRate}%`, baht(taxAmount))
  y += 16
  hRule(doc, y)
  y += 8
  row2(doc, y, 'Total', baht(totalAmount), { bold: true, large: true })
  y += 22

  // ── Payment info ─────────────────────────────────────────────────────────────
  if (inv.paymentStatus === 'paid' && inv.paymentMethod) {
    const method  = inv.paymentMethod.replace(/_/g, ' ')
    const paidAt  = inv.paidAt ? new Date(inv.paidAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
    doc.fontSize(9).fillColor(MUTED).text(`Paid by ${method}${paidAt ? ` · ${paidAt}` : ''}`, MARGIN, y)
    y += 16
  }

  if (inv.notes) {
    doc.fontSize(9).fillColor(MUTED).text(`Notes: ${inv.notes}`, MARGIN, y)
    y += 16
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  doc.fontSize(9).fillColor(MUTED).text('Thank you for choosing Anemal', MARGIN, 800, {
    width: COL_W, align: 'center',
  })

  return buildBuffer(doc)
}

// ─── Prescription Slip PDF ───────────────────────────────────────────────────

export async function generatePrescriptionPdf(tenantId: number, prescriptionId: number): Promise<Buffer> {
  const rx = await prescriptionRepo.findPrescriptionWithDetails(tenantId, prescriptionId)
  if (!rx) throw new PdfError('Prescription not found', 404)

  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: `Prescription #${rx.id}` } })
  doc.registerFont('NotoThai', FONT_PATH)
  doc.font('NotoThai')

  let y = MARGIN

  // ── Header ───────────────────────────────────────────────────────────────────
  doc.fontSize(20).fillColor(PRIMARY).text('Anemal', MARGIN, y)
  doc.fontSize(11).fillColor(MUTED).text('Prescription Slip', MARGIN, y + 24)
  y += 46
  hRule(doc, y)
  y += 12

  // ── Patient info ─────────────────────────────────────────────────────────────
  const pet   = rx.medicalRecord?.pet
  const owner = pet?.owner
  const visitDate = new Date(rx.medicalRecord?.createdAt ?? rx.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  doc.fontSize(8).fillColor(MUTED).text('PATIENT', MARGIN, y)
  y += 13
  doc.fontSize(11).fillColor(PRIMARY).text(pet?.name ?? '—', MARGIN, y)
  if (pet?.species) doc.fontSize(9).fillColor(MUTED).text(pet.species, MARGIN, y + 14)
  const ownerName = owner ? `${owner.firstName} ${owner.lastName}` : ''
  if (ownerName) doc.fontSize(9).fillColor(MUTED).text(`Owner: ${ownerName}`, MARGIN, y + 26)
  doc.fontSize(9).fillColor(MUTED).text(`Visit date: ${visitDate}`, MARGIN, y + 38)
  y += 56

  hRule(doc, y)
  y += 10

  // ── Prescription table ───────────────────────────────────────────────────────
  doc.fontSize(8).fillColor(MUTED)
  doc.text('DRUG',        MARGIN,              y)
  doc.text('QTY',         MARGIN + COL_W * 0.55, y, { width: 50, align: 'right' })
  doc.text('UNIT',        MARGIN + COL_W * 0.68, y, { width: 60, align: 'right' })
  doc.text('DIRECTIONS',  MARGIN + COL_W * 0.80, y, { width: COL_W * 0.20, align: 'left' })
  y += 14
  hRule(doc, y)
  y += 8

  const qty      = Number(rx.quantity)
  const drugName = rx.drug?.name ?? '—'
  const unit     = rx.unit ?? rx.drug?.unit ?? ''
  const dosage   = rx.dosageInstruction ?? ''

  doc.fontSize(10).fillColor(PRIMARY)
  doc.text(drugName, MARGIN, y, { width: COL_W * 0.53 })
  doc.text(String(qty), MARGIN + COL_W * 0.55, y, { width: 50, align: 'right' })
  doc.text(unit,        MARGIN + COL_W * 0.68, y, { width: 60, align: 'right' })
  if (dosage) doc.text(dosage, MARGIN + COL_W * 0.80, y, { width: COL_W * 0.20 })
  y += 22

  hRule(doc, y)
  y += 16

  // ── Disclaimer ───────────────────────────────────────────────────────────────
  doc.fontSize(8).fillColor(MUTED)
  doc.text('Keep out of reach of children. Store in a cool, dry place. Follow dosage as instructed.', MARGIN, y, { width: COL_W })

  // ── Footer ───────────────────────────────────────────────────────────────────
  doc.fontSize(8).fillColor(MUTED).text('Anemal — Compassionate Care', MARGIN, 800, {
    width: COL_W, align: 'center',
  })

  return buildBuffer(doc)
}
