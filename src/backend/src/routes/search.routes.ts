import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { handleSearch } from '../controllers/search.controller'

const router = Router()
router.use(authMiddleware)
router.get('/', handleSearch)

export default router
