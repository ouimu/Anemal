import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/blood-bank.controller'
import { donorSchema, collectionSchema, transfusionSchema } from '../services/blood-bank.service'

const router = Router()
router.use(authMiddleware)

router.get('/donors', ctrl.listDonors)
router.post('/donors', validate(donorSchema), ctrl.registerDonor)
router.get('/collections', ctrl.listBags)
router.post('/collections', validate(collectionSchema), ctrl.recordCollection)
router.get('/transfusions', ctrl.listTransfusions)
router.post('/transfusions', validate(transfusionSchema), ctrl.recordTransfusion)

export default router
