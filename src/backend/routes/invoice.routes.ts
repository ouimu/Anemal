import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/invoice.controller'
import { createInvoiceSchema, paymentSchema } from '../services/invoice.service'

const router = Router()
router.use(authMiddleware)

router.get('/',                 requirePlane('clinic'), requirePermission('billing.view'),    ctrl.listInvoices)
router.post('/',                requirePlane('clinic'), requirePermission('billing.create'),  validate(createInvoiceSchema), ctrl.createInvoice)
router.get('/:id/pdf',          requirePlane('clinic'), requirePermission('billing.view'),    ctrl.downloadInvoicePdf)
router.get('/:id/promptpay-qr', requirePlane('clinic'), requirePermission('billing.view'),    ctrl.generatePromptpayQr)
router.get('/:id',              requirePlane('clinic'), requirePermission('billing.view'),    ctrl.getInvoice)
router.put('/:id/payment',      requirePlane('clinic'), requirePermission('billing.payment'), validate(paymentSchema), ctrl.recordPayment)

export default router
