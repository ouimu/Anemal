import { Request, Response, NextFunction } from 'express'
import {
  listAppointments, getAppointment, createAppointment, createWalkIn, updateStatus,
  listBookableDoctors,
} from '../services/appointment.service'
import { findInRange } from '../models/appointment.repository'

function branchOf(req: Request): number | null { return req.context?.branchId ?? null }

export async function handleListAppointments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const view = req.query.view as string | undefined

    if (view === 'month') {
      const dateStr = (req.query.date as string) ?? new Date().toISOString().slice(0, 10)
      const ref = new Date(dateStr + 'T00:00:00')
      ref.setDate(1)

      // Grid start: Monday on or before the 1st
      const startDow = ref.getDay() === 0 ? 7 : ref.getDay()
      const gridStart = new Date(ref)
      gridStart.setDate(1 - (startDow - 1))
      gridStart.setHours(0, 0, 0, 0)

      // Grid end: day after the Sunday that closes the last week of the month
      const lastDay = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
      const lastDow = lastDay.getDay() === 0 ? 7 : lastDay.getDay()
      const gridEnd = new Date(lastDay)
      gridEnd.setDate(lastDay.getDate() + (7 - lastDow) + 1)
      gridEnd.setHours(0, 0, 0, 0)

      const { tenantId, branchId } = req.context!
      const data = await findInRange(tenantId, branchId, gridStart, gridEnd)
      res.json({ success: true, data })
      return
    }

    const date     = req.query.date     as string | undefined
    const doctorId = req.query.doctorId ? parseInt(String(req.query.doctorId)) : undefined
    const week     = req.query.week === 'true'
    const data     = await listAppointments(req.context!.tenantId, branchOf(req), date, doctorId, week)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleListDoctors(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await listBookableDoctors(req.context!.tenantId, branchOf(req))
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
