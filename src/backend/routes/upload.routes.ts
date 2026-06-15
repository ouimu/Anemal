import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import { handlePresign } from '../controllers/upload.controller'
import { presignSchema } from '../services/upload.service'

const router = Router()
router.use(authMiddleware)

router.post('/presign', requirePlane('clinic'), requirePermission('crm.edit'), validate(presignSchema), handlePresign)

export default router
