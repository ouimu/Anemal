import { Request, Response } from 'express'
import {
  createAppointmentSchema, walkInSchema, statusSchema,
  listAppointments, getAppointment, createAppointment, createWalkIn, updateStatus,
  AppointmentError,
} from '../services/appointmentService'

function handleError(res: Response, err: unknown) {
  if (err instanceof AppointmentError) return res.status(err.statusCode).json({ success: false, error: err.message })
  res.status(500).json({ success: false, error: 'Internal server error' })
}

export async function handleListAppointments(req: Request, res: Response) {
  try {
    const date     = req.query.date     as string | undefined
    const doctorId = req.query.doctorId ? parseInt(String(req.query.doctorId)) : undefined
    const week     = req.query.week === 'true'
    const data     = await listAppointments(req.context!.tenantId, date, doctorId, week)
    res.json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleGetAppointment(req: Request, res: Response) {
  try {
    const data = await getAppointment(req.context!.tenantId, parseInt(req.params.id))
    res.json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleCreateAppointment(req: Request, res: Response) {
  const parsed = createAppointmentSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const data = await createAppointment(req.context!.tenantId, parsed.data)
    res.status(201).json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleWalkIn(req: Request, res: Response) {
  const parsed = walkInSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const data = await createWalkIn(req.context!.tenantId, parsed.data.petId, parsed.data.doctorId, parsed.data.reason)
    res.status(201).json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleUpdateStatus(req: Request, res: Response) {
  const parsed = statusSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const data = await updateStatus(req.context!.tenantId, parseInt(req.params.id), parsed.data.status)
    res.json({ success: true, data })
  } catch (err) { handleError(res, err) }
}
