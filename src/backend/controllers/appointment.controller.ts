import { Request, Response, NextFunction } from 'express'
import {
  listAppointments, getAppointment, createAppointment, createWalkIn, updateStatus,
} from '../services/appointment.service'

function branchOf(req: Request): number | null { return req.context?.branchId ?? null }

export async function handleListAppointments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const date     = req.query.date     as string | undefined
    const doctorId = req.query.doctorId ? parseInt(String(req.query.doctorId)) : undefined
    const week     = req.query.week === 'true'
    const data     = await listAppointments(req.context!.tenantId, branchOf(req), date, doctorId, week)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleGetAppointment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await getAppointment(req.context!.tenantId, branchOf(req), parseInt(req.params.id))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleCreateAppointment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await createAppointment(req.context!.tenantId, branchOf(req), req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleWalkIn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { petId, doctorId, reason } = req.body
    const data = await createWalkIn(req.context!.tenantId, branchOf(req), petId, doctorId, reason)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleUpdateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await updateStatus(req.context!.tenantId, branchOf(req), parseInt(req.params.id), req.body.status)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
