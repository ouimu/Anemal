import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/product.controller'
import { createProductSchema, updateProductSchema, stockInSchema } from '../services/product.service'

const router = Router()
router.use(authMiddleware)

// Static routes before /:id so they are not captured as an id.
router.get('/alerts', ctrl.getAlerts)
router.get('/', ctrl.listProducts)
router.post('/', validate(createProductSchema), ctrl.createProduct)

router.get('/:id', ctrl.getProduct)
router.put('/:id', validate(updateProductSchema), ctrl.updateProduct)
router.post('/:id/stock-in', validate(stockInSchema), ctrl.stockIn)
router.get('/:id/movements', ctrl.getMovements)
router.delete('/:id', ctrl.deactivateProduct)

export default router
