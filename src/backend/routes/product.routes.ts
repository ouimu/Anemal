import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/product.controller'
import { createProductSchema, updateProductSchema, stockInSchema } from '../services/product.service'

const router = Router()
router.use(authMiddleware)

// Static routes before /:id so they are not captured as an id.
router.get('/alerts',        requirePlane('clinic'), requirePermission('inventory.view'),   ctrl.getAlerts)
router.get('/',              requirePlane('clinic'), requirePermission('inventory.view'),   ctrl.listProducts)
router.post('/',             requirePlane('clinic'), requirePermission('inventory.create'), validate(createProductSchema), ctrl.createProduct)

router.get('/:id',           requirePlane('clinic'), requirePermission('inventory.view'),   ctrl.getProduct)
router.put('/:id',           requirePlane('clinic'), requirePermission('inventory.edit'),   validate(updateProductSchema), ctrl.updateProduct)
router.post('/:id/stock-in', requirePlane('clinic'), requirePermission('inventory.adjust'), validate(stockInSchema), ctrl.stockIn)
router.get('/:id/movements', requirePlane('clinic'), requirePermission('inventory.view'),   ctrl.getMovements)
router.delete('/:id',        requirePlane('clinic'), requirePermission('inventory.edit'),   ctrl.deactivateProduct)

export default router
