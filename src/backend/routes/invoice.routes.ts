import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/invoice.controller'
import { createInvoiceSchema, paymentSchema } from '../services/invoice.service'

const router = Router()
router.use(authMiddleware)

router.get('/', ctrl.listInvoices)
router.post('/', validate(createInvoiceSchema), ctrl.createInvoice)
router.get('/:id/pdf', ctrl.downloadInvoicePdf)
router.get('/:id/promptpay-qr', ctrl.generatePromptpayQr)
router.get('/:id', ctrl.getInvoice)
router.put('/:id/payment', validate(paymentSchema), ctrl.recordPayment)

export default router
