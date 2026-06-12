import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import { handlePresign } from '../controllers/upload.controller'
import { presignSchema } from '../services/upload.service'

const router = Router()
router.use(authMiddleware)

router.post('/presign', validate(presignSchema), handlePresign)

export default router
