import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

import authRoutes from './routes/authRoutes'
import userRoutes from './routes/userRoutes'
import adminRoutes from './routes/adminRoutes'
import clinicRoutes from './routes/clinicRoutes'
import ownerRoutes from './routes/ownerRoutes'
import petRoutes from './routes/petRoutes'
import searchRoutes from './routes/searchRoutes'
import appointmentRoutes from './routes/appointmentRoutes'
import medicalRecordRoutes from './routes/medicalRecordRoutes'
import prescriptionRoutes from './routes/prescriptionRoutes'
import vaccinationRoutes from './routes/vaccinationRoutes'
import { notFound, errorHandler } from './middlewares/errorHandler'

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
