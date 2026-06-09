// Branch + doctor-shift controller (admin). Thin handlers.
import { Request, Response, NextFunction } from 'express'
import * as branchService from '../services/branch.service'

export async function listBranches(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await branchService.listBranches(req.context!.tenantId) }) }
  catch (err) { next(err) }
}

export async function getBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await branchService.getBranch(req.context!.tenantId, Number(req.params.id)) }) }
  catch (err) { next(err) }
}

export async function createBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.status(201).json({ success: true, data: await branchService.createBranch(req.context!.tenantId, req.body) }) }
  catch (err) { next(err) }
}

export async function updateBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await branchService.updateBranch(req.context!.tenantId, Number(req.params.id), req.body) }) }
  catch (err) { next(err) }
}

export async function listShifts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await branchService.listShifts(req.context!.tenantId, Number(req.params.id)) }) }
  catch (err) { next(err) }
}

export async function setShift(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.status(201).json({ success: true, data: await branchService.setShift(req.context!.tenantId, Number(req.params.id), req.body) }) }
  catch (err) { next(err) }
}

export async function removeShift(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await branchService.removeShift(req.context!.tenantId, Number(req.params.id), Number(req.params.shiftId))
    res.json({ success: true })
  } catch (err) { next(err) }
}
