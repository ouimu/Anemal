import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { handleSearch } from '../controllers/searchController'

const router = Router()
router.use(authMiddleware)
router.get('/', handleSearch)

export default router
