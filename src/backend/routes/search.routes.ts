import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { handleSearch } from '../controllers/search.controller'

const router = Router()
router.use(authMiddleware)

router.get('/', requirePlane('clinic'), requirePermission('crm.view'), handleSearch)

export default router
