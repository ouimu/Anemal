import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

import authRoutes from './routes/auth.routes'
import userRoutes from './routes/user.routes'
import adminRoutes from './routes/admin.routes'
import clinicRoutes from './routes/clinic.routes'
import ownerRoutes from './routes/owner.routes'
import petRoutes from './routes/pet.routes'
import searchRoutes from './routes/search.routes'
import appointmentRoutes from './routes/appointment.routes'
import medicalRecordRoutes from './routes/medical-record.routes'
import prescriptionRoutes from './routes/prescription.routes'
import vaccinationRoutes from './routes/vaccination.routes'
import { notFound, errorHandler } from './middlewares/error-handler.middleware'

const app = express()

// Security & parsing
app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }))
app.use(express.json())

// Health check — no auth required
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// Routes
app.use('/auth',            authRoutes)
app.use('/users',           userRoutes)
app.use('/admin',           adminRoutes)
app.use('/clinic',          clinicRoutes)
app.use('/api/owners',      ownerRoutes)
app.use('/api/pets',        petRoutes)
app.use('/api/search',      searchRoutes)
app.use('/api/appointments',appointmentRoutes)
app.use('/api/medical-records', medicalRecordRoutes)
app.use('/api/prescriptions',   prescriptionRoutes)
app.use('/api/vaccinations',    vaccinationRoutes)

// 404 fallback + global error handler (must be last)
app.use(notFound)
app.use(errorHandler)

export default app
